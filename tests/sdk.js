const result = document.querySelector('#sdk-result');
try {
  const [app, auth, firestore] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js'),
  ]);
  const authMethods = ['initializeAuth', 'setPersistence', 'onAuthStateChanged', 'createUserWithEmailAndPassword', 'signInWithEmailAndPassword', 'sendPasswordResetEmail', 'signOut'];
  const dataMethods = ['initializeFirestore', 'memoryLocalCache', 'persistentLocalCache', 'persistentMultipleTabManager', 'runTransaction', 'serverTimestamp', 'onSnapshot', 'startAfter', 'getDocs', 'getDoc', 'setDoc', 'query', 'where', 'orderBy', 'limit', 'collection', 'doc'];
  const missing = [...authMethods.filter((key) => typeof auth[key] !== 'function'), ...dataMethods.filter((key) => typeof firestore[key] !== 'function')];
  if (!auth.indexedDBLocalPersistence || !auth.browserSessionPersistence || !auth.browserLocalPersistence) missing.push('Auth persistence');
  if (missing.length) throw new Error(`API tidak ditemukan: ${missing.join(', ')}`);
  if (app.SDK_VERSION !== '13.3.0') throw new Error('Versi SDK tidak cocok.');
  result.textContent = `LULUS — Firebase ${app.SDK_VERSION}: semua API yang digunakan tersedia. Tidak ada request data project.`;
  window.__sdkResult = { passed: true, version: app.SDK_VERSION };
} catch (error) {
  result.textContent = `GAGAL — SDK tidak dapat diverifikasi: ${error.message}. Periksa akses ke www.gstatic.com.`;
  window.__sdkResult = { passed: false };
}
