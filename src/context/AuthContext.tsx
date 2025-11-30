import { createContext, useContext, useEffect, useState } from "react";
import { auth, googleProvider, facebookProvider } from "../firebase/firebaseConfig";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

// ===============================
// 🔹 Tipo del contexto (TS)
// ===============================
type AuthContextType = {
  user: any; 
  loginWithGoogle: () => Promise<any>;
  loginWithFacebook: () => Promise<any>;
  logout: () => Promise<void>;
};

// ===============================
// 🔹 Crear contexto con tipo (puede ser null antes de inicializarse)
// ===============================
const AuthContext = createContext<AuthContextType | null>(null);

// ===============================
// 🔹 Provider
// ===============================
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);

  // Detectar si está logueado
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsub;
  }, []);

  const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
  const loginWithFacebook = () => signInWithPopup(auth, facebookProvider);
  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider
      value={{
        user,
        loginWithGoogle,
        loginWithFacebook,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ===============================
// 🔹 Hook seguro (evita null)
// ===============================
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return ctx;
};