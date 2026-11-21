import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';

const firebaseConfig = {
  apiKey: "AIzaSyCuJLxRCdhAVZoN81-5weEFnSU4nDr98lo",
  authDomain: "test-2a0d0.firebaseapp.com",
  databaseURL: "https://test-2a0d0-default-rtdb.firebaseio.com",
  projectId: "test-2a0d0",
  storageBucket: "test-2a0d0.firebasestorage.app",
  messagingSenderId: "396740286096",
  appId: "1:396740286096:web:430751766ca9c384946a15",
  measurementId: "G-W05VPQX3V2",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.database();
export default firebase;
