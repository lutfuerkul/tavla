// The rules are the same rules on both sides, and this is what makes sure of
// it. The board plays a turn against src/rules.js and the server accepts or
// refuses it against functions/rules.js; if those two ever drift apart, a move
// that is legal in front of the player is refused behind them, which is the
// worst kind of bug to be told about by a stranger over a network.
//
// Firebase deploys the functions folder on its own, so the file has to be in
// it. Rather than a build step, it is a copy — checked here, and checked again
// before every deploy by the predeploy hook in firebase.json.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const mine = join(here, "rules.js");
const theirs = join(here, "..", "src", "rules.js");

const a = readFileSync(mine, "utf8");
const b = readFileSync(theirs, "utf8");

if (a !== b) {
  console.error("functions/rules.js ile src/rules.js ayrışmış.");
  console.error("Kopyalamak için:  cp src/rules.js functions/rules.js");
  process.exit(1);
}

console.log("kurallar aynı — " + a.split("\n").length + " satır");
