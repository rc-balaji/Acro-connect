// Firebase config for AGRO CONNECT
// Open prototype/demo setup using Firebase Realtime Database

export const firebaseConfig = {
  apiKey: "AIzaSyBhAQVvTpb9KlabNzRrhgzjqtDVmxmV7nw",

  authDomain: "agro-connect-29b39.firebaseapp.com",

  projectId: "agro-connect-29b39",

  storageBucket: "agro-connect-29b39.firebasestorage.app",

  messagingSenderId: "511349752641",

  appId: "1:511349752641:web:57fa655b03ff5b6dc517c0",

  databaseURL:
    "https://agro-connect-29b39-default-rtdb.asia-southeast1.firebasedatabase.app",
};

// Device ID used throughout the dashboard + webhook
export const DEVICE_ID = "AGRO-001";

// REST API base URL
export const DATABASE_URL = firebaseConfig.databaseURL;
