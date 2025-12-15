import "./StockErrorModal.css";

interface StockErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    outOfStockItems: {
        id: string;
        name: string;
        requested: number;
        available: number;
    }[];
}

export default function StockErrorModal({ isOpen, onConfirm, outOfStockItems }: StockErrorModalProps) {

    if (!isOpen) return null;

    return (
        <div className="stock-modal-overlay">
            <div className="stock-modal-content">
                <div className="stock-modal-icon">⚠️</div>
                <h3>Algunos productos no tienen stock suficiente</h3>
                <p>Por favor, revisa tu carrito:</p>

                <ul className="stock-error-list">
                    {outOfStockItems.map(item => (
                        <li key={item.id}>
                            <strong>{item.name}</strong>
                            <br />
                            <span className="stock-detail">
                                Pediste: {item.requested} | Disponible: {item.available}
                            </span>
                        </li>
                    ))}
                </ul>

                <div className="stock-modal-actions">
                    <button className="btn-close-modal" onClick={onConfirm} style={{ width: '100%' }}>
                        Modificar mi pedido
                    </button>
                </div>
            </div>
        </div>
    );
}
