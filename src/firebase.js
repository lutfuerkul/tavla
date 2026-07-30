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

// Nothing is fetched until something asks for it, and it is only fetched once.
let opening = null;

async function open() {
  const [app, auth, database] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
  ]);
  const started = app.initializeApp(CONFIG);
  // Anonymous, because a game of tavla does not need to know who you are. The
  // account is a name for this browser, nothing more, and Firebase is told to
  // sweep up the ones that stop coming back.
  const signedIn = await auth.signInAnonymously(auth.getAuth(started));
  return { auth, database, db: database.getDatabase(started), uid: signedIn.user.uid };
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
