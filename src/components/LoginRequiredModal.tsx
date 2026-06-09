import { FaTimes } from "react-icons/fa";
import AuthForm from "./AuthForm";

interface LoginRequiredModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function LoginRequiredModal({ isOpen, onClose }: LoginRequiredModalProps) {
    if (!isOpen) return null;

    return (
        <div
            className="login-required-modal-overlay"
            onClick={onClose}
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.6)",
                zIndex: 2000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
                backdropFilter: "blur(3px)",
            }}
        >
            <div
                className="login-required-modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: "#fff",
                    borderRadius: "16px",
                    padding: "30px 24px",
                    maxWidth: "400px",
                    width: "100%",
                    position: "relative",
                    textAlign: "center",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                    animation: "zoomIn 0.2s ease-out",
                    maxHeight: "90vh",
                    overflowY: "auto",
                }}
            >
                <button
                    onClick={onClose}
                    style={{
                        position: "absolute",
                        top: "12px",
                        right: "12px",
                        background: "none",
                        border: "none",
                        color: "#666",
                        fontSize: "1.2rem",
                        cursor: "pointer",
                    }}
                >
                    <FaTimes />
                </button>

                <div style={{ textAlign: "left" }}>
                    <p style={{ color: "#666", marginBottom: "16px", textAlign: "center", fontSize: "0.95rem" }}>
                        Necesitas iniciar sesión para poder dejar una reseña.
                    </p>
                    <AuthForm onSuccess={onClose} />
                </div>
            </div>

            <style>{`
                @keyframes zoomIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
