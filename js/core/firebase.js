import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { appError, readPreference, writePreference } from './utils.js';

// NiRi: versi diverifikasi pada https://firebase.google.com/support/release-notes/js (14-11-2026).
export const FIREBASE_VERSION = '13.3.0';
let instance;

export async function initializeFirebase() {
  if (!isFirebaseConfigured()) throw appError('config-missing');
  if (instance) return instance;
  instance = (async () => {
    const [appSDK, authSDK, firestoreSDK] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js'),
    ]);
    const app = appSDK.initializeApp(firebaseConfig);
    app.automaticDataCollectionEnabled = false;
    // NiRi: tanpa popup/redirect resolver, sesuai fitur Email/Password dan CSP frame-src none.
    // https://firebase.google.com/docs/auth/web/custom-dependencies
    const auth = authSDK.initializeAuth(app, { persistence: [authSDK.indexedDBLocalPersistence, authSDK.browserLocalPersistence, authSDK.browserSessionPersistence] });
    auth.languageCode = 'id';
    // NiRi: cache disk hanya setelah persetujuan perangkat pribadi; default cache memori.
    // https://firebase.google.com/docs/firestore/manage-data/enable-offline#web
    const persistent = readPreference('trusted-device', 'false') === 'true';
    const db = firestoreSDK.initializeFirestore(app, {
      localCache: persistent ? firestoreSDK.persistentLocalCache({ tabManager: firestoreSDK.persistentMultipleTabManager() }) : firestoreSDK.memoryLocalCache(),
    });
    const gateway = {
      observe: (next, error) => authSDK.onAuthStateChanged(auth, next, error),
      async persistence(trusted) {
        await authSDK.setPersistence(auth, trusted ? authSDK.browserLocalPersistence : authSDK.browserSessionPersistence);
        writePreference('trusted-device', trusted);
      },
      async login(email, password, trusted) {
        await gateway.persistence(trusted);
        return (await authSDK.signInWithEmailAndPassword(auth, email, password)).user;
      },
      async register(email, password, trusted) {
        await gateway.persistence(trusted);
        return (await authSDK.createUserWithEmailAndPassword(auth, email, password)).user;
      },
      resetPassword: (email) => authSDK.sendPasswordResetEmail(auth, email),
      logout: () => authSDK.signOut(auth),
      current: () => auth.currentUser,
    };
    return { db, firestoreSDK, gateway, persistent };
  })();
  try { return await instance; } catch (error) { instance = null; throw error; }
}
