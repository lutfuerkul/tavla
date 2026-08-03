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
// How long somebody who is sitting there may take. This is the only clock in
// the game and it is only ever about a player who is present: a game must not
// be stallable for ever by somebody who will not move. An empty chair is not
// a slow player and is not treated as one — see HELD_SECONDS.
const ROLL_SECONDS = 20;
const MOVE_SECONDS = 60;
// The opening used to keep no time at all: nobody is thinking yet, they have
// just sat down, and the first thing asked of them is a die that decides
// nothing but who goes first. Taking that throw away from somebody still
// finding the board buys nothing.
//
// It is also the one place a table could be held for ever. A chair that empties
// is noticed and waited out; a player who stays connected and never throws was
// answered by nothing at all, since the clock that answers that is the same
// clock the opening did not have. Shorter than the others, because it is not a
// decision — there is one die and nothing to weigh up about it.
const OPEN_SECONDS = 20;
// How long an empty chair is waited for before the table closes. Nothing is
// played in it and nothing sits down in it: the game stops where it stood and
// the other board is told, with the minute counted out in front of them. Come
// back inside it — with the code, which is the only way back — and the game
// carries on from exactly there. Past it the table closes for both of them.
const HELD_SECONDS = 60;
// A page being reloaded empties its seat for a second or two. That is not
// somebody leaving and must not be announced as one, still less counted as
// one: reloading is the commonest thing anybody does to a web page, and it was
// spending the single absence a table allows and closing the game on the
// second press. Nothing is said until the chair has been empty longer than a
// reload takes.
const AWAY_GRACE_MS = 10 * 1000;
// How many things the server may do on somebody's behalf, one after another,
// before the table is given up on. A chair that empties is noticed and waited
// for; a player who stays connected and simply stops playing was not covered by
// anything at all, and the server would have thrown and moved for them until
// one of them won. The other player is not playing a game at that point, they
// are watching one play itself.
//
// Three: a throw, the move it was for, and the next throw. A hundred seconds of
// somebody else's board moving on its own, which is long enough to know nobody
// is coming back to it — and short of a whole second turn, so a single lapse of
// attention is a turn lost rather than a match.
const ABANDON_ACTS = 3;
// Long enough that two rooms are never open on the same code, short enough to
// read down a telephone. I, O, 0 and 1 are left out: they are the letters
// people get wrong.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;
const ROOM_MINUTES = 20;

// How long a record lingers before Firestore sweeps it up. This is a backstop
// and nothing more: a table is deleted when the last player leaves it, at the
// moment they leave. What is left over is what nobody could say goodbye for —
// a tab closed, a phone put down, a signal lost — and these are how long that
// takes to go. The dates are written on the documents themselves; the sweeping
// is a TTL policy on the field, set on the project rather than in code.
const KEPT_DAYS = 1;
const KEPT_AFTER_CLOSING_HOURS = 1;
const KEPT_IN_QUEUE_MINUTES = 5;
const sweptIn = ms => new Date(Date.now() + ms);
const KEPT = () => sweptIn(KEPT_DAYS * 24 * 60 * 60 * 1000);
const SWEPT_SOON = () => sweptIn(KEPT_AFTER_CLOSING_HOURS * 60 * 60 * 1000);

const now = () => FieldValue.serverTimestamp();

// When the current wait began, which is not the same as when the record was
// last written. The clock used to be read off updatedAt, and updatedAt moves
// on every word about the match — a chair emptying, a board sitting back down,
// a clock being asked about. So a player with four seconds left could reload,
// and the minute started over; and a player who never touched anything got
// their minute extended every time their opponent's connection hiccuped. It
// moves only where a new thing is being waited for: a turn handed over, dice
// thrown, an opening die asked for, a new game laid out. Everything else
// leaves it exactly where it was, so the same sixty seconds are the same sixty
// seconds for both of them whatever else happens in between.
const CLOCK = () => ({ clockFrom: now() });
const clockStarted = match =>
  (match.clockFrom ?? match.updatedAt)?.toDate?.() ?? new Date(0);
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

function freshMatch(players, code) {
  return {
    players,
    // The code this table answers to, kept on the match for as long as it
    // lives. It is the only way back to it: no seat is held open on trust and
    // nothing plays a hand that has gone. You say the code, the seat is found
    // to be yours, and the game carries on from exactly where it stopped.
    code,
    // Which of them is which colour was settled when the room was made.
    pos: packPosition(Rules.startingPosition()),
    phase: "opening",
    opening: { ivory: null, black: null },
    waitingOn: "black",
    // When each of them last threw their opening die — see zarAt.
    openingAt: {},
    turn: "black",
    dice: null,
    remaining: [],
    required: 0,
    played: 0,
    lastMoves: [],
    // Which write they were made on. Every later word about the match carries
    // the moves along untouched — a chair emptying, a clock running — and a
    // board with no way of telling the two apart watched the same turn played
    // out again on every one of them.
    lastMoveSeq: 0,
    // Who played them. Whose turn it is is not enough to tell: a game is won
    // on the winner's own turn and the turn stays with them, so a client
    // reading "their turn, and moves on the board" would replay the winner's
    // own moves back at them in the other colour.
    lastBy: null,
    // How many times each of them has dropped out. The first is waited for;
    // the second closes the table — see `sure`.
    drops: { ivory: 0, black: 0 },
    // How many things in a row the server has done for each of them. Anything
    // they do themselves puts it back to nothing — see ABANDON_ACTS.
    idle: { ivory: 0, black: 0 },
    score: { ivory: 0, black: 0 },
    target: MATCH_TARGET,
    over: null,
    seq: 0,
    createdAt: now(),
    updatedAt: now(),
    ...CLOCK(),
    // A match still on the table a day later is not one anybody is coming back
    // to. Normally it is deleted long before this, as its last player leaves.
    silinecek: KEPT(),
  };
}

// Whose turn it is after this one. Ordinarily the other player's, but a player
// shut out on the bar — every point they could come in on held against them —
// is passed over: no number brings them in, so a turn spent throwing for them
// is a turn spent on nothing. Both boards are told they were passed over, so
// the turn going by without anything happening is not a mystery.
//
// Only ever one turn is skipped. Both of them shut out at once is a position
// nothing can move on from, and it must not become two turns handed back and
// forth for ever.
function handOver(pos, from, patch) {
  const next = Rules.other(from);
  if (Rules.shutOut(pos, next) && !Rules.shutOut(pos, from)) {
    patch.turn = from;
    patch.skipped = next;
    return;
  }
  patch.turn = next;
  patch.skipped = null;
}

// Closing a table takes its code with it. A code outliving its match is a code
// that lets somebody in through the door of a room that is not there any more:
// they are seated, the board opens, and then it tells them the table has gone.
//
// The match itself is marked rather than deleted, and says who closed it. A
// record simply vanishing tells the board opposite that something happened and
// nothing about what — so both boards were told the same thing, and one of
// them was told its opponent had walked off when the opponent was itself. What
// is left is swept within the hour.
async function closeTable(ref, match, by) {
  await ref.update({
    closed: true,
    closedBy: by ?? null,
    away: null,
    awaySince: {},
    silinecek: SWEPT_SOON(),
    updatedAt: now(),
    seq: (match?.seq ?? 0) + 1,
  });
  if (match?.code) await db.collection("rooms").doc(match.code).delete().catch(() => {});
}

const colourOf = (match, uid) =>
  match.players.black === uid ? "black" : match.players.ivory === uid ? "ivory" : null;

// --- rooms ------------------------------------------------------------

// A code nobody else is holding, claimed before anything is written against
// it. Five characters out of thirty two is thirty three million, so a clash is
// a curiosity rather than a problem — but it is still checked, inside a
// transaction, because a code handed to two tables is a game neither of them
// can play.
//
// Every match gets one, not only the ones somebody asked for a code for. Two
// people found in the queue never said a code out loud, and they need the way
// back just as much as anybody else.
async function freeCode() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const wanted = code();
    const room = db.collection("rooms").doc(wanted);
    const taken = await db.runTransaction(async tx => {
      const found = await tx.get(room);
      if (found.exists) return true;
      tx.set(room, {
        host: null, hostColour: null, guest: null,
        status: "holding", matchId: null,
        createdAt: now(),
        // Two things at once, and it has to be: the deadline for somebody to
        // walk through this code, and the date the sweeper deletes it on —
        // rooms are swept by a TTL policy on this very field. A code nobody
        // ever used goes with it, twenty minutes after it was minted.
        expiresAt: new Date(Date.now() + ROOM_MINUTES * 60 * 1000),
      });
      return false;
    });
    if (!taken) return wanted;
  }
  throw new HttpsError("resource-exhausted", "Oda kodu üretilemedi, tekrar dene.");
}


export const odaKur = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const wants = request.data?.colour === "ivory" ? "ivory" : "black";

  const wanted = await freeCode();
  await db.collection("rooms").doc(wanted).update({ host: uid, hostColour: wants, status: "waiting" });
  return { code: wanted, colour: wants };
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
      // The match this code answers to may have closed since. A code is deleted
      // with its table, but a sweep or a crash can leave one standing — and
      // being let in through the door of a room that is not there is worse than
      // being told at the door.
      const still = it.matchId ? await tx.get(db.collection("matches").doc(it.matchId)) : null;
      if (!still?.exists || still.data().closed) { tx.delete(room); return { error: "not-found" }; }
      // The minute nobody counted. A table is closed by whoever is still
      // sitting at it, so a table both of them walked away from has nobody to
      // close it: it would stand until it was swept, and the first of them
      // back would sit down at a game the other gave up on long ago. The count
      // is done here instead, at the door — if a chair has been empty longer
      // than the minute, that minute is over.
      const emptied = Object.values(still.data().awaySince ?? {})
        .map(at => at?.toDate?.()?.getTime() ?? Infinity);
      const oldest = emptied.length ? Math.min(...emptied) : Infinity;
      if (Number.isFinite(oldest) && (Date.now() - oldest) / 1000 > HELD_SECONDS) {
        tx.update(still.ref, {
          closed: true, closedBy: null,
          silinecek: SWEPT_SOON(), updatedAt: now(),
          seq: (still.data().seq ?? 0) + 1,
        });
        tx.delete(room);
        return { error: "not-found" };
      }
      const other = it.hostColour === "black" ? "ivory" : "black";
      if (it.host === uid) return { matchId: it.matchId, colour: it.hostColour };
      if (it.guest === uid) return { matchId: it.matchId, colour: other };
      return { error: "full" };
    }
    if (it.host === uid) return { error: "own-room" };
    // A code claimed but not yet written against. There is a hair's breadth
    // between minting a code and putting a host on it, and a guest who typed
    // it in that instant was seated opposite nobody at all.
    if (!it.host) return { error: "not-found" };
    if (it.expiresAt?.toDate?.() < new Date()) return { error: "expired" };

    const players = it.hostColour === "black"
      ? { black: it.host, ivory: uid }
      : { ivory: it.host, black: uid };
    tx.set(match, freshMatch(players, wanted));
    // A matched code lives as long as its table, because it is the way back to
    // it — and twenty minutes is a short game. The sweeper reads this field, so
    // a matched room left on the door's own deadline was being deleted out from
    // under a game still being played: twenty minutes in, the code stopped
    // working, and whoever dropped out after that had no way back at all.
    tx.update(room, { status: "matched", guest: uid, matchId: match.id, expiresAt: KEPT() });
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

// A room the host has given up on. Deleted rather than left to run out: a code
// still standing is a code a friend can walk into an hour later, and walking
// into a room nobody is watching any more seats them at a table on their own.
// Only the host's to close, and only while nobody has come through it — a room
// that has already been matched belongs to the match now.
export const odayiKapat = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const wanted = String(request.data?.code ?? "").trim().toUpperCase();
  if (!/^[A-Z2-9]{5}$/.test(wanted)) return { closed: false };
  const room = db.collection("rooms").doc(wanted);
  return await db.runTransaction(async tx => {
    const found = await tx.get(room);
    if (!found.exists) return { closed: false };
    const it = found.data();
    if (it.host !== uid || it.status === "matched") return { closed: false };
    tx.delete(room);
    return { closed: true };
  });
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

// --- being found a game -----------------------------------------------
//
// A room and a code is two people who already know each other. This is the
// other way in: you say you would like a game, and either somebody is already
// waiting — in which case you are put opposite them at once — or you are the
// one waiting, and the next person along finds you.
//
// The queue is one document per player, named by their own uid, so nobody can
// hold two places in it and coming back twice is not two entries.

// A queue entry outlives the tab that wrote it: a closed browser leaves it
// behind, and somebody sat down opposite it waits for a player who is not
// coming. So an entry says when it was made and the board that is waiting says
// so again every little while; one that has stopped saying so is not somebody
// to be found.
//
// Judged by the entry itself rather than by the presence kept for the lobby
// count. Tying the two together meant that anything wrong with presence — and
// it is a separate system, on a separate database — showed up here as nobody
// in the world ever being matched with anybody, silently.
const QUEUE_FRESH_SECONDS = 45;

const stale = entry => {
  const at = entry.at?.toDate?.();
  return !at || (Date.now() - at.getTime()) / 1000 > QUEUE_FRESH_SECONDS;
};

export const eslesmeyeGir = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const queue = db.collection("sira");
  const mineRef = queue.doc(uid);

  // Our own place, before anything else. Whoever finds us writes the table
  // onto it, and that record is the only way we are told — so asking again
  // while an answer is already lying there has to return the answer rather
  // than start a fresh search. It did not, and the search ended by writing a
  // waiting place over the top of it: a player who had just been matched
  // erased their own match, with their own hand, and then waited for ever in
  // front of a screen that said it was looking. It needed the two boards to
  // press the button close enough together that one of them was still mid
  // search when the other found it, which is why it was rare.
  const first = await mineRef.get();
  if (first.exists && first.data().matchId) {
    await mineRef.delete().catch(() => {});
    return { matchId: first.data().matchId, colour: first.data().colour ?? "black" };
  }

  // The longest wait is served first; ten is plenty to look through, since
  // anybody past that has been waiting long enough to be a stale entry.
  const waiting = await queue.orderBy("at").limit(10).get();
  for (const entry of waiting.docs) {
    if (entry.id === uid) continue;
    // Swept whatever is written on it. A place with a table already on it used
    // to be stepped over and left where it was — and it is stepped over by its
    // own timestamp, which never moves again, so it sits at the head of the
    // queue for as long as it lives. Ten of those and the ten oldest places
    // are all dead ones: everybody arriving looks at the same ten corpses,
    // finds nobody, and sits down to wait behind them. Nobody in the world is
    // ever matched with anybody, and nothing anywhere says why.
    if (stale(entry.data())) {
      await entry.ref.delete().catch(() => {});
      continue;
    }
    // Somebody found in the last few seconds, whose board has not yet read
    // the news off their place. Theirs to clear, not ours.
    if (entry.data().matchId) continue;

    const match = db.collection("matches").doc();
    // Claimed before the pairing, since a code cannot be minted inside the
    // transaction that needs it. Given back if the pairing does not happen.
    const wanted = await freeCode();
    const paired = await db.runTransaction(async tx => {
      // Both places, not just theirs. Pairing used to lock only the person
      // being found, which meant two players searching in the same breath each
      // found the other and each built a table: two matches, both valid,
      // written to two different records so nothing collided. Each of them
      // then heard about the other's table as well as their own and sat down
      // at whichever arrived last — often not the same one. Two people looking
      // at two empty boards, having just been matched with each other.
      //
      // Reading our own place makes the two attempts collide properly: the
      // second one to commit finds a match already written against its name
      // and takes that one instead of making another.
      const [found, mine] = await Promise.all([tx.get(entry.ref), tx.get(mineRef)]);
      const already = mine.exists ? mine.data().matchId : null;
      if (already) return { matchId: already, colour: mine.data().colour ?? "black", theirs: true };
      // Somebody else reached them first between the search and here.
      if (!found.exists || found.data().matchId) return null;
      // The one who waited takes black, and black opens — the small courtesy
      // of throwing first goes to whoever sat there longest.
      tx.set(match, freshMatch({ black: entry.id, ivory: uid }, wanted));
      // The code the two of them can come back through. Nobody said it out
      // loud, but the board shows it to both of them from the moment they sit
      // down, which is what it is for.
      tx.set(db.collection("rooms").doc(wanted), {
        host: entry.id, hostColour: "black", guest: uid,
        status: "matched", matchId: match.id,
        createdAt: now(),
        // As long as the table it belongs to — see odayaKatil.
        expiresAt: KEPT(),
      });
      // Read by the board that is waiting and then of no further use — but it
      // is written to rather than deleted, since deleting it is how the board
      // watching it is told nothing at all. So it is left with a date on it.
      tx.update(entry.ref, {
        matchId: match.id, colour: "black",
        silinecek: sweptIn(KEPT_IN_QUEUE_MINUTES * 60 * 1000),
      });
      // Ours goes in the same breath. Left for afterwards, it was a place with
      // no match on it that somebody arriving in between could still be paired
      // with — and by then we were already sitting down somewhere else.
      tx.delete(mineRef);
      return { matchId: match.id, colour: "ivory" };
    });
    // The table we were about to build was not built: somebody had already
    // built one with us in it. The code claimed for it goes back.
    if (paired?.theirs) {
      await db.collection("rooms").doc(wanted).delete().catch(() => {});
      await mineRef.delete().catch(() => {});
      return { matchId: paired.matchId, colour: paired.colour };
    }
    if (paired) return paired;
    await db.collection("rooms").doc(wanted).delete().catch(() => {});
  }

  // Nobody to be found, so wait to be the one found. The entry is watched by
  // the board that wrote it: whoever arrives next writes the match onto it.
  // Asking again is how a board says it is still there, and it re-reads the
  // queue on the way past — so two people who arrived in the same breath and
  // both sat down to wait find each other on their next ask rather than
  // waiting for a third.
  // Sitting down to wait, and saying so again on every ask. In one write with
  // the reading that decides whether to make it, because between the two a
  // table can be written onto our place — and the blind version of this is
  // what erased it.
  const claimed = await db.runTransaction(async tx => {
    const mine = await tx.get(mineRef);
    if (mine.exists && mine.data().matchId) return mine.data();
    tx.set(mineRef, { at: now(), matchId: null, silinecek: sweptIn(KEPT_IN_QUEUE_MINUTES * 60 * 1000) });
    return null;
  });
  if (claimed) {
    await mineRef.delete().catch(() => {});
    return { matchId: claimed.matchId, colour: claimed.colour ?? "black" };
  }
  return { waiting: true, refresh: QUEUE_FRESH_SECONDS };
});

export const siradanCik = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  await db.collection("sira").doc(uid).delete().catch(() => {});
  return { ok: true };
});

// Getting up from the table, said out loud. A player leaving while the other
// is still sitting there is an ordinary thing — the computer covers for them
// and they can come back. Both of them leaving is not: the table closes behind
// the last one out, and a closed table is played at by nobody and returned to
// by nobody.
//
// Which chair is empty is read here rather than taken from the caller, and it
// is the other one that is looked at: the one asking is on their way out by
// definition.
export const masayiBirak = onCall(settings, async request => {
  const uid = whoIsAsking(request);
  const id = String(request.data?.matchId ?? "");
  const ref = db.collection("matches").doc(id);

  const found = await ref.get();
  if (!found.exists) return { ok: true, closed: false };
  const match = found.data();
  const mine = colourOf(match, uid);
  if (!mine) throw new HttpsError("permission-denied", "Bu maç senin değil.");
  if (match.closed) return { ok: true, closed: true };

  // Getting up is final, and it closes the table on both of them. A game
  // across a network is two people; one of them leaving on purpose does not
  // leave a game behind for the computer to finish. The other board is told
  // by the record going — there is nothing left to read: no player, no game
  // to carry on, nobody to come back.
  await closeTable(ref, match, mine);
  return { ok: true, closed: true };
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
    if (match.closed) throw new HttpsError("failed-precondition", "Masa kapandı.");
    if (match.over) throw new HttpsError("failed-precondition", "Maç bitti.");

    if (match.phase === "opening") {
      if (match.waitingOn !== mine) {
        throw new HttpsError("failed-precondition", "Sıra sende değil.");
      }
      const value = d6();
      const opening = { ...match.opening, [mine]: value };
      // When each of them last threw. Two throws can carry the same number — a
      // tie broken by throwing the same face again — and a board reading the
      // number alone cannot tell the second from the first, so it never shows
      // it. Kept per player, not for the opening as a whole: a stamp that
      // moved when the other one threw made every board show its opponent's
      // die a second time, straight after its own.
      const patch = {
        opening,
        openingAt: { ...(match.openingAt ?? {}), [mine]: match.seq + 1 },
        // Done by hand, so nothing here was done for them.
        idle: { ...(match.idle ?? {}), [mine]: 0 },
        updatedAt: now(), ...CLOCK(), seq: match.seq + 1,
      };

      if (opening.ivory === null || opening.black === null) {
        patch.waitingOn = opening.black === null ? "black" : "ivory";
      } else if (opening.ivory === opening.black) {
        // A tie is broken by whoever threw second, on their own. They throw
        // again against the number the two of them made: higher and they
        // start, lower and the other one does, equal again and they throw
        // again. Only their own die changes, so the comparison below never has
        // to know that a tie happened at all.
        patch.waitingOn = mine;
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
      // When this throw happened, so a player coming back can be told whether
      // the turn they are watching started before them or after.
      lastThrowSeq: match.seq + 1,
      required: legal[0].length,
      played: 0,
      lastMoves: [],
      lastMoveSeq: 0,
      lastBy: null,
      idle: { ...(match.idle ?? {}), [mine]: 0 },
      updatedAt: now(),
      ...CLOCK(),
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
    if (match.closed) throw new HttpsError("failed-precondition", "Masa kapandı.");
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
      lastMoveSeq: match.seq + 1,
      lastBy: mine,
      dice: null,
      remaining: [],
      required: 0,
      played: 0,
      idle: { ...(match.idle ?? {}), [mine]: 0 },
      updatedAt: now(),
      ...CLOCK(),
      seq: match.seq + 1,
    };

    const won = Rules.winner(pos);
    if (won) {
      const value = Rules.gameValue(pos);
      const score = { ...match.score, [won]: match.score[won] + value };
      patch.score = score;
      patch.over = { winner: won, value };
      patch.matchOver = score[won] >= match.target ? won : null;
      if (patch.matchOver) patch.silinecek = SWEPT_SOON();
    } else {
      handOver(pos, mine, patch);
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

// How long the mark on a seat is good for. Four times the pulse the board
// writes it with, so a slow line or a missed write does not empty a chair
// somebody is plainly sitting in.
const SEAT_FRESH_MS = 20 * 1000;

async function isSeated(matchId, uid) {
  const seat = await rtdb().ref(`masalar/${matchId}/${uid}`).get();
  if (!seat.exists()) return false;
  // The seat is cleared by onDisconnect, which is the server noticing a closed
  // connection — and a connection that is cut rather than closed is not
  // noticed for a minute or more. So the time on the mark is read too, and a
  // mark nobody has touched in twenty seconds is an empty chair whatever it
  // says. A board too old to be writing the time is taken at its word.
  const at = seat.val()?.at;
  if (typeof at !== "number") return true;
  return Date.now() - at < SEAT_FRESH_MS;
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
    // Stamped, the same as a throw made by hand. Without it a board cannot tell
    // this die from one it has already watched land, and the same face thrown
    // twice — which is exactly what breaking a tie produces — went unshown.
    const patch = {
      opening,
      openingAt: { ...(match.openingAt ?? {}), [colour]: match.seq + 1 },
      updatedAt: now(), ...CLOCK(), seq: match.seq + 1,
    };
    if (opening.ivory === null || opening.black === null) {
      patch.waitingOn = opening.black === null ? "black" : "ivory";
    } else if (opening.ivory === opening.black) {
      // The same rule the players play by: whoever threw second throws again,
      // alone, against the number the two of them made. This was left behind
      // when that rule changed — it still wiped both dice and started the
      // opening over from black, so a tie broken by the clock was played by
      // one set of rules and a tie broken by hand by another.
      patch.waitingOn = colour;
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
      played: 0, lastMoves: [], lastMoveSeq: 0, lastBy: null,
      lastThrowSeq: match.seq + 1,
      updatedAt: now(), ...CLOCK(), seq: match.seq + 1,
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
    lastMoveSeq: match.seq + 1,
    lastBy: colour,
    dice: null,
    remaining: [],
    required: 0,
    played: 0,
    updatedAt: now(),
    ...CLOCK(),
    seq: match.seq + 1,
  };
  const won = Rules.winner(after);
  if (won) {
    const value = Rules.gameValue(after);
    const score = { ...match.score, [won]: match.score[won] + value };
    patch.score = score;
    patch.over = { winner: won, value };
    patch.matchOver = score[won] >= match.target ? won : null;
    if (patch.matchOver) patch.silinecek = SWEPT_SOON();
  } else {
    handOver(after, colour, patch);
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
  // Nobody is waited for at a table that has closed.
  if (match.closed) return { acted: false, closed: true };

  // The chair opposite, asked about by the one person who minds. Which chair
  // that is does not depend on whose turn it is: a game stops just as dead
  // when the player who has gone is the one being waited on as when they are
  // not, and reading it off the turn meant nobody ever asked about an absent
  // opponent while it was their own move.
  const theirs = Rules.other(mine);
  const seated = await isSeated(id, match.players[theirs]);

  // An empty chair. Nothing is played in it and nobody sits down in it — the
  // game stops exactly where it stood. The other board is told, a minute is
  // counted out, and inside that minute they can come back with the code and
  // carry on from here. Past it the table closes for both of them, and the
  // record going is how they are both told.
  if (!seated) {
    const startedAt = match.awaySince?.[theirs]?.toDate?.();
    // Noted, and nothing more. No word to the other board and no mark on the
    // match — not even a new seq, so no board hears anything at all — until it
    // has lasted longer than a reload takes.
    if (!startedAt) {
      await ref.update({ awaySince: { ...(match.awaySince ?? {}), [theirs]: now() } });
      return { acted: false, holding: true };
    }
    const goneFor = Date.now() - startedAt.getTime();
    if (goneFor < AWAY_GRACE_MS) return { acted: false, holding: true };

    // Long enough to be real. Said out loud now, and counted.
    //
    // Once is a tunnel, a flat battery, a router. Twice is a game the other
    // player cannot play, and waiting out a second minute for somebody who has
    // already been waited for is a game nobody is playing — the second time
    // the chair empties, the table closes with it.
    if (match.away !== theirs) {
      const gone = (match.drops?.[theirs] ?? 0) + 1;
      if (gone > 1) {
        await closeTable(ref, match, theirs);
        return { acted: false, closed: true };
      }
      await ref.update({
        away: theirs,
        drops: { ...(match.drops ?? {}), [theirs]: gone },
        updatedAt: now(),
        seq: match.seq + 1,
      });
      return { acted: false, holding: true };
    }
    // The minute is counted from when the chair emptied, grace and all.
    if (goneFor / 1000 < HELD_SECONDS) return { acted: false, holding: true };
    await closeTable(ref, match, theirs);
    return { acted: false, closed: true };
  }

  // Back in the chair, and read from the chair rather than taken on trust.
  // This is the only thing that withdraws the news for somebody whose page
  // never went anywhere: a signal that dropped and came back with the tab
  // still open leaves nothing to say "I am back" — the board that lost it was
  // never reloaded — and the mark would have stood there counting down to a
  // table closed on a player sitting in front of it.
  if (match.away === theirs || match.awaySince?.[theirs]) {
    const since = { ...(match.awaySince ?? {}) };
    delete since[theirs];
    await ref.update({
      away: match.away === theirs ? null : (match.away ?? null),
      awaySince: since,
      updatedAt: now(),
      seq: match.seq + 1,
    });
    return { acted: false, back: theirs };
  }

  // Somebody sitting there and taking their time is a different matter, and
  // the only one the clock is for: a game must not be stallable for ever by a
  // player who will not move. Your own clock is never yours to run down — a
  // client that could would run it down whenever the position stopped suiting
  // it — so this is only ever asked by the one being kept waiting.
  const waiting = waitingFor(match);
  if (!waiting || waiting.colour === mine) return { acted: false };
  const since = clockStarted(match);
  if ((Date.now() - since.getTime()) / 1000 < waiting.seconds) {
    return { acted: false, seated: true };
  }

  return db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return { acted: false };
    const it = fresh.data();
    // It has moved on since it was read; whoever moved it is playing.
    if (it.seq !== match.seq) return { acted: false };
    const patch = actFor(it, waiting.colour);
    const left = waiting.colour;
    const stayed = Rules.other(left);
    const alone = (it.idle?.[left] ?? 0) + 1;
    patch.idle = { ...(it.idle ?? {}), [left]: alone };
    // Given up on. The match goes to whoever is still sitting there — not
    // because backgammon has a rule about walking away, but because the
    // alternative is a board that plays itself to the end in front of somebody
    // who did stay. Never over a win the server's own play has just produced:
    // that game was won on the board and stands.
    if (alone >= ABANDON_ACTS && !patch.over) {
      patch.over = { winner: stayed, value: 1 };
      patch.score = { ...it.score, [stayed]: it.target };
      patch.matchOver = stayed;
      patch.abandonedBy = left;
      patch.silinecek = SWEPT_SOON();
    }
    tx.update(ref, patch);
    return { acted: true, by: left, abandoned: alone >= ABANDON_ACTS };
  });
});

// Back at the table. Whatever was said about this player being gone is
// withdrawn, and their allowance starts again from now: they have this second
// sat down in front of a board they were not watching, and the time that ran
// out while they were away is not time they had.
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
    // The clock is not touched. Sitting back down says only that the chair is
    // filled again; the turn has been running the whole time and goes on
    // running from where it was. It used to start over here, on the grounds
    // that seconds spent away were not seconds anybody had — but the player
    // opposite was sitting there through every one of them, and a minute that
    // begins again on every reload is not a minute. Come back too late and the
    // server plays the turn, the same as for anybody sitting still.
    //
    // And only when there is actually a mark of our own to withdraw. Without
    // this guard every call still wrote — clearing nothing and bumping seq —
    // and seq is what `sure` reads to know whether the match has moved on under
    // it: a player who keeps the tab open (so the seat stays filled and no
    // absence is ever stamped) but stops playing could sit in the console
    // calling this in a loop, and each bump made `sure`'s next act see a match
    // that had "moved on" and refuse to play their clock out. The turn never
    // timed out, the abandon count never rose, and the one certain to lose
    // could hang the match for ever. A board that comes back to a stamped
    // absence still has the mark, so the real case is untouched; a board that
    // never went anywhere leaves nothing here to clear. This is the guard
    // `sure` already uses at its own back-in-the-chair branch.
    if (!(match.away === mine || match.awaySince?.[mine])) {
      return { ok: true, back: false };
    }
    const since = { ...(match.awaySince ?? {}) };
    delete since[mine];
    tx.update(ref, {
      // Only ever our own mark. The other player's absence is not ours to
      // withdraw, and clearing it outright is how a board once announced that
      // somebody had come back who had never gone.
      away: match.away === mine ? null : (match.away ?? null),
      awaySince: since,
      updatedAt: now(),
      seq: match.seq + 1,
    });
    return { ok: true, back: true };
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
    if (match.closed) throw new HttpsError("failed-precondition", "Masa kapandı.");
    if (!match.over) throw new HttpsError("failed-precondition", "Oyun daha bitmedi.");
    if (match.matchOver) throw new HttpsError("failed-precondition", "Maç bitti.");

    // Not opened for: inside a running match the winner of the game just
    // finished starts the next one, the way it is played at a table. So the
    // board comes back already in play with the turn on them, and the first
    // thing that happens is their own throw.
    tx.update(ref, {
      pos: packPosition(Rules.startingPosition()),
      phase: "play",
      opening: { ivory: null, black: null },
      waitingOn: null,
      turn: match.over.winner,
      dice: null,
      remaining: [],
      required: 0,
      played: 0,
      lastMoves: [],
      lastMoveSeq: 0,
      lastBy: null,
      over: null,
      idle: { ivory: 0, black: 0 },
      updatedAt: now(),
      ...CLOCK(),
      seq: match.seq + 1,
    });
    return { ok: true };
  });
});
