// Classic tavla, as it is played here: no doubling cube, no backgammon. A
// game is worth one, or two if the loser has not borne a single checker off.
//
// Nothing in this file knows about three.js or the DOM. A position is plain
// data and every function here returns a new one, which is what lets the
// computer look at a move without playing it and lets the tests run in node.

export const COLOURS = ["ivory", "black"];
export const other = colour => (colour === "ivory" ? "black" : "ivory");

// Ivory runs 24 down to 1 and bears off past 1; black runs the other way.
const step = colour => (colour === "ivory" ? -1 : 1);
const homeLow = colour => (colour === "ivory" ? 1 : 19);
const homeHigh = colour => (colour === "ivory" ? 6 : 24);

// How far a checker still has to travel to come off. This is the one number
// the whole rest of the file is written in terms of — entry from the bar,
// bearing off and the pip count are all just distances.
export const distanceOff = (colour, point) =>
  colour === "ivory" ? point : 25 - point;

// A checker coming off the bar re-enters that far into the opponent's home.
const entryPoint = (colour, die) => (colour === "ivory" ? 25 - die : die);

export function startingPosition() {
  const points = Array.from({ length: 25 }, () => null);
  const put = (point, colour, count) => { points[point] = { colour, count }; };
  // The opening position of the classic game: two on the far point, five on
  // the mid point, three on the bar point and five on the six point, mirrored.
  put(24, "ivory", 2); put(13, "ivory", 5); put(8, "ivory", 3); put(6, "ivory", 5);
  put(1, "black", 2); put(12, "black", 5); put(17, "black", 3); put(19, "black", 5);
  return { points, bar: { ivory: 0, black: 0 }, off: { ivory: 0, black: 0 } };
}

export function clone(pos) {
  return {
    points: pos.points.map(p => (p ? { colour: p.colour, count: p.count } : null)),
    bar: { ...pos.bar },
    off: { ...pos.off },
  };
}

const at = (pos, point) => pos.points[point];
const held = (pos, point, colour) => {
  const p = at(pos, point);
  return p && p.colour === colour ? p.count : 0;
};

// A point is closed to you when the other side has two or more checkers on it.
// One of theirs is a blot and you land on it.
const blocked = (pos, point, colour) => {
  const p = at(pos, point);
  return !!p && p.colour !== colour && p.count > 1;
};

export function pipCount(pos, colour) {
  let pips = pos.bar[colour] * 25;
  for (let point = 1; point <= 24; point++) {
    if (held(pos, point, colour)) {
      pips += held(pos, point, colour) * distanceOff(colour, point);
    }
  }
  return pips;
}

// Bearing off cannot start until every checker is home — which means none on
// the bar and none outside the six points of the home board.
export function allHome(pos, colour) {
  if (pos.bar[colour]) return false;
  for (let point = 1; point <= 24; point++) {
    if (held(pos, point, colour) && distanceOff(colour, point) > 6) return false;
  }
  return true;
}

// The checker furthest from home, as a distance. Bearing off with a die larger
// than a checker needs is only allowed from the furthest point back.
function furthest(pos, colour) {
  let far = 0;
  for (let point = 1; point <= 24; point++) {
    if (held(pos, point, colour)) far = Math.max(far, distanceOff(colour, point));
  }
  return far;
}

// Every move this die could make, from wherever it is legal to move from. A
// move is { from, to, die }, where from is "bar" and to is "off" at the ends
// of the journey.
export function movesWithDie(pos, colour, die) {
  const moves = [];

  // A checker on the bar has to come in before anything else may move.
  if (pos.bar[colour]) {
    const entry = entryPoint(colour, die);
    if (!blocked(pos, entry, colour)) moves.push({ from: "bar", to: entry, die });
    return moves;
  }

  const home = allHome(pos, colour);
  const back = home ? furthest(pos, colour) : 0;
  for (let point = 1; point <= 24; point++) {
    if (!held(pos, point, colour)) continue;
    const to = point + step(colour) * die;
    if (to >= 1 && to <= 24) {
      if (!blocked(pos, to, colour)) moves.push({ from: point, to, die });
      continue;
    }
    if (!home) continue;
    // Past the edge of the board: bearing off. Exactly on the number always
    // works; overshooting only from the checker furthest back, and only when
    // nothing is further back than it.
    const distance = distanceOff(colour, point);
    if (distance === die || (distance < die && distance === back)) {
      moves.push({ from: point, to: "off", die });
    }
  }
  return moves;
}

export function applyMove(pos, colour, move) {
  const next = clone(pos);
  if (move.from === "bar") next.bar[colour]--;
  else {
    const from = next.points[move.from];
    from.count--;
    if (!from.count) next.points[move.from] = null;
  }

  if (move.to === "off") { next.off[colour]++; return next; }

  const target = next.points[move.to];
  if (target && target.colour !== colour) {
    // A lone checker of theirs is hit and goes to the bar.
    next.bar[target.colour] += target.count;
    next.points[move.to] = { colour, count: 1 };
  } else if (target) target.count++;
  else next.points[move.to] = { colour, count: 1 };
  return next;
}

export const diceFor = (a, b) => (a === b ? [a, a, a, a] : [a, b]);

function key(pos, remaining) {
  let s = `${pos.bar.ivory}/${pos.bar.black}/${pos.off.ivory}/${pos.off.black}|`;
  for (let point = 1; point <= 24; point++) {
    const p = pos.points[point];
    s += p ? `${p.colour[0]}${p.count},` : ",";
  }
  return s + "|" + remaining.slice().sort().join("");
}

// Every way the turn could be played out, as a list of move sequences.
//
// This has to look at the whole turn rather than one die at a time, because
// the rule is that you play as many dice as you can: an order that strands a
// die is not allowed when some other order plays both. Playing the dice one
// at a time and asking "is this legal on its own" gets that wrong.
export function allSequences(pos, colour, dice) {
  const finished = [];
  const seen = new Set();

  const walk = (current, remaining, path) => {
    let moved = false;
    const triedDice = new Set();
    remaining.forEach((die, index) => {
      if (triedDice.has(die)) return;   // the two dice of a double are the same move
      triedDice.add(die);
      for (const move of movesWithDie(current, colour, die)) {
        const next = applyMove(current, colour, move);
        const rest = remaining.slice();
        rest.splice(index, 1);
        moved = true;
        const k = key(next, rest);
        if (seen.has(k)) continue;
        seen.add(k);
        walk(next, rest, path.concat([move]));
      }
    });
    // Nothing left to play with: this is as far as this line goes.
    if (!moved || !remaining.length) finished.push(path);
  };

  walk(pos, dice, []);
  return finished;
}

// The sequences you are actually allowed to play. Two rules narrow the list:
// you must play as many dice as can be played, and if that number is one and
// either die would do on its own, it has to be the larger one.
export function legalSequences(pos, colour, dice) {
  const all = allSequences(pos, colour, dice);
  const most = all.reduce((n, seq) => Math.max(n, seq.length), 0);
  if (!most) return [[]];

  let best = all.filter(seq => seq.length === most);
  if (most === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const larger = Math.max(dice[0], dice[1]);
    const withLarger = best.filter(seq => seq[0].die === larger);
    if (withLarger.length) best = withLarger;
  }
  return best;
}

// How many dice can be played from here, at most. This is the number the
// must-play rule is written in terms of, and it is worth having on its own
// because asking it of the position after a move is what tells you whether
// that move keeps the turn whole.
const reach = new Map();
export function maxPlayable(pos, colour, dice) {
  if (!dice.length) return 0;
  const memo = colour + "|" + key(pos, dice);
  if (reach.has(memo)) return reach.get(memo);
  if (reach.size > 40000) reach.clear();

  let best = 0;
  const triedDice = new Set();
  for (let index = 0; index < dice.length && best < dice.length; index++) {
    const die = dice[index];
    if (triedDice.has(die)) continue;
    triedDice.add(die);
    const rest = dice.slice();
    rest.splice(index, 1);
    for (const move of movesWithDie(pos, colour, die)) {
      best = Math.max(best, 1 + maxPlayable(applyMove(pos, colour, move), colour, rest));
      if (best === dice.length) break;
    }
  }
  reach.set(memo, best);
  return best;
}

// What the player may do right now, part way through a turn: every move that
// leaves the turn still able to play as many dice as it could before it.
//
// This is asked of the position rather than pulled out of a list of whole
// sequences, because sequences that reach the same board by a different order
// are the same sequence to a search and only one of them survives. Reading
// the first moves off that list therefore offers one way of playing a turn
// and hides the others — which is how a roll ended up insisting on a
// particular checker for its first move when either would do.
export function movesAvailable(pos, colour, remaining) {
  const most = maxPlayable(pos, colour, remaining);
  if (!most) return [];

  const moves = [];
  const triedDice = new Set();
  remaining.forEach((die, index) => {
    if (triedDice.has(die)) return;
    triedDice.add(die);
    const rest = remaining.slice();
    rest.splice(index, 1);
    for (const move of movesWithDie(pos, colour, die)) {
      if (1 + maxPlayable(applyMove(pos, colour, move), colour, rest) === most) moves.push(move);
    }
  });

  // With one die playable and either of them able to serve, it has to be the
  // larger one.
  if (most === 1 && remaining.length === 2 && remaining[0] !== remaining[1]) {
    const larger = Math.max(remaining[0], remaining[1]);
    const withLarger = moves.filter(move => move.die === larger);
    if (withLarger.length) return withLarger;
  }
  return moves;
}

// Both dice with the one checker, in a single move. Dropping it eight points
// away on a 5-3 is a move a player thinks of as one thing, and there is no
// reason to make them play it as two — so every way of walking a single
// checker through several dice is offered as a move of its own, from where it
// started to where it ends up.
//
// Each step still goes through movesAvailable, so an order that would strand
// a die is not on the list, and neither is a landing on a point that is held.
export function chainMoves(pos, colour, remaining) {
  const chains = [];
  const seen = new Set();

  const walk = (board, rest, at, taken, start) => {
    if (!rest.length) return;
    for (const move of movesAvailable(board, colour, rest)) {
      if (String(move.from) !== String(at)) continue;
      const after = applyMove(board, colour, move);
      const left = rest.slice();
      left.splice(left.indexOf(move.die), 1);
      const path = taken.concat([move]);
      if (path.length > 1) {
        const k = `${start}>${move.to}|${path.length}`;
        if (!seen.has(k)) { seen.add(k); chains.push({ from: start, to: move.to, moves: path }); }
      }
      if (move.to !== "off") walk(after, left, move.to, path, start);
    }
  };

  const starts = new Set(movesAvailable(pos, colour, remaining).map(m => String(m.from)));
  for (const start of starts) {
    walk(pos, remaining, start === "bar" ? "bar" : Number(start), [],
      start === "bar" ? "bar" : Number(start));
  }
  return chains;
}

export function winner(pos) {
  for (const colour of COLOURS) if (pos.off[colour] === 15) return colour;
  return null;
}

// One game, or two if the loser never got a checker off. There is no
// backgammon here and no doubling cube — this is the game as it is played at
// the table, not the tournament version.
export function gameValue(pos) {
  const won = winner(pos);
  if (!won) return 0;
  return pos.off[other(won)] === 0 ? 2 : 1;
}

// --- the opponent's judgement -----------------------------------------
// One ply: play out every sequence the dice allow, score where each one
// leaves the board, take the best. No lookahead past the current turn.

// Roughly how exposed a lone checker is: a blot the opponent can reach with
// one die is far more likely to be hit than one eleven pips away.
function hitRisk(pos, colour, point) {
  const enemy = other(colour);
  let risk = 0;
  for (let gap = 1; gap <= 12; gap++) {
    const from = point - step(colour) * gap;      // they travel the other way
    if (from < 1 || from > 24) continue;
    if (!held(pos, from, enemy)) continue;
    risk += gap <= 6 ? (7 - gap) : Math.max(0, 4 - (gap - 6));
  }
  if (pos.bar[enemy] && distanceOff(enemy, point) >= 19) risk += 8;
  return risk;
}

export function evaluate(pos, colour) {
  const enemy = other(colour);
  let score = 0;

  score += pos.off[colour] * 14 - pos.off[enemy] * 14;
  score += (pipCount(pos, enemy) - pipCount(pos, colour)) * .35;
  score -= pos.bar[colour] * 22;
  score += pos.bar[enemy] * 18;

  let primeRun = 0, bestPrime = 0;
  for (let point = 1; point <= 24; point++) {
    const mine = held(pos, point, colour);

    // Points held with two or more are worth having, and worth more the
    // nearer they are to home, where they block the opponent coming in.
    if (mine > 1) {
      const distance = distanceOff(colour, point);
      score += distance <= 6 ? 9 : distance <= 12 ? 6 : 3;
      // Stacking beyond three or four on one point wastes checkers.
      if (mine > 3) score -= (mine - 3) * 2.5;
      primeRun++;
      bestPrime = Math.max(bestPrime, primeRun);
    } else {
      primeRun = 0;
      if (mine === 1) score -= 2 + hitRisk(pos, colour, point) * .9;
    }

    // An anchor deep in their home board is somewhere to come back to.
    const enemyHome = distanceOff(colour, point) >= 19;
    if (enemyHome && mine > 1) score += 7;
  }
  // Consecutive made points are what actually traps a checker.
  score += bestPrime >= 4 ? (bestPrime - 3) * 6 : 0;

  return score;
}

export function chooseSequence(pos, colour, dice) {
  const sequences = legalSequences(pos, colour, dice);
  let best = sequences[0] || [], bestScore = -Infinity;
  for (const seq of sequences) {
    let after = pos;
    for (const move of seq) after = applyMove(after, colour, move);
    const score = evaluate(after, colour);
    if (score > bestScore) { bestScore = score; best = seq; }
  }
  return best;
}
