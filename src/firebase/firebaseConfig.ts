import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Usamos las variables de entorno
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); // <--- 2. INICIALIZAR STORAGE

const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

// Exportamos todo lo necesario
//                                                                    👇 3. AGREGAR AQUI
export { app, analytics, db, auth, googleProvider, facebookProvider, storage };