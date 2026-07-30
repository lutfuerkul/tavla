// The server side of an online game: it hands out rooms, throws the dice and
// decides whether a turn was legal. Clients read the match and draw it; they
// write nothing. That division is the whole design — a client that could write
// to a match could deal itself a double six and move its checkers anywhere.
//
// The rules it judges by are the same file the board plays by, copied here
// because Firebase deploys this folder on its own. kural-esitligi.mjs makes
// sure the copy has not drifted, and firebase.json runs it before every deploy.

import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomInt } from "node:crypto";
import * as Rules from "./rules.js";

initializeApp();
const db = getFirestore();

// Everything lives in one region, near the players it was written for.
const REGION = "europe-west1";
const settings = { region: REGION, cors: true };

const MATCH_TARGET = 3;
// How long somebody who is sitting there may take. A player who is present
// but not playing is given room to think; one who is not there at all is not
// waited for at all — the computer takes their checkers the moment their seat
// is empty and gives them straight back when they sit down again.
const ROLL_SECONDS = 20;
const MOVE_SECONDS = 60;
// The opening keeps no time at all. Nobody is thinking yet — they have just
// sat down, and the first thing asked of them is a die that decides nothing
// but who goes first. Taking that throw away from somebody who is still
// finding the board buys nothing and reads as the game throwing dice by
// itself, so it waits for them however long they take.
//
// An empty chair is a different matter and is still covered: somebody who has
// gone would otherwise leave the opening unfinished for good.
const OPEN_SECONDS = Infinity;
// And how long before the other player is told they are not coming back.
const GONE_SECONDS = 180;
// Long enough that two rooms are never open on the same code, short enough to
// read down a telephone. I, O, 0 and 1 are left out: they are the letters
// people get wrong.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;
const ROOM_MINUTES = 20;

const now = () => FieldValue.serverTimestamp();
const d6 = () => randomInt(1, 7);

function code() {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

function whoIsAsking(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Önce giriş yapılmalı.");
  return uid;
}

// A match as it is written down. The position is the rules engine's own shape
// with the points array flattened, since Firestore will not store nested
// arrays: every point becomes a key on an object and the empty ones are left
// out entirely.
function packPosition(pos) {
  const points = {};
  pos.points.forEach((stack, point) => {
    if (stack) points[String(point)] = { colour: stack.colour, count: stack.count };
  });
  return { points, bar: { ...pos.bar }, off: { ...pos.off } };
}

function unpackPosition(packed) {
  const points = Array.from({ length: 25 }, () => null);
  for (const [point, stack] of Object.entries(packed.points ?? {})) {
    points[Number(point)] = { colour: stack.colour, count: stack.count };
  }
  return { points, bar: { ...packed.bar }, off: { ...packed.off } };
}

function freshMatch(players) {
  return {
    players,
    // Which of them is which colour was settled when the room was made.
    pos: packPosition(Rules.startingPosition()),
    phase: "opening",
    opening: { ivory: null, black: null },
    waitingOn: "black",
    turn: "black",
    dice: null,
    remaining: [],
    required: 0,
    played: 0,
    lastMoves: [],
    // Who played them. Whose turn it is is not enough to tell: a game is won
    // on the winner's own turn and the turn stays with them, so a client
    // reading "their turn, and moves on the board" would replay the winner's
    // own moves back at them in the other colour.
    lastBy: null,
    score: { ivory: 0, black: 0 },
    target: MATCH_TARGET,
    over: null,
    seq: 0,
    createdAt: now(),
    updatedAt: now(),
  };
}

const colourOf = (match, uid) =>
  match.players.black === uid ? "black" : match.players.ivory === uid ? "ivory" : null;

// --- rooms ------------------------------------------------------------

export const odaKur = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const wants = request.data?.colour === "ivory" ? "ivory" : "black";

  // A code nobody else is holding. Five characters out of thirty two is
  // thirty three million, so a clash is a curiosity rather than a problem —
  // but it is still checked, inside a transaction, because a room handed to
  // two hosts is a game neither of them can play.
  for (let attempt = 0; attempt < 8; attempt++) {
    const wanted = code();
    const room = db.collection("rooms").doc(wanted);
    const taken = await db.runTransaction(async tx => {
      const found = await tx.get(room);
      if (found.exists) return true;
      tx.set(room, {
        host: uid,
        hostColour: wants,
        status: "waiting",
        matchId: null,
        createdAt: now(),
        expiresAt: new Date(Date.now() + ROOM_MINUTES * 60 * 1000),
      });
      return false;
    });
    if (!taken) return { code: wanted, colour: wants };
  }
  throw new HttpsError("resource-exhausted", "Oda kodu üretilemedi, tekrar dene.");
});

export const odayaKatil = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const wanted = String(request.data?.code ?? "").trim().toUpperCase();
  if (!/^[A-Z2-9]{5}$/.test(wanted)) {
    throw new HttpsError("invalid-argument", "Oda kodu beş harf olmalı.");
  }

  const room = db.collection("rooms").doc(wanted);
  const match = db.collection("matches").doc();

  const answer = await db.runTransaction(async tx => {
    const found = await tx.get(room);
    if (!found.exists) return { error: "not-found" };
    const it = found.data();
    // Coming back to a room that has already been paired is not an error: it
    // is what happens when a player reloads. They are sent to their match.
    if (it.status === "matched") {
      const other = it.hostColour === "black" ? "ivory" : "black";
      if (it.host === uid) return { matchId: it.matchId, colour: it.hostColour };
      if (it.guest === uid) return { matchId: it.matchId, colour: other };
      return { error: "full" };
    }
    if (it.host === uid) return { error: "own-room" };
    if (it.expiresAt?.toDate?.() < new Date()) return { error: "expired" };

    const players = it.hostColour === "black"
      ? { black: it.host, ivory: uid }
      : { ivory: it.host, black: uid };
    tx.set(match, freshMatch(players));
    tx.update(room, { status: "matched", guest: uid, matchId: match.id });
    // Which colour the one arriving is playing is the server's to say, not
    // something the client should have to work out from what it asked for.
    return { matchId: match.id, colour: it.hostColour === "black" ? "ivory" : "black" };
  });

  if (answer.error === "not-found") throw new HttpsError("not-found", "Böyle bir oda yok.");
  if (answer.error === "expired") throw new HttpsError("deadline-exceeded", "Odanın süresi dolmuş.");
  if (answer.error === "full") throw new HttpsError("failed-precondition", "Oda dolu.");
  if (answer.error === "own-room") throw new HttpsError("failed-precondition", "Bu senin odan.");
  return answer;
});

// The host waits on their own room rather than polling: the client listens to
// the room document and this is what tells it which match to open. Kept as a
// call as well so a client that has lost its listener can ask outright.
export const odayaBak = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const wanted = String(request.data?.code ?? "").trim().toUpperCase();
  const found = await db.collection("rooms").doc(wanted).get();
  if (!found.exists) throw new HttpsError("not-found", "Böyle bir oda yok.");
  const it = found.data();
  if (it.host !== uid && it.guest !== uid) {
    throw new HttpsError("permission-denied", "Bu oda senin değil.");
  }
  return { status: it.status, matchId: it.matchId ?? null };
});

// --- the turn ---------------------------------------------------------

// One die each to open, the pair once somebody has started. The numbers are
// drawn here and nowhere else: each an even one in six from the platform's own
// generator, independent of the last throw and of who is winning.
export const zarAt = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const id = String(request.data?.matchId ?? "");
  const ref = db.collection("matches").doc(id);

  return db.runTransaction(async tx => {
    const found = await tx.get(ref);
    if (!found.exists) throw new HttpsError("not-found", "Maç bulunamadı.");
    const match = found.data();
    const mine = colourOf(match, uid);
    if (!mine) throw new HttpsError("permission-denied", "Bu maç senin değil.");
    if (match.over) throw new HttpsError("failed-precondition", "Maç bitti.");

    if (match.phase === "opening") {
      if (match.waitingOn !== mine) {
        throw new HttpsError("failed-precondition", "Sıra sende değil.");
      }
      const value = d6();
      const opening = { ...match.opening, [mine]: value };
      const patch = { opening, updatedAt: now(), seq: match.seq + 1 };

      if (opening.ivory === null || opening.black === null) {
        patch.waitingOn = opening.black === null ? "black" : "ivory";
      } else if (opening.ivory === opening.black) {
        // A tie is thrown again, from the top.
        patch.opening = { ivory: null, black: null };
        patch.waitingOn = "black";
      } else {
        // The opening die only settles who goes first; the winner throws their
        // own pair for the turn rather than playing the two as they lie.
        patch.phase = "play";
        patch.waitingOn = null;
        patch.turn = opening.black > opening.ivory ? "black" : "ivory";
        patch.dice = null;
        patch.remaining = [];
      }
      tx.update(ref, patch);
      return { dice: [value] };
    }

    if (match.turn !== mine) throw new HttpsError("failed-precondition", "Sıra sende değil.");
    if (match.dice) throw new HttpsError("failed-precondition", "Zar zaten atıldı.");

    const dice = [d6(), d6()];
    const remaining = Rules.diceFor(dice[0], dice[1]);
    const pos = unpackPosition(match.pos);
    const legal = Rules.legalSequences(pos, mine, remaining);
    tx.update(ref, {
      dice,
      remaining,
      required: legal[0].length,
      played: 0,
      lastMoves: [],
      lastBy: null,
      updatedAt: now(),
      seq: match.seq + 1,
    });
    return { dice };
  });
});

// A whole turn arrives at once — the board keeps it locally until Tamam is
// pressed, which is also the moment it can be judged as a whole. What is
// checked is not only that each move was legal in turn but that the turn used
// as many dice as the rules oblige: taking one die when both could be played
// is not a shorter turn, it is an illegal one.
export const turuOyna = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const id = String(request.data?.matchId ?? "");
  const moves = Array.isArray(request.data?.moves) ? request.data.moves : [];
  const ref = db.collection("matches").doc(id);

  return db.runTransaction(async tx => {
    const found = await tx.get(ref);
    if (!found.exists) throw new HttpsError("not-found", "Maç bulunamadı.");
    const match = found.data();
    const mine = colourOf(match, uid);
    if (!mine) throw new HttpsError("permission-denied", "Bu maç senin değil.");
    if (match.over) throw new HttpsError("failed-precondition", "Maç bitti.");
    if (match.phase !== "play") throw new HttpsError("failed-precondition", "Sıra açılışta.");
    if (match.turn !== mine) throw new HttpsError("failed-precondition", "Sıra sende değil.");
    if (!match.dice) throw new HttpsError("failed-precondition", "Önce zar atılmalı.");

    let pos = unpackPosition(match.pos);
    let remaining = match.remaining.slice();

    for (const move of moves) {
      const allowed = Rules.movesAvailable(pos, mine, remaining)
        .find(can => String(can.from) === String(move.from)
                  && String(can.to) === String(move.to)
                  && can.die === move.die);
      if (!allowed) throw new HttpsError("failed-precondition", "Bu hamle oynanamaz.");
      pos = Rules.applyMove(pos, mine, allowed);
      remaining.splice(remaining.indexOf(allowed.die), 1);
    }

    // As many as the rules oblige, no fewer.
    if (moves.length < match.required) {
      throw new HttpsError("failed-precondition", "Oynanabilecek zar kaldı.");
    }
    // And nothing left that could still be played.
    if (Rules.movesAvailable(pos, mine, remaining).length) {
      throw new HttpsError("failed-precondition", "Oynanabilecek hamle kaldı.");
    }

    const patch = {
      pos: packPosition(pos),
      lastMoves: moves,
      lastBy: mine,
      dice: null,
      remaining: [],
      required: 0,
      played: 0,
      updatedAt: now(),
      seq: match.seq + 1,
    };

    const won = Rules.winner(pos);
    if (won) {
      const value = Rules.gameValue(pos);
      const score = { ...match.score, [won]: match.score[won] + value };
      patch.score = score;
      patch.over = { winner: won, value };
      patch.matchOver = score[won] >= match.target ? won : null;
    } else {
      patch.turn = Rules.other(mine);
    }

    tx.update(ref, patch);
    return { ok: true, over: patch.over ?? null };
  });
});

// --- the clock ---------------------------------------------------------
//
// Nothing here runs on its own: a function is only awake while it is being
// called. That is enough, because the one person who minds that the game has
// stopped is the other player, and they are sitting in front of it. Their
// board asks; this decides. Asking is not a claim — who is where and how long
// it has been are both read here, so a client cannot talk the computer into
// taking its opponent's checkers.
const rtdb = () => getDatabase();

async function isSeated(matchId, uid) {
  const seat = await rtdb().ref(`masalar/${matchId}/${uid}`).get();
  return seat.exists();
}

// Whoever the match is waiting on, and how long they have had.
function waitingFor(match) {
  if (match.over) return null;
  if (match.phase === "opening") return { colour: match.waitingOn, seconds: OPEN_SECONDS };
  if (!match.turn) return null;
  return { colour: match.turn, seconds: match.dice ? MOVE_SECONDS : ROLL_SECONDS };
}

// One thing the absent or idle player would have done. Rolling and playing are
// separate steps so the other board sees the dice land before the checkers
// move, exactly as it would if a person were doing it.
function actFor(match, colour) {
  if (match.phase === "opening") {
    const value = d6();
    const opening = { ...match.opening, [colour]: value };
    const patch = { opening, updatedAt: now(), seq: match.seq + 1 };
    if (opening.ivory === null || opening.black === null) {
      patch.waitingOn = opening.black === null ? "black" : "ivory";
    } else if (opening.ivory === opening.black) {
      patch.opening = { ivory: null, black: null };
      patch.waitingOn = "black";
    } else {
      patch.phase = "play";
      patch.waitingOn = null;
      patch.turn = opening.black > opening.ivory ? "black" : "ivory";
      patch.dice = null;
      patch.remaining = [];
    }
    return patch;
  }

  const pos = unpackPosition(match.pos);
  if (!match.dice) {
    const dice = [d6(), d6()];
    const remaining = Rules.diceFor(dice[0], dice[1]);
    return {
      dice, remaining,
      required: Rules.legalSequences(pos, colour, remaining)[0].length,
      played: 0, lastMoves: [], lastBy: null,
      updatedAt: now(), seq: match.seq + 1,
    };
  }

  // The dice are on the board and nobody is playing them, so the same engine
  // the computer plays by picks the turn.
  const moves = Rules.chooseSequence(pos, colour, match.remaining) ?? [];
  let after = pos;
  for (const move of moves) after = Rules.applyMove(after, colour, move);

  const patch = {
    pos: packPosition(after),
    lastMoves: moves,
    lastBy: colour,
    dice: null,
    remaining: [],
    required: 0,
    played: 0,
    updatedAt: now(),
    seq: match.seq + 1,
  };
  const won = Rules.winner(after);
  if (won) {
    const value = Rules.gameValue(after);
    const score = { ...match.score, [won]: match.score[won] + value };
    patch.score = score;
    patch.over = { winner: won, value };
    patch.matchOver = score[won] >= match.target ? won : null;
  } else {
    patch.turn = Rules.other(colour);
  }
  return patch;
}

// "The other side has stopped playing." Called by the player who is waiting,
// as often as they like; it does nothing at all unless it should.
export const sure = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const id = String(request.data?.matchId ?? "");
  const ref = db.collection("matches").doc(id);

  const found = await ref.get();
  if (!found.exists) throw new HttpsError("not-found", "Maç bulunamadı.");
  const match = found.data();
  const mine = colourOf(match, uid);
  if (!mine) throw new HttpsError("permission-denied", "Bu maç senin değil.");

  const waiting = waitingFor(match);
  if (!waiting) return { acted: false };

  // Ordinarily you may not run your own clock down: a client that could would
  // be able to hand its own checkers to the computer whenever the position
  // stopped suiting it, and it is the player kept waiting who has the reason
  // to ask in the first place.
  //
  // Unless there is nobody opposite. A player who leaves takes their board
  // with them, and with it the only thing that was asking — so a game with one
  // person left in it stopped for good, whoever's turn it was. With that chair
  // empty the last player may ask about themselves, and the emptiness is read
  // here rather than claimed by the caller.
  if (waiting.colour === mine) {
    if (await isSeated(id, match.players[Rules.other(mine)])) return { acted: false };
  }

  const theirUid = match.players[waiting.colour];
  const seated = await isSeated(id, theirUid);
  const since = match.updatedAt?.toDate?.() ?? new Date(0);
  const waited = (Date.now() - since.getTime()) / 1000;

  // Somebody sitting there is given their time to think. An empty seat is not
  // waited for: the computer takes over at once and gives the checkers back
  // the moment they sit down again.
  if (seated && waited < waiting.seconds) return { acted: false, seated: true };

  return db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    const it = fresh.data();
    // It has moved on since it was read; whoever moved it is playing.
    if (it.seq !== match.seq) return { acted: false };

    const patch = actFor(it, waiting.colour);
    // How long the seat has been empty, so the other board can say why the
    // computer is playing rather than leaving them to guess.
    if (!seated) {
      const emptyFor = it.awaySince?.[waiting.colour]
        ? (Date.now() - it.awaySince[waiting.colour].toDate().getTime()) / 1000
        : 0;
      patch.away = waiting.colour;
      patch.gone = emptyFor >= GONE_SECONDS ? waiting.colour : (it.gone ?? null);
      if (!it.awaySince?.[waiting.colour]) {
        patch.awaySince = { ...(it.awaySince ?? {}), [waiting.colour]: now() };
      }
    } else {
      patch.away = null;
      patch.gone = null;
      patch.awaySince = {};
    }
    tx.update(ref, patch);
    return { acted: true, by: waiting.colour, seated };
  });
});

// The player is back at the table: whatever was said about them being gone is
// withdrawn, and the computer stops playing their checkers.
export const geriGeldim = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const id = String(request.data?.matchId ?? "");
  const ref = db.collection("matches").doc(id);
  return db.runTransaction(async tx => {
    const found = await tx.get(ref);
    if (!found.exists) throw new HttpsError("not-found", "Maç bulunamadı.");
    const match = found.data();
    const mine = colourOf(match, uid);
    if (!mine) throw new HttpsError("permission-denied", "Bu maç senin değil.");
    if (match.away !== mine && match.gone !== mine) return { ok: true };
    tx.update(ref, {
      away: match.away === mine ? null : match.away ?? null,
      gone: match.gone === mine ? null : match.gone ?? null,
      awaySince: {},
      updatedAt: now(),
      seq: match.seq + 1,
    });
    return { ok: true };
  });
});

// A finished game inside a match that is still running: the board is laid out
// again and the score stands.
export const yeniOyun = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const id = String(request.data?.matchId ?? "");
  const ref = db.collection("matches").doc(id);

  return db.runTransaction(async tx => {
    const found = await tx.get(ref);
    if (!found.exists) throw new HttpsError("not-found", "Maç bulunamadı.");
    const match = found.data();
    if (!colourOf(match, uid)) throw new HttpsError("permission-denied", "Bu maç senin değil.");
    if (!match.over) throw new HttpsError("failed-precondition", "Oyun daha bitmedi.");
    if (match.matchOver) throw new HttpsError("failed-precondition", "Maç bitti.");

    tx.update(ref, {
      pos: packPosition(Rules.startingPosition()),
      phase: "opening",
      opening: { ivory: null, black: null },
      waitingOn: "black",
      turn: "black",
      dice: null,
      remaining: [],
      required: 0,
      played: 0,
      lastMoves: [],
      lastBy: null,
      over: null,
      updatedAt: now(),
      seq: match.seq + 1,
    });
    return { ok: true };
  });
});
