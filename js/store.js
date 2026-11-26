// Opslag: Firebase (Auth + Firestore) of, met ?demo in de URL, een lokaal bestand om te testen.
// Firestore: users/{uid}/loonfiches/{YYYY-MM_bedrag} = uitgelezen loonfiche (zie loonfiche.js).

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const DEMO = new URLSearchParams(location.search).has('demo');

let fb = null;
let klaar = null;
let demo = null;

export function init(onUser) {
  klaar = start(onUser);
  return klaar;
}

async function start(onUser) {
  if (DEMO) { onUser({ uid: 'demo', displayName: 'Demo', demo: true }); return; }
  const { firebaseConfig } = await import('../firebase-config.js');
  const [{ initializeApp }, a, f] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = a.getAuth(app);
  const db = f.initializeFirestore(app, { localCache: f.persistentLocalCache() });
  fb = { auth, db, a, f };
  a.getRedirectResult(auth).catch(() => {});
  a.onAuthStateChanged(auth, (u) => onUser(u));
}

export async function login() {
  await klaar;
  if (!fb) throw new Error('Firebase is niet geladen. Herlaad de pagina.');
  const { auth, a } = fb;
  const provider = new a.GoogleAuthProvider();
  try { await a.signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await a.signInWithRedirect(auth, provider);
    } else throw e;
  }
}

export async function logout() { if (fb) await fb.a.signOut(fb.auth); }

// Eén document per fiche. Dezelfde fiche opnieuw inlezen overschrijft ze; een tweede fiche
// in dezelfde maand (ander bedrag) komt ernaast.
export const ficheId = (f) => `${f.maand}_${Math.round((f.totalen.totaal ?? f.totalen.netto) * 100)}`;

export async function laad(user) {
  if (user.demo) {
    if (!demo) {
      const r = await fetch('demo-data.json', { cache: 'no-store' });
      demo = r.ok ? await r.json() : {};
    }
    return Object.entries(demo).map(([id, d]) => ({ id, ...d }));
  }
  const { db, f } = fb;
  const snap = await f.getDocs(f.collection(db, 'users', user.uid, 'loonfiches'));
  const lijst = [];
  snap.forEach((d) => lijst.push({ id: d.id, ...d.data() }));
  return lijst;
}

export async function bewaar(user, fiches) {
  if (user.demo) { for (const x of fiches) demo[ficheId(x)] = x; return fiches.length; }
  const { db, f } = fb;
  for (let i = 0; i < fiches.length; i += 400) {
    const batch = f.writeBatch(db);
    for (const x of fiches.slice(i, i + 400)) batch.set(f.doc(db, 'users', user.uid, 'loonfiches', ficheId(x)), x);
    await batch.commit();
  }
  return fiches.length;
}

export async function verwijder(user, id) {
  if (user.demo) { delete demo[id]; return; }
  const { db, f } = fb;
  await f.deleteDoc(f.doc(db, 'users', user.uid, 'loonfiches', id));
}
