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
export async function follow(path, id, watch) {
  const live = await connect();
  if (!live) return () => {};
  const { store, firestore } = live;
  return store.onSnapshot(store.doc(firestore, path, id), snapshot => {
    if (snapshot.exists()) watch(snapshot.data());
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

  const stopThem = onValue(theirs, snapshot => watch(snapshot.exists()));

  return () => {
    stopConnected();
    stopThem();
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
// `watch` is called with the number of people at the table whenever it changes,
// and never called at all if there is no connection.
export async function attend(watch) {
  const live = await connect();
  if (!live) return () => {};
  const { database, db, uid } = live;
  const { ref, onValue, onDisconnect, set, remove, serverTimestamp } = database;

  const mine = ref(db, `presence/${uid}`);
  const everyone = ref(db, "presence");

  // The connection drops and comes back on its own; the claim has to be made
  // again each time it does, and the standing instruction re-lodged with it.
  const stopConnected = onValue(ref(db, ".info/connected"), snapshot => {
    if (snapshot.val() !== true) return;
    onDisconnect(mine).remove();
    set(mine, { at: serverTimestamp() });
  });

  const stopCount = onValue(everyone, snapshot => watch(snapshot.size));

  return () => {
    stopConnected();
    stopCount();
    remove(mine);
  };
}
