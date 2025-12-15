import { FaStoreSlash } from "react-icons/fa6"; // Ensure react-icons/fa6 is valid or use fa
import "./ClosedModal.css";

interface ClosedModalProps {
    isOpen: boolean;
    onClose: () => void;
    message: string;
}

export default function ClosedModal({ isOpen, onClose, message }: ClosedModalProps) {
    if (!isOpen) return null;

    return (
        <div className="closed-modal-overlay" onClick={onClose}>
            <div className="closed-modal-content" onClick={e => e.stopPropagation()}>
                <span className="closed-icon">
                    <FaStoreSlash />
                </span>
                <h3 className="closed-title">Tienda Cerrada</h3>
                <p className="closed-message">
                    {message || "Lo sentimos, el local se encuentra cerrado en este momento."}
                </p>
                <button className="closed-btn" onClick={onClose}>
                    Entendido
                </button>
            </div>
        </div>
    );
}
