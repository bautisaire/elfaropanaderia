import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";
import { getFunctions } from "firebase/functions";


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
// Analytics es accesorio: en algunos navegadores móviles o con protecciones
// de privacidad no está disponible. No debe impedir que se abra la tienda.
let analytics: any = null;
isAnalyticsSupported()
  .then((supported) => {
    if (supported) analytics = getAnalytics(app);
  })
  .catch((error) => console.warn("Analytics no está disponible en este navegador:", error));
const db = initializeFirestore(app, {
  // Single-tab a propósito: con el multi-tab solo UNA pestaña ("primaria") habla con el
  // servidor y el resto recibe los datos a través de ella vía IndexedDB. Si esa pestaña
  // queda congelada en segundo plano (ahorro de memoria del navegador), las demás se
  // quedan cargando para siempre sin error. Con single-tab la primera pestaña usa el
  // caché persistente y las otras caen solas a caché en memoria, cada una con su conexión.
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
  // Evita que conexiones lentas/con proxy (wifi del local, datos móviles) se queden
  // colgadas varios segundos esperando el canal de streaming por defecto.
  experimentalAutoDetectLongPolling: true
});
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app);

let messaging: any = null;
isSupported()
  .then(supported => {
    if (supported) messaging = getMessaging(app);
  })
  .catch(() => {
    // Notificaciones no disponibles: la tienda sigue funcionando normalmente.
  });

const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();


export { app, analytics, db, auth, googleProvider, facebookProvider, storage, messaging, functions };
