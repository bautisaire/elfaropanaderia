import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
type LoginModalProps = {
  onClose: () => void;
};
export default function LoginModal({ onClose }: LoginModalProps) {
  const [open, setOpen] = useState(false);
  const { loginWithGoogle, loginWithFacebook } = useAuth();

  useEffect(() => {
    const openEvent = () => setOpen(true);
    document.addEventListener("openLogin", openEvent);
    return () => document.removeEventListener("openLogin", openEvent);
  }, []);

  if (!open) return null;

  return (
    <div className="modal">
      <button onClick={onClose}>Cerrar</button>
      <div className="modal-content">
        <h2>Iniciar Sesión</h2>

        <button onClick={() => loginWithGoogle().then(() => setOpen(false))}>
          Iniciar con Google
        </button>

        <button onClick={() => loginWithFacebook().then(() => setOpen(false))}>
          Iniciar con Facebook
        </button>

        <button onClick={() => setOpen(false)}>Cerrar</button>
      </div>
    </div>
  );
}

