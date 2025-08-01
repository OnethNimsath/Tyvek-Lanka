// firebase_config.js

// Firebase configuration
const firebaseConfig = {
    // CORRECTED API KEY HERE:
    apiKey: "AIzaSyAo4MUZvb-eBcl_9YbdkW3QBY64SJrNudQ", 
    authDomain: "tyveklanka-a9dd1.firebaseapp.com",
    projectId: "tyveklanka-a9dd1",
    storageBucket: "tyveklanka-a9dd1.firebasestorage.app",
    messagingSenderId: "985040063470",
    appId: "1:985040063470:web:8034aba2c17aae72f45cff"
};

// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Export app and db
export { app, db };