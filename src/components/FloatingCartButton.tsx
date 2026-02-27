import { useContext } from 'react';
import { CartContext } from '../context/CartContext';
import { FaShoppingCart } from 'react-icons/fa';
import './FloatingCartButton.css';

export default function FloatingCartButton() {
    const { cart, setIsSidebarOpen } = useContext(CartContext);

    // If cart is empty, do not show the button
    if (cart.length === 0) return null;

    // Calculate total items in cart
    const totalItems = cart.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);

    return (
        <button
            className="floating-cart-btn"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Abrir carrito"
        >
            <div className="floating-cart-icon-wrapper">
                <FaShoppingCart className="floating-cart-icon" />
                <span className="floating-cart-badge">{totalItems}</span>
            </div>
        </button>
    );
}
