import { Link } from "react-router-dom";
import { FaTimes, FaUser, FaShoppingBag, FaShoppingCart } from "react-icons/fa";
import "./LeftSidebar.css";

interface LeftSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    activeOrdersCount: number;
    cartTotalItems: number;
    onOpenCart: () => void;
}

export default function LeftSidebar({ isOpen, onClose, activeOrdersCount, cartTotalItems, onOpenCart }: LeftSidebarProps) {
    return (
        <>
            <div className={`left-sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
            <div className={`left-sidebar ${isOpen ? 'open' : ''}`}>
                <div className="left-sidebar-header">
                    <h2>Menú</h2>
                    <button className="close-left-sidebar-btn" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="left-sidebar-body">
                    <div className="left-sidebar-item disabled">
                        <FaUser className="left-sidebar-icon" />
                        <span className="left-sidebar-text">Mi Cuenta (Próximamente)</span>
                    </div>
                    <div className="left-sidebar-item" onClick={() => { onClose(); onOpenCart(); }} style={{ position: 'relative' }}>
                        <FaShoppingCart className="left-sidebar-icon" />
                        <span className="left-sidebar-text">Carrito</span>
                        {cartTotalItems > 0 && (
                            <span className="left-sidebar-badge">
                                {cartTotalItems}
                            </span>
                        )}
                    </div>
                    <Link to="/mis-pedidos" className="left-sidebar-item" onClick={onClose} style={{ position: 'relative' }}>
                        <FaShoppingBag className="left-sidebar-icon" />
                        <span className="left-sidebar-text">Mis Pedidos</span>
                        {activeOrdersCount > 0 && (
                            <span className="left-sidebar-badge">
                                {activeOrdersCount}
                            </span>
                        )}
                    </Link>
                </div>
            </div>
        </>
    );
}
