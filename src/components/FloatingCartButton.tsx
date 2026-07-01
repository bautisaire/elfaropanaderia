import { useContext, useState, useEffect, useRef } from 'react';
import { CartContext } from '../context/CartContext';
import { FaShoppingCart } from 'react-icons/fa';
import './FloatingCartButton.css';

export default function FloatingCartButton() {
    const { cart, isSidebarOpen, setIsSidebarOpen } = useContext(CartContext);
    const [showReminder, setShowReminder] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const totalItems = cart.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);

    useEffect(() => {
        if (isSidebarOpen || totalItems === 0) {
            setShowReminder(false);
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        setShowReminder(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        
        timerRef.current = setTimeout(() => {
            setShowReminder(true);
        }, 5000);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [totalItems, isSidebarOpen]);

    if (cart.length === 0) return null;

    return (
        <>
            {showReminder && (
                <div className="floating-cart-reminder animate-pop">
                    ¡Finaliza tu compra aquí!
                </div>
            )}
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
        </>
    );
}
