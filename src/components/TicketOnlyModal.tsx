import { FaTicketAlt } from "react-icons/fa";
import "./TicketOnlyModal.css";

interface TicketOnlyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function TicketOnlyModal({ isOpen, onClose }: TicketOnlyModalProps) {
    if (!isOpen) return null;

    return (
        <div className="ticket-only-modal-overlay" onClick={onClose}>
            <div className="ticket-only-modal-content" onClick={e => e.stopPropagation()}>
                <span className="ticket-only-icon">
                    <FaTicketAlt />
                </span>
                <h3 className="ticket-only-title">Te falta agregar un producto</h3>
                <p className="ticket-only-message">
                    El boleto del sorteo no se puede comprar solo. Agregá algún producto de la panadería a tu pedido para poder finalizar la compra.
                </p>
                <button className="ticket-only-btn" onClick={onClose}>
                    Entendido
                </button>
            </div>
        </div>
    );
}
