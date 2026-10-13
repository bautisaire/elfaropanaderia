import { useContext, useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FaPlus, FaMinus, FaTrash, FaEdit, FaTicketAlt, FaChevronRight } from "react-icons/fa";
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
        cartHasOnlyRaffleTickets,
        requireProductWithTicket,
    } = useContext(CartContext);
    const navigate = useNavigate();
    const inCheckout = useLocation().pathname.startsWith("/checkout");

    const [priceEditModal, setPriceEditModal] = useState<{
        isOpen: boolean;
        itemId: string;
        itemName: string;
        currentPrice: number;
    }>({ isOpen: false, itemId: '', itemName: '', currentPrice: 0 });

    // Bloquea el scroll de la página mientras el carrito está abierto. `overflow: hidden`
    // no alcanza en iOS (la página se mueve al arrastrar el panel), así que se fija el body
    // en su posición actual y se restaura el scroll al cerrar.
    useEffect(() => {
        if (!isSidebarOpen) return;
        const scrollY = window.scrollY;
        const body = document.body;
        const prev = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
        body.style.position = 'fixed';
        body.style.top = `-${scrollY}px`;
        body.style.width = '100%';
        body.style.overflow = 'hidden';
        return () => {
            body.style.position = prev.position;
            body.style.top = prev.top;
            body.style.width = prev.width;
            body.style.overflow = prev.overflow;
            window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
        };
    }, [isSidebarOpen]);

    const handleClose = () => {
        setIsSidebarOpen(false);
    };

    // Arrastrar hacia abajo cierra el carrito como una cortina.
    const sheetRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const drag = useRef({ eligible: false, active: false, startY: 0, dy: 0, startT: 0 });

    const onTouchStart = (e: React.TouchEvent) => {
        const inBody = bodyRef.current?.contains(e.target as Node);
        drag.current = {
            eligible: !inBody || (bodyRef.current?.scrollTop ?? 0) <= 0,
            active: false,
            startY: e.touches[0].clientY,
            dy: 0,
            startT: Date.now(),
        };
    };

    const onTouchMove = (e: React.TouchEvent) => {
        const d = drag.current;
        const sheet = sheetRef.current;
        if (!d.eligible || !sheet) return;
        const dy = e.touches[0].clientY - d.startY;
        if (dy <= 0 && !d.active) return;
        d.active = true;
        d.dy = Math.max(0, dy);
        sheet.style.transition = "none";
        sheet.style.transform = `translateY(${d.dy}px)`;
        if (overlayRef.current) {
            overlayRef.current.style.transition = "none";
            overlayRef.current.style.opacity = String(Math.max(0, 1 - d.dy / sheet.offsetHeight));
        }
    };

    const onTouchEnd = () => {
        const d = drag.current;
        if (!d.active) return;
        const velocity = d.dy / Math.max(1, Date.now() - d.startT);
        const shouldClose = d.dy > 110 || velocity > 0.6;
        d.active = false;
        // Quitar los estilos inline: la transición CSS lleva el panel a su posición final.
        if (sheetRef.current) {
            sheetRef.current.style.transition = "";
            sheetRef.current.style.transform = "";
        }
        if (overlayRef.current) {
            overlayRef.current.style.transition = "";
            overlayRef.current.style.opacity = "";
        }
        if (shouldClose) setIsSidebarOpen(false);
    };

    const handleCheckout = () => {
        // Ya estamos en el checkout: solo se cierra el carrito donde estaba.
        if (inCheckout) {
            setIsSidebarOpen(false);
            return;
        }
        if (cartHasOnlyRaffleTickets) {
            requireProductWithTicket();
            return;
        }
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
                ref={overlayRef}
                className={`cart-sidebar-overlay ${isSidebarOpen ? 'open' : ''}`}
                onClick={handleClose}
            />

            {/* Sidebar Panel */}
            <div
                ref={sheetRef}
                className={`cart-sidebar ${isSidebarOpen ? 'open' : ''}`}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchEnd}
            >
                <div className="cart-sidebar-grabber" />

                <div className="cart-sidebar-header">
                    <button className="continue-shopping-btn" onClick={handleClose}>
                        Seguir comprando <FaChevronRight size={12} />
                    </button>
                    <h2>Tu Selección</h2>
                </div>

                <div className="cart-sidebar-body" ref={bodyRef}>
                    {cart.length === 0 ? (
                        <div className="cart-sidebar-empty">
                            <p>Tu carrito está vacío</p>
                        </div>
                    ) : (
                        cart.map((item) => (
                            <div key={`${item.id}-${item.selectedVariant || 'base'}`} className="sidebar-item">
                                {item.isRaffleTicket ? (
                                    <div className="sidebar-item-img sidebar-item-ticket-icon">
                                        <FaTicketAlt size={28} />
                                    </div>
                                ) : (
                                    <img src={getImage(item)} alt={item.name} className="sidebar-item-img" />
                                )}

                                <div className="sidebar-item-details">
                                    <h4 className="sidebar-item-title">
                                        {item.name}
                                        {item.selectedVariant && <span style={{ fontSize: '0.85em', color: '#a8a29e', display: 'block' }}>{item.selectedVariant}</span>}
                                        {item.selectedComboItems && item.selectedComboItems.length > 0 && (
                                            <div style={{ fontSize: '0.8em', color: '#a8a29e', marginTop: '4px', lineHeight: '1.3', fontWeight: 'normal' }}>
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
                                                        itemId: String(item.id),
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

                <div className="cart-sidebar-footer">
                    <div className="sidebar-summary">
                        <span>Total:</span>
                        <strong>$ {Math.floor(cartTotal)}</strong>
                    </div>
                    <button className="sidebar-checkout-btn" onClick={handleCheckout} disabled={cart.length === 0}>
                        {inCheckout ? "Continuar la compra" : "Ir a pagar →"}
                    </button>
                </div>
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
