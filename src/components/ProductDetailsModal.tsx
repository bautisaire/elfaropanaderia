import { useState, useEffect } from "react";
import { FaArrowLeft, FaShoppingBag } from "react-icons/fa";
import { Product, useCart } from "../context/CartContext";
import { getVariantPrice } from "../utils/cartStock";
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
    const [descExpanded, setDescExpanded] = useState(false);

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

    const selectedVariantObj = liveProduct.variants?.find((v) => v.name === selectedVariant);
    const variantPrice = getVariantPrice(liveProduct.price, selectedVariantObj);
    const hasDiscount = (liveProduct.discount || 0) > 0;
    const finalPrice = hasDiscount
        ? variantPrice * (1 - (liveProduct.discount! / 100))
        : variantPrice;

    const maxStock = getStockForProduct(liveProduct.id, selectedVariant);
    const atMaxQuantity = quantity > 0 && quantity >= maxStock;

    const isOutOfStock =
        liveProduct.variants && liveProduct.variants.length > 0
            ? liveProduct.variants.every((v) => !variantHasStock(v))
            : maxStock <= 0;

    const isLongDescription = (liveProduct.description || "").length > 140;

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

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div className="pd-screen">
            <div className="pd-hero">
                <img
                    src={currentImage}
                    alt={liveProduct.name}
                    className="pd-hero-img"
                />

                {hasDiscount && !isOutOfStock && (
                    <div className="pd-discount-badge">-{Math.round(liveProduct.discount || 0)}% OFF</div>
                )}

                <button className="pd-back-btn" onClick={onClose} aria-label="Volver">
                    <FaArrowLeft />
                </button>

                {images.length > 1 && (
                    <div className="pd-hero-dots">
                        {images.map((_, idx) => (
                            <button
                                key={idx}
                                className={`pd-hero-dot ${currentImageIndex === idx && !overrideImage ? "active" : ""}`}
                                onClick={() => {
                                    setOverrideImage(null);
                                    setCurrentImageIndex(idx);
                                }}
                                aria-label={`Ver imagen ${idx + 1}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="pd-sheet">
                <div className="pd-sheet-scroll">
                    <h1 className="pd-title">{liveProduct.name}</h1>

                    {liveProduct.variants && liveProduct.variants.length > 0 && (
                        <div className="pd-variants">
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

                    <div className="pd-stats-row">
                        <div className="pd-stat">
                            <strong>
                                ${Math.floor(finalPrice)}
                                {hasDiscount && <span className="pd-stat-strike">${Math.floor(variantPrice)}</span>}
                            </strong>
                            <span>Precio</span>
                        </div>
                        <div className="pd-stat">
                            <strong>{isOutOfStock ? "Agotado" : Math.round(maxStock * 100) / 100}</strong>
                            <span>Stock</span>
                        </div>
                        {hasDiscount && (
                            <div className="pd-stat pd-stat-highlight">
                                <strong>-{liveProduct.discount}%</strong>
                                <span>Descuento</span>
                            </div>
                        )}
                    </div>

                    {liveProduct.description && (
                        <div className="pd-description-block">
                            <h3 className="pd-section-title">Descripción</h3>
                            <p className={`pd-description ${!isLongDescription || descExpanded ? "expanded" : ""}`}>
                                {liveProduct.description}
                            </p>
                            {isLongDescription && (
                                <button className="pd-show-more" onClick={() => setDescExpanded((v) => !v)}>
                                    {descExpanded ? "Mostrar menos" : "Mostrar más"}
                                </button>
                            )}
                        </div>
                    )}

                    <div className="pd-reviews">
                        <ReviewsSection productId={String(liveProduct.id)} />
                    </div>
                </div>
            </div>

            <div className="pd-bottom-bar">
                <div className="pd-bag-indicator">
                    <FaShoppingBag />
                    {quantity > 0 && <span className="pd-bag-badge">{quantity}</span>}
                </div>

                {quantity === 0 || liveProduct.isCombo ? (
                    <button
                        className="btn-add pd-buy-btn"
                        onClick={handleAddToCart}
                        disabled={isOutOfStock || quantity >= maxStock}
                    >
                        {isOutOfStock ? "Sin Stock" : quantity >= maxStock ? "Stock Máximo" : "Agregar al carrito"}
                    </button>
                ) : (
                    <div className="quantity-controls pd-buy-btn">
                        <button className="btn-qty minus" onClick={handleRemoveOne}>−</button>
                        <span className="quantity-display">{quantity}</span>
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

            {showComboModal && (
                <ComboSelectionModal
                    product={product}
                    isOpen={showComboModal}
                    onClose={() => setShowComboModal(false)}
                    onAddToCart={(_, comboItems) => {
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
