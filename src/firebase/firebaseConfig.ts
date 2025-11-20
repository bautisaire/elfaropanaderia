import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBXq2cwn5CGWyHWuDfTSC2IlQPVMoXzMjs",
  authDomain: "authfaro.firebaseapp.com",
  projectId: "authfaro",
  storageBucket: "authfaro.firebasestorage.app",
  messagingSenderId: "789655649636",
  appId: "1:789655649636:web:1dc8a543361d08e4c64e71"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();