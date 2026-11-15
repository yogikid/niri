// NiRi: config Web App bersifat publik. Jangan masukkan service account atau private key.
export const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyCZOWeNtZbhEukQMuexglynnoQjXYpVZ4s',
  authDomain: 'niri-wellwellwell.firebaseapp.com',
  projectId: 'niri-wellwellwell',
  appId: '1:62336082498:web:64d5cd3ffcb2b6d43f03db',
  messagingSenderId: '62336082498',
});

export function isFirebaseConfigured() {
  return ['apiKey', 'authDomain', 'projectId', 'appId'].every((key) => Boolean(firebaseConfig[key]) && !firebaseConfig[key].startsWith('ISI_'));
}
