import { useState, useEffect } from "react";
import { FaTimes } from "react-icons/fa";
import { Product, useCart } from "../context/CartContext";
import ReviewsSection from "./ReviewsSection";
import "./ProductCard.css"; // Reuse some styles for variants/buttons
import "./ProductDetailsModal.css";
import ComboSelectionModal from "./ComboSelectionModal";

interface ProductDetailsModalProps {
    product: Product;
    onClose: () => void;
}

export default function ProductDetailsModal({ product, onClose }: ProductDetailsModalProps) {
    const {
        addToCart,
        removeFromCart,
        cart,
        getCatalogProduct,
        getStockForProduct,
    } = useCart();

    const liveProduct = getCatalogProduct(String(product.id)) ?? product;
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [overrideImage, setOverrideImage] = useState<string | null>(null);
    const [showComboModal, setShowComboModal] = useState(false);

    const variantHasStock = (v: { stock?: boolean; stockQuantity?: number }) =>
        v.stockQuantity !== undefined ? v.stockQuantity > 0 : !!v.stock;

    const [selectedVariant, setSelectedVariant] = useState<string | null>(() => {
        if (liveProduct.variants && liveProduct.variants.length > 0) {
            const firstInStock = liveProduct.variants.find(variantHasStock);
            return firstInStock ? firstInStock.name : liveProduct.variants[0].name;
        }
        return null;
    });

    useEffect(() => {
        if (!liveProduct.variants?.length || !selectedVariant) return;
        const current = liveProduct.variants.find((v) => v.name === selectedVariant);
        if (current && variantHasStock(current)) return;
        const fallback = liveProduct.variants.find(variantHasStock);
        if (fallback) setSelectedVariant(fallback.name);
    }, [liveProduct.variants, selectedVariant]);

    const cartItemId = selectedVariant
        ? `${product.id}-${selectedVariant}`
        : String(product.id);

    let quantity = 0;
    if (liveProduct.isCombo) {
        quantity = cart
            .filter((item) => item.baseProductId === liveProduct.id)
            .reduce((sum, item) => sum + (item.quantity ?? 1), 0);
    } else {
        const cartItem = cart.find((item) => item.id === cartItemId);
        quantity = cartItem?.quantity ?? 0;
    }

    useEffect(() => {
        if (selectedVariant && liveProduct.variants) {
            const v = liveProduct.variants.find(v => v.name === selectedVariant);
            if (v && v.image) {
                setOverrideImage(v.image);
            } else {
                setOverrideImage(null);
            }
        } else {
            setOverrideImage(null);
        }
    }, [selectedVariant, liveProduct.variants]);

    const images = liveProduct.images && liveProduct.images.length > 0 ? liveProduct.images : [liveProduct.image];
    const currentImage = overrideImage || images[currentImageIndex];

    const hasDiscount = (liveProduct.discount || 0) > 0;
    const finalPrice = hasDiscount
        ? liveProduct.price * (1 - (liveProduct.discount! / 100))
        : liveProduct.price;

    const maxStock = getStockForProduct(liveProduct.id, selectedVariant);
    const atMaxQuantity = quantity > 0 && quantity >= maxStock;

    const isOutOfStock =
        liveProduct.variants && liveProduct.variants.length > 0
            ? liveProduct.variants.every((v) => !variantHasStock(v))
            : maxStock <= 0;

    const handleAddToCart = () => {
        if (liveProduct.variants && liveProduct.variants.length > 0 && !selectedVariant) {
            alert("Por favor selecciona una opción");
            return;
        }
        if (maxStock <= 0) return;
        if (quantity >= maxStock) return;

        if (product.isCombo) {
            setShowComboModal(true);
            return;
        }

        const productToAdd = {
            ...liveProduct,
            id: cartItemId,
            baseProductId: liveProduct.id,
            selectedVariant: selectedVariant || undefined,
            price: finalPrice,
            name: selectedVariant ? `${liveProduct.name} (${selectedVariant})` : liveProduct.name,
        };

        addToCart(productToAdd);
    };

    const handleRemoveOne = () => {
        removeFromCart(cartItemId);
    };

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = "auto"; };
    }, []);

    return (
        <div
            className="product-details-overlay"
            onClick={onClose}
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.6)",
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
                backdropFilter: "blur(3px)",
                overflowY: "auto",
            }}
        >
            <button
                onClick={onClose}
                style={{
                    position: "absolute",
                    top: "20px",
                    right: "20px",
                    background: "rgba(255,255,255,0.9)",
                    border: "none",
                    color: "#333",
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    zIndex: 10000,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    fontSize: "1.2rem"
                }}
            >
                <FaTimes />
            </button>

            <div
                className="product-details-content"
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: "#fff",
                    borderRadius: "16px",
                    maxWidth: "800px",
                    width: "100%",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                    animation: "zoomIn 0.2s ease-out",
                }}
            >

                <div className="product-details-main">
                    <div className="product-details-image-col">
                        <div style={{ width: "100%", aspectRatio: "1", borderRadius: "12px", overflow: "hidden", position: "relative", backgroundColor: "#f9f9f9" }}>
                            <img
                                src={currentImage}
                                alt={liveProduct.name}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                            {hasDiscount && !isOutOfStock && (
                                <div style={{ position: "absolute", top: "10px", left: "10px", zIndex: 5, padding: "4px 8px", fontSize: "0.8rem", borderRadius: "6px", backgroundColor: "#ecfdf5", color: "#059669", fontWeight: "bold", border: "1px solid #a7f3d0" }}>
                                    -{liveProduct.discount}% OFF
                                </div>
                            )}
                        </div>
                        
                        {images.length > 1 && (
                            <div style={{ display: "flex", gap: "8px", marginTop: "12px", overflowX: "auto", paddingBottom: "8px" }}>
                                {images.map((img, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => {
                                            setOverrideImage(null);
                                            setCurrentImageIndex(idx);
                                        }}
                                        style={{
                                            width: "60px",
                                            height: "60px",
                                            borderRadius: "8px",
                                            overflow: "hidden",
                                            cursor: "pointer",
                                            border: currentImageIndex === idx && !overrideImage ? "2px solid #000" : "2px solid transparent",
                                            opacity: currentImageIndex === idx && !overrideImage ? 1 : 0.6,
                                            transition: "all 0.2s"
                                        }}
                                    >
                                        <img src={img} alt={`Gallery ${idx}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className={`product-details-info-col${!liveProduct.description ? " product-details-info-col--compact" : ""}`}>
                        <h2 style={{ fontSize: "1.8rem", margin: "0 0 8px 0", color: "#222" }}>{liveProduct.name}</h2>
                        
                        <div className="product-details-price">
                            <span style={{ fontSize: "1.5rem", fontWeight: "bold", color: hasDiscount ? "#e53e3e" : "#222" }}>
                                ${Math.floor(finalPrice)}
                            </span>
                            {hasDiscount && (
                                <span style={{ fontSize: "1.1rem", textDecoration: "line-through", color: "#888" }}>
                                    ${Math.floor(liveProduct.price)}
                                </span>
                            )}
                        </div>

                        {liveProduct.description && (
                            <div style={{ marginBottom: "24px", color: "#555", lineHeight: "1.6", fontSize: "1rem" }}>
                                {liveProduct.description}
                            </div>
                        )}

                        {/* Variants */}
                        {liveProduct.variants && liveProduct.variants.length > 0 && (
                            <div className="product-details-variants" style={{ marginBottom: "24px" }}>
                                <h4 style={{ margin: "0 0 12px 0", fontSize: "1rem", color: "#333" }}>Opciones:</h4>
                                <div className="variants-bubbles">
                                    {liveProduct.variants.map((variant, idx) => (
                                        <button
                                            key={idx}
                                            className={`variant-bubble ${selectedVariant === variant.name ? "selected" : ""}`}
                                            onClick={() => {
                                                if (variantHasStock(variant)) setSelectedVariant(variant.name);
                                            }}
                                            disabled={!variantHasStock(variant)}
                                        >
                                            {variant.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="product-details-actions">
                            {quantity === 0 || liveProduct.isCombo ? (
                                <button
                                    className="btn-add"
                                    onClick={handleAddToCart}
                                    disabled={isOutOfStock || quantity >= maxStock}
                                    style={{ flex: 1, padding: "14px", fontSize: "1.1rem" }}
                                >
                                    {isOutOfStock ? "Sin Stock" : quantity >= maxStock ? "Stock Máximo" : "Agregar al carrito"}
                                </button>
                            ) : (
                                <div className="quantity-controls" style={{ flex: 1, height: "50px" }}>
                                    <button className="btn-qty minus" onClick={handleRemoveOne}>−</button>
                                    <span className="quantity-display" style={{ fontSize: "1.2rem", fontWeight: "bold" }}>{quantity}</span>
                                    <button
                                        className="btn-qty plus"
                                        onClick={handleAddToCart}
                                        disabled={atMaxQuantity}
                                    >
                                        +
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="product-details-stock">
                            Stock: {maxStock}
                        </div>
                    </div>
                </div>

                {/* Reviews Section */}
                <div style={{ padding: "0 24px 24px 24px" }}>
                    <ReviewsSection productId={String(liveProduct.id)} />
                </div>
            </div>

            <style>{`
                @keyframes zoomIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
            
            {showComboModal && (
                <ComboSelectionModal
                  product={product}
                  isOpen={showComboModal}
                  onClose={() => setShowComboModal(false)}
                  onAddToCart={(prod, comboItems) => {
                     const uniqueCartItemId = `${cartItemId}-combo-${Date.now()}`;
                     const productToAdd = {
                       ...product,
                       id: uniqueCartItemId,
                       baseProductId: product.id,
                       selectedVariant: selectedVariant || undefined,
                       price: finalPrice,
                       name: selectedVariant ? `${product.name} (${selectedVariant})` : product.name,
                       selectedComboItems: comboItems
                     };
                     addToCart(productToAdd);
                     onClose(); // Optional: close details modal too
                  }}
                />
            )}
        </div>
    );
}
