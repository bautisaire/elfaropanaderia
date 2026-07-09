import { FaShoppingBag } from "react-icons/fa";
import "./PickupOnlyModal.css";

interface PickupOnlyModalProps {
    isOpen: boolean;
    onClose: () => void;
    message: string;
}

export default function PickupOnlyModal({ isOpen, onClose, message }: PickupOnlyModalProps) {
    if (!isOpen) return null;

    return (
        <div className="pickup-only-modal-overlay" onClick={onClose}>
            <div className="pickup-only-modal-content" onClick={e => e.stopPropagation()}>
                <span className="pickup-only-icon">
                    <FaShoppingBag />
                </span>
                <h3 className="pickup-only-title">Solo Retiro en Local</h3>
                <p className="pickup-only-message">
                    {message || "¡Atención! Actualmente solo estamos tomando pedidos para RETIRO EN EL LOCAL."}
                </p>
                <button className="pickup-only-btn" onClick={onClose}>
                    Entendido
                </button>
            </div>
        </div>
    );
}
