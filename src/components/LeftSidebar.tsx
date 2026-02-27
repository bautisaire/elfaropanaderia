import { Link } from "react-router-dom";
import { FaTimes, FaUser, FaShoppingCart } from "react-icons/fa";
import "./LeftSidebar.css";

interface LeftSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    cartTotalItems: number;
    onOpenCart: () => void;
}

export default function LeftSidebar({ isOpen, onClose, cartTotalItems, onOpenCart }: LeftSidebarProps) {
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
                    <Link to="/mi-cuenta" className="left-sidebar-item" onClick={onClose}>
                        <FaUser className="left-sidebar-icon" />
                        <span className="left-sidebar-text">Mi Cuenta</span>
                    </Link>
                    <div className="left-sidebar-item" onClick={() => { onClose(); onOpenCart(); }} style={{ position: 'relative' }}>
                        <FaShoppingCart className="left-sidebar-icon" />
                        <span className="left-sidebar-text">Carrito</span>
                        {cartTotalItems > 0 && (
                            <span className="left-sidebar-badge">
                                {cartTotalItems}
                            </span>
                        )}
                    </div>

                </div>
            </div>
        </>
    );
}
