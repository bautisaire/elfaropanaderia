import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaTimes, FaPlus, FaMinus, FaTrash, FaShoppingBag, FaEdit } from "react-icons/fa";
import { CartContext } from "../context/CartContext";
import PriceEditModal from "./PriceEditModal";
import "./CartSidebar.css";

export default function CartSidebar() {
    const {
        cart,
        addToCart,
        removeFromCart,
        removeCompletelyFromCart,
        cartTotal,
        isSidebarOpen,
        setIsSidebarOpen,
        canAddMore,
        isSuperAdmin,
        adminPermissions,
        updateCartItemPrice,
    } = useContext(CartContext);
    const navigate = useNavigate();

    const [priceEditModal, setPriceEditModal] = useState<{
        isOpen: boolean;
        itemId: string;
        itemName: string;
        currentPrice: number;
    }>({ isOpen: false, itemId: '', itemName: '', currentPrice: 0 });

    const handleClose = () => {
        setIsSidebarOpen(false);
    };

    const handleCheckout = () => {
        setIsSidebarOpen(false);
        navigate("/checkout");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // Helper to get image
    const getImage = (item: any) => {
        if (item.selectedVariant) {
            const variant = item.variants?.find((v: any) => v.name === item.selectedVariant);
            if (variant && variant.image) return variant.image;
        }
        if (item.image) return item.image;
        if (item.images && item.images.length > 0) return item.images[0];
        return "https://via.placeholder.com/70";
    };

    return (
        <>
            {/* Overlay Background */}
            <div
                className={`cart-sidebar-overlay ${isSidebarOpen ? 'open' : ''}`}
                onClick={handleClose}
            />

            {/* Sidebar Panel */}
            <div className={`cart-sidebar ${isSidebarOpen ? 'open' : ''}`}>

                <div className="cart-sidebar-header">
                    <h2>
                        <FaShoppingBag />
                        Mi Carrito
                    </h2>
                    <button className="close-sidebar-btn" onClick={handleClose}>
                        <FaTimes />
                    </button>
                </div>

                <div className="cart-sidebar-body">
                    {cart.length === 0 ? (
                        <div className="cart-sidebar-empty">
                            <FaShoppingBag size={50} color="#ddd" />
                            <p>Tu carrito está vacío</p>
                            <button className="start-shopping-btn" onClick={handleClose}>
                                Ver Menú
                            </button>
                        </div>
                    ) : (
                        cart.map((item) => (
                            <div key={`${item.id}-${item.selectedVariant || 'base'}`} className="sidebar-item">
                                <img src={getImage(item)} alt={item.name} className="sidebar-item-img" />

                                <div className="sidebar-item-details">
                                    <h4 className="sidebar-item-title">
                                        {item.name}
                                        {item.selectedVariant && <span style={{ fontSize: '0.85em', color: '#666', display: 'block' }}>{item.selectedVariant}</span>}
                                        {item.selectedComboItems && item.selectedComboItems.length > 0 && (
                                            <div style={{ fontSize: '0.8em', color: '#666', marginTop: '4px', lineHeight: '1.3', fontWeight: 'normal' }}>
                                                {item.selectedComboItems.map((comboItem, idx) => (
                                                    <div key={idx}>- {comboItem.quantity}x {comboItem.name}</div>
                                                ))}
                                            </div>
                                        )}
                                    </h4>
                                    <div className="sidebar-item-price" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        ${Math.floor(item.price)} C/U
                                        {(isSuperAdmin || adminPermissions?.orders_can_edit_prices) && (
                                            <button
                                                style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0 }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPriceEditModal({
                                                        isOpen: true,
                                                        itemId: item.id,
                                                        itemName: item.name,
                                                        currentPrice: item.price
                                                    });
                                                }}
                                                title="Editar Precio Unitario"
                                            >
                                                <FaEdit size={12} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="sidebar-item-controls">
                                        <div className="sidebar-qty-controls">
                                            <button
                                                className="sidebar-btn-qty"
                                                onClick={() => removeFromCart(item.id)}
                                            >
                                                <FaMinus size={10} />
                                            </button>
                                            <span className="sidebar-qty">{item.quantity}</span>
                                            <button
                                                className="sidebar-btn-qty"
                                                onClick={() => addToCart(item)}
                                                disabled={!canAddMore(item)}
                                                aria-label={canAddMore(item) ? "Agregar uno más" : "Stock máximo"}
                                            >
                                                <FaPlus size={10} />
                                            </button>
                                        </div>

                                        <button
                                            className="sidebar-btn-remove"
                                            onClick={() => removeCompletelyFromCart(item.id)}
                                        >
                                            <FaTrash size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {cart.length > 0 && (
                    <div className="cart-sidebar-footer">
                        <div className="sidebar-summary">
                            <span>Total:</span>
                            <strong>${Math.floor(cartTotal)}</strong>
                        </div>
                        <button className="sidebar-checkout-btn" onClick={handleCheckout}>
                            Proceder al pago
                        </button>
                    </div>
                )}
            </div>

            <PriceEditModal
                isOpen={priceEditModal.isOpen}
                onClose={() => setPriceEditModal((prev: any) => ({ ...prev, isOpen: false }))}
                itemName={priceEditModal.itemName}
                currentPrice={priceEditModal.currentPrice}
                onSave={(newPrice) => {
                    if (priceEditModal.itemId) {
                        updateCartItemPrice(priceEditModal.itemId, newPrice);
                    }
                }}
            />
        </>
    );
}
