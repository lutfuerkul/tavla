// Where a game's turns come from.
//
// The board does not know whether it is playing the computer, two people round
// one device, or somebody on the other side of a network. It asks a session
// for the two things it cannot decide by itself — what the dice say, and
// whether a finished turn is accepted — and draws whatever comes back.
//
// There is one implementation here and room for a second. A local game answers
// both questions itself and answers them at once; an online one will ask a
// server and answer when it replies, which is why both answers are promises
// even though this one has nothing to wait for.

// Two dice, each an even one in six, drawn independently. No memory of what
// came before: a double does not make the next throw any less likely to be
// one, which is the only way a die is fair. Where the platform offers a
// generator that cannot be predicted, it is used — not because a local game
// needs it, but so the local and the online sessions draw their dice the same
// way and only one of them has to be argued about.
const d6 = () => {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    const spread = new Uint32Array(1);
    // 4294967296 is not a multiple of six, so the last incomplete block is
    // thrown away rather than folded back over the low faces.
    const ceiling = Math.floor(4294967296 / 6) * 6;
    do { crypto.getRandomValues(spread); } while (spread[0] >= ceiling);
    return spread[0] % 6 + 1;
  }
  return Math.floor(Math.random() * 6) + 1;
};

// A game against somebody who is not in the room. The two questions are the
// same two questions; the answers come from a server instead of from here, and
// take as long as they take.
//
// It carries a third thing the local one does not need: the match itself,
// watched as the server writes it, which is how the opponent's turn arrives.
export function onlineSession({ matchId, colour, ask, follow }) {
  return {
    online: true,
    matchId,
    colour,
    roll: async () => (await ask("zarAt", { matchId })).dice,
    commitTurn: async moves => {
      await ask("turuOyna", { matchId, moves });
      return { ok: true };
    },
    // The board is laid out again by the server, not by the player, so that
    // both of them are looking at the same one.
    nextGame: () => ask("yeniOyun", { matchId }),
    watch: onChange => follow("matches", matchId, onChange),
  };
}

export function localSession() {
  return {
    online: false,
    // A throw's numbers, decided before the dice are let go of. The board is
    // free to take as long as it likes finding a tumble that lands on them.
    // How many are asked for is how many are in the hand: the opening is one
    // die each, and the game after it is the pair.
    roll: (count = 2) => Promise.resolve(Array.from({ length: count }, d6)),
    // A turn, as the sequence of moves that made it. There is nobody to check
    // it against here — the board has already played it against the same rules
    // a server would — so it is accepted as it stands.
    commitTurn: () => Promise.resolve({ ok: true }),
  };
}
