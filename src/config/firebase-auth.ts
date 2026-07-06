import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyA7-xT82FIWjX_SL4I-gS7cNtf_GfqtV1M",
  authDomain: "rapids-platform.firebaseapp.com",
  projectId: "rapids-platform",
  storageBucket: "rapids-platform.firebasestorage.app",
  messagingSenderId: "835676485453",
  appId: "1:835676485453:web:48acfc8fe149dbfcc96904"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Restrict to risalabs.ai domain
googleProvider.setCustomParameters({
  hd: 'risalabs.ai'
});
