// The connection to Firebase, and the one thing built on it so far: who is at
// the table right now.
//
// Everything here is optional. The game is a static page that plays perfectly
// well against the computer and across a shared device with no network at all,
// so nothing in it may fail loudly: if the SDK will not load, if there is no
// signal, if the rules say no, the count simply does not appear and the board
// carries on. Every promise here resolves — none of them reject.
//
// The keys below are not secrets. They identify the project to Firebase and
// are meant to be read by the browser; what stops a stranger writing to the
// database is the rules, not the hiding of these.

const CONFIG = {
  apiKey: "AIzaSyA6ULCk8EdQAB4BUxnUylXwjrVc_YVyFGE",
  authDomain: "tavla3b.firebaseapp.com",
  projectId: "tavla3b",
  storageBucket: "tavla3b.firebasestorage.app",
  messagingSenderId: "496921680227",
  appId: "1:496921680227:web:3208d2d67cf24198f69b56",
  databaseURL: "https://tavla3b-default-rtdb.europe-west1.firebasedatabase.app",
};

const SDK = "https://www.gstatic.com/firebasejs/10.14.1";
const REGION = "europe-west1";

// Against the emulator suite rather than the real project, when the page is
// opened with ?emulator on a machine that is running one. Only ever local
// addresses, so it cannot be turned on against anything that matters.
const EMULATED = new URLSearchParams(location.search).has("emulator")
  && ["localhost", "127.0.0.1"].includes(location.hostname);

// A Realtime Database namespace is a whole separate database, and against the
// emulator the two sides are handed different ones: the page keeps the one in
// the URL above, while the server's admin SDK is given ?ns=<projectId> by the
// emulator suite. The seat a player claims then goes into one database and the
// server looks for it in the other, so everybody appears to have walked away
// and the computer takes every turn the moment it is due. The real project has
// a single default instance and both sides land on it — this only differs
// under the emulator, so only the emulator's copy of the config is bent.
const SETTINGS = EMULATED
  ? { ...CONFIG, databaseURL: `https://${CONFIG.projectId}.firebaseio.com` }
  : CONFIG;

// App Check says the request came from this game rather than from something
// that read the address off the page and started calling on its own. It has
// nothing to do with cheating — a stranger calling the functions by hand still
// cannot throw their own dice or make an illegal move, because the server
// decides both. What it answers is the other thing: somebody looping the room
// call for an afternoon, running up a bill for tables nobody sits at.
//
// The key below is public, the way the ones above it are: it names the site to
// reCAPTCHA and is meant to be read by the browser. Until one is put here this
// whole thing is inert — no script is fetched, nothing is initialised, and the
// game behaves exactly as it did before. That is deliberate. Turning App Check
// on has two halves, and they are not done at the same moment: this half asks
// the browser to prove itself, and the other half — enforcement, in the console
// — decides whether an unproven request is refused. Enforced before anybody has
// checked the numbers, it is a way of locking real players out of a game that
// was working perfectly well, so enforcement is left switched off until the
// reports say what is actually arriving.
const APP_CHECK_KEY = "";

// Nothing is fetched until something asks for it, and it is only fetched once.
let opening = null;

async function open() {
  const [app, auth, database, store, functions] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-functions.js`),
  ]);
  const started = app.initializeApp(SETTINGS);

  // Before anything else is asked of the project, and never against the
  // emulator, which has no reCAPTCHA to answer to. It is not awaited: fetching
  // the token is the browser's own errand, and a game must not sit at a black
  // screen because a script on somebody else's server is slow. If it fails
  // outright — blocked, offline, a key that has been withdrawn — the tokens
  // simply do not arrive, and requests go on being served exactly as they are
  // now. That is what makes this safe to ship before the console knows about it.
  if (APP_CHECK_KEY && !EMULATED) {
    import(`${SDK}/firebase-app-check.js`)
      .then(check => check.initializeAppCheck(started, {
        provider: new check.ReCaptchaV3Provider(APP_CHECK_KEY),
        isTokenAutoRefreshEnabled: true,
      }))
      .catch(reason => console.info("tavla: App Check kurulamadı —", reason?.message ?? reason));
  }

  const signIn = auth.getAuth(started);
  const db = database.getDatabase(started);
  const firestore = store.getFirestore(started);
  const calls = functions.getFunctions(started, REGION);

  if (EMULATED) {
    auth.connectAuthEmulator(signIn, "http://127.0.0.1:9099", { disableWarnings: true });
    database.connectDatabaseEmulator(db, "127.0.0.1", 9000);
    store.connectFirestoreEmulator(firestore, "127.0.0.1", 8181);
    functions.connectFunctionsEmulator(calls, "127.0.0.1", 5001);
  }

  // Anonymous, because a game of tavla does not need to know who you are. The
  // account is a name for this browser, nothing more, and Firebase is told to
  // sweep up the ones that stop coming back.
  const signedIn = await auth.signInAnonymously(signIn);
  return { auth, database, store, functions, db, firestore, calls, uid: signedIn.user.uid };
}

// Asks the server to do something. Everything the game cannot be trusted to do
// itself is on the other side of one of these.
export async function ask(name, data) {
  const live = await connect();
  if (!live) throw new Error("çevrimdışı");
  const call = live.functions.httpsCallable(live.calls, name);
  const answer = await call(data ?? {});
  return answer.data;
}

// Watches a document and calls back with it every time the server changes it.
// Returns the way to stop watching, and a no-op if there is no connection.
// `gone` is called instead when the record is not there any more, which is how
// a table closing is heard: the server deletes it as the last player leaves,
// rather than leaving a finished game lying about. Watchers that have nothing
// to say about that leave it out and simply stop hearing anything.
export async function follow(path, id, watch, gone) {
  const live = await connect();
  if (!live) return () => {};
  const { store, firestore } = live;
  return store.onSnapshot(store.doc(firestore, path, id), snapshot => {
    if (snapshot.exists()) watch(snapshot.data());
    else gone?.();
  }, reason => console.info("tavla: dinleme koptu —", reason?.message ?? reason));
}

export function connect() {
  opening ??= open().catch(reason => {
    // Blocked, offline, or turned off at the console. Worth a line in the log
    // and nothing more — the board does not depend on any of it.
    console.info("tavla: çevrimiçi bağlantı kurulamadı —", reason?.message ?? reason);
    return null;
  });
  return opening;
}

// The same claim, but for a seat at one match rather than for the lobby. It is
// what tells the other player that somebody is still sitting opposite: when it
// goes, the server may hand their checkers to the computer until it comes back.
//
// `watch` is called with true or false every time the other player's claim
// appears or disappears, and never called at all without a connection.
//
// The claim is written again every few seconds rather than once. onDisconnect
// is the server noticing that a connection has closed, and a connection that
// is cut rather than closed — a phone losing its signal, a router switched off
// — is not closed until the socket times out a minute or more later. For that
// whole minute the seat went on saying somebody was in it, so the other player
// was told nothing at all: the news arrived when their opponent came back and
// the socket finally died, which is the one moment it was no longer true.
const SEAT_PULSE_MS = 5000;

export async function sitAt(matchId, theirUid, watch) {
  const live = await connect();
  if (!live) return () => {};
  const { database, db, uid } = live;
  const { ref, onValue, onDisconnect, set, remove, serverTimestamp } = database;

  const mine = ref(db, `masalar/${matchId}/${uid}`);
  const theirs = ref(db, `masalar/${matchId}/${theirUid}`);

  // Re-made every time the connection comes back, with the standing
  // instruction to clear it re-lodged along with it.
  const stopConnected = onValue(ref(db, ".info/connected"), snapshot => {
    if (snapshot.val() !== true) return;
    onDisconnect(mine).remove();
    set(mine, { at: serverTimestamp() });
  });

  const pulse = setInterval(() => set(mine, { at: serverTimestamp() }), SEAT_PULSE_MS);

  const stopThem = onValue(theirs, snapshot => watch(snapshot.exists()));

  return () => {
    stopConnected();
    stopThem();
    clearInterval(pulse);
    remove(mine);
  };
}

// Is anybody sitting at that seat right now? Asked before going back to a
// match: a table the other player has left as well is not one to sit down at.
export async function seatTaken(matchId, uid) {
  const live = await connect();
  if (!live) return null;
  const { database, db } = live;
  try {
    const found = await database.get(database.ref(db, `masalar/${matchId}/${uid}`));
    return found.exists();
  } catch (reason) {
    // Not knowing is not the same as knowing they have gone, and a player is
    // not kept from their own match by a question that failed to arrive.
    console.info("tavla: koltuk sorulamadı —", reason?.message ?? reason);
    return null;
  }
}

// Says this browser is here for as long as it is, and takes it back the moment
// it is not. The server does the taking back: onDisconnect is a standing
// instruction left with it, so a closed tab, a dead battery or a tunnel are all
// handled without the page having to notice.
//
// But onDisconnect is not a promise that never breaks. A socket cut rather than
// closed — a phone that lost signal, a process killed outright — is taken back
// only when the server times the connection out, and if that instruction was
// ever lost the record is left behind for good. Nothing sweeps them, so the
// lobby count read straight off the child list drifts upward: ghosts of
// sessions that never said goodbye, counted forever.
//
// So the record is stamped and kept fresh on a pulse, and only the ones still
// being written are counted. A dead session stops pulsing the moment it dies
// and ages out of the count within the fresh window, even though its record
// lingers until something clears it.
//
// `watch` is called with the number of people online whenever it changes, and
// never called at all if there is no connection.
const PRESENCE_PULSE_MS = 25000;
// A little over two pulses: a live session that misses one write is not
// dropped, and a dead one is gone soon after.
const PRESENCE_FRESH_MS = 90000;
// Being uncounted and being swept away are different questions, so they are
// asked at different distances. A record stops counting the moment it stops
// being written; deleting one is something done to somebody else, and it must
// not happen to a session that has merely gone quiet for a minute — a phone in
// a tunnel, a laptop asleep with the tab still open. Ten minutes is longer than
// any of those and shorter than forever.
//
// The same number is written into the database rules, and those are what
// actually decide: a browser may delete a record this old and no other. Change
// one and the other has to change with it — firebase/database.rules.json,
// presence/$uid, where a JSON file has nowhere to say why.
const PRESENCE_DEAD_MS = 10 * 60 * 1000;
// How many are cleared in one pass. Sweeping is a courtesy done on the way past
// rather than the point of the visit, so it takes a few and leaves the rest to
// the next pass instead of firing a hundred writes at a door somebody is trying
// to walk through.
const SWEEP_AT_ONCE = 5;

export async function attend(watch) {
  const live = await connect();
  if (!live) return () => {};
  const { database, db, uid } = live;
  const { ref, onValue, onDisconnect, set, remove, serverTimestamp } = database;

  const mine = ref(db, `presence/${uid}`);
  const everyone = ref(db, "presence");

  // The records carry server time, so they have to be judged against the
  // server's clock rather than a phone's, which may be minutes out.
  let skew = 0, clockKnown = false;
  const stopOffset = onValue(ref(db, ".info/serverTimeOffset"),
    snapshot => { skew = snapshot.val() || 0; clockKnown = true; });

  // The connection drops and comes back on its own; the claim has to be made
  // again each time it does, the standing instruction re-lodged with it, and
  // the stamp refreshed on a pulse in between so a long sit stays recent.
  const beat = () => set(mine, { at: serverTimestamp() });
  const stopConnected = onValue(ref(db, ".info/connected"), snapshot => {
    if (snapshot.val() !== true) return;
    onDisconnect(mine).remove();
    beat();
  });
  const pulse = setInterval(beat, PRESENCE_PULSE_MS);

  // Count only the fresh, and clear away the long dead. Recomputed on every
  // change and on a timer as well, so the last stale record still drops when
  // nothing else is writing to wake the listener.
  //
  // The sweeping is done from the page rather than by anything standing over
  // the database, because a record nobody is left to delete is already in the
  // hands of every visitor who reads the count. What keeps it honest is the
  // rules: the clock they judge the age by is the database's own, so a browser
  // whose clock is hours out cannot talk itself into deleting somebody who is
  // still sitting there — it can only be refused.
  let records = [];
  const fresh = () => {
    const now = Date.now() + skew;
    watch(records.filter(r => typeof r.at === "number"
      && now - r.at < PRESENCE_FRESH_MS).length);
    // Not until the database has said what the time is. Until then the only
    // clock here is the device's, and a wrong one would spend the whole
    // allowance on records the rules are going to refuse anyway.
    if (!clockKnown) return;
    records
      .filter(r => r.key !== uid && typeof r.at === "number"
        && now - r.at > PRESENCE_DEAD_MS)
      .slice(0, SWEEP_AT_ONCE)
      // Refused is an ordinary answer rather than a fault: two browsers sweeping
      // the same ghost means the second one finds it already gone.
      .forEach(r => remove(ref(db, `presence/${r.key}`)).catch(() => {}));
  };
  const stopCount = onValue(everyone, snapshot => {
    records = [];
    snapshot.forEach(child => { records.push({ key: child.key, at: child.child("at").val() }); });
    fresh();
  });
  const sweep = setInterval(fresh, PRESENCE_PULSE_MS);

  return () => {
    stopOffset();
    stopConnected();
    stopCount();
    clearInterval(pulse);
    clearInterval(sweep);
    remove(mine);
  };
}
