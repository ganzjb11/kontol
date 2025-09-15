// public/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// PASTE KUNCI FIREBASE KAMU DI SINI
const firebaseConfig = {
  apiKey: "AIzaSyDZnXCAO6b7mu5E3lC1xGEO_YUByphQB2k",
  authDomain: "web-gw-f63be.firebaseapp.com",
  projectId: "web-gw-f63be",
  storageBucket: "web-gw-f63be.firebasestorage.app",
  messagingSenderId: "839331123143",
  appId: "1:839331123143:web:defa080f403bf1ebd953e2",
  measurementId: "G-FK4RH5ZQY2"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);