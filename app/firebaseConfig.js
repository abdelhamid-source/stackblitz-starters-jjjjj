import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Your specific Buffalo/Research Lab configuration
const firebaseConfig = {
  apiKey: 'AIzaSyBv7P9RVGYOZ-ORZ7PASadMyZPPNxBRvSc',
  authDomain: 'research-lab-feedback-coach.firebaseapp.com',
  projectId: 'research-lab-feedback-coach',
  storageBucket: 'research-lab-feedback-coach.firebasestorage.app',
  messagingSenderId: '80385187269',
  appId: '1:80385187269:web:dee7104c99aaa620477fac',
  measurementId: 'G-5ZKT9B6Y6H',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// This exports the database so our other files can use it
export const db = getFirestore(app);
