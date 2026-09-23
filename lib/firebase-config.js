// Firebase config supplied for AGRO CONNECT.
// This project intentionally uses open Realtime Database rules for prototype/demo use.

export const firebaseConfig = {
  apiKey: "AIzaSyBhAQVvTpb9KlabNzRrhgzjqtDVmxmV7nw",
  authDomain: "agro-connect-29b39.firebaseapp.com",
  projectId: "agro-connect-29b39",
  storageBucket: "agro-connect-29b39.firebasestorage.app",
  messagingSenderId: "511349752641",
  appId: "1:511349752641:web:57fa655b03ff5b6dc517c0",

  // IMPORTANT:
  // If Firebase Console shows a different Realtime Database URL,
  // replace only this line with the exact URL shown in:
  // Firebase Console -> Realtime Database -> Data
  databaseURL: "https://agro-connect-29b39-default-rtdb.firebaseio.com"
};

export const DEVICE_ID = "AGRO-001";
export const DATABASE_URL = firebaseConfig.databaseURL;
