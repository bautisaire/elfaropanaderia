import { useState, useEffect, useRef, useCallback } from "react";
import { FaArrowLeft, FaHeart, FaRegHeart, FaMinus, FaPlus, FaCheck, FaShoppingCart, FaClock } from "react-icons/fa";
import { Product, useCart } from "../context/CartContext";
import { getVariantPrice } from "../utils/cartStock";
import ReviewsSection from "./ReviewsSection";
import "./ProductCard.css"; // estilos de las etiquetas de variantes
import "./ProductDetailsModal.css";
import ComboSelectionModal from "./ComboSelectionModal";
import VariantSelectionModal from "./VariantSelectionModal";
import LoginRequiredModal from "./LoginRequiredModal";

interface ProductDetailsModalProps {
    product: Product;
    onClose: () => void;
}

const money = (n: number) => `$${Math.floor(n).toLocaleString("es-AR")}`;
const fmtQty = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

// Tiempo que se muestra "Agregado" antes de cerrar el detalle
const ADDED_FEEDBACK_MS = 650;

export default function ProductDetailsModal({ product, onClose }: ProductDetailsModalProps) {
    const {
        addToCart,
        cart,
        getCatalogProduct,
        getStockForProduct,
        isStoreOpen,
        isAdmin,
        closedMessage,
        setIsSidebarOpen,
        user,
        isFavorite: checkIsFavorite,
        toggleFavorite,
    } = useCart();

    const liveProduct = getCatalogProduct(String(product.id)) ?? product;
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [overrideImage, setOverrideImage] = useState<string | null>(null);
    const [showComboModal, setShowComboModal] = useState(false);
    const [showVariantModal, setShowVariantModal] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [descExpanded, setDescExpanded] = useState(false);
    const [qty, setQty] = useState(1);
    const [added, setAdded] = useState(false);
    const [closing, setClosing] = useState(false);
    const galleryRef = useRef<HTMLDivElement>(null);
    const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const variantHasStock = (v: { stock?: boolean; stockQuantity?: number }) =>
        v.stockQuantity !== undefined ? v.stockQuantity > 0 : !!v.stock;

    const [selectedVariant, setSelectedVariant] = useState<string | null>(() => {
        if (liveProduct.variants && liveProduct.variants.length > 0) {
            const firstInStock = liveProduct.variants.find(variantHasStock);
            return firstInStock ? firstInStock.name : liveProduct.variants[0].name;
        }
        return null;
    });

    // Con variantes (y no combo), la elección de sabor/tipo y la cantidad se hacen
    // en el modal (VariantSelectionModal), igual que con los combos.
    const hasSelectableVariants = !!(liveProduct.variants && liveProduct.variants.length > 0 && !liveProduct.isCombo);
    const needsOptions = !!liveProduct.isCombo || hasSelectableVariants;

    useEffect(() => {
        if (hasSelectableVariants) return;
        if (!liveProduct.variants?.length || !selectedVariant) return;
        const current = liveProduct.variants.find((v) => v.name === selectedVariant);
        if (current && variantHasStock(current)) return;
        const fallback = liveProduct.variants.find(variantHasStock);
        if (fallback) setSelectedVariant(fallback.name);
    }, [liveProduct.variants, selectedVariant, hasSelectableVariants]);

    const cartItemId = selectedVariant ? `${product.id}-${selectedVariant}` : String(product.id);

    const inCart = needsOptions
        ? cart.filter((item) => item.baseProductId === liveProduct.id).reduce((sum, item) => sum + (item.quantity ?? 1), 0)
        : cart.find((item) => item.id === cartItemId)?.quantity ?? 0;

    useEffect(() => {
        const v = selectedVariant ? liveProduct.variants?.find((x) => x.name === selectedVariant) : undefined;
        setOverrideImage(v?.image || null);
    }, [selectedVariant, liveProduct.variants]);

    const images = (liveProduct.images && liveProduct.images.length > 0 ? liveProduct.images : [liveProduct.image]).filter(Boolean);

    const selectedVariantObj = hasSelectableVariants ? undefined : liveProduct.variants?.find((v) => v.name === selectedVariant);
    const variantPrice = getVariantPrice(liveProduct.price, selectedVariantObj);
    const hasDiscount = (liveProduct.discount || 0) > 0;
    const finalPrice = hasDiscount ? variantPrice * (1 - liveProduct.discount! / 100) : variantPrice;

    const maxStock = hasSelectableVariants
        ? (liveProduct.variants || []).reduce((sum, v) => sum + (v.stockQuantity !== undefined ? Math.max(0, v.stockQuantity) : (v.stock ? 999 : 0)), 0)
        : getStockForProduct(liveProduct.id, selectedVariant);

    const isOutOfStock = liveProduct.variants && liveProduct.variants.length > 0
        ? liveProduct.variants.every((v) => !variantHasStock(v))
        : maxStock <= 0;

    // Cuánto más se puede sumar al carrito (lo que ya está adentro descuenta stock)
    const remaining = Math.max(0, maxStock - inCart);
    const maxPick = remaining > 0 ? Math.max(1, Math.floor(remaining)) : 0;
    const storeClosed = !isStoreOpen && !isAdmin;

    useEffect(() => {
        setQty((q) => Math.min(Math.max(1, q), Math.max(1, maxPick)));
    }, [maxPick]);

    const isPreparationDelayed = !!liveProduct.availableAt && new Date(liveProduct.availableAt) > new Date();
    const readyTime = isPreparationDelayed
        ? new Date(liveProduct.availableAt!).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
        : null;
    const lowStock = !isOutOfStock && !hasSelectableVariants && maxStock > 0 && maxStock <= 5;
    const isLongDescription = (liveProduct.description || "").length > 160;
    const isFav = checkIsFavorite(liveProduct.id);

    // ---- Cierre: el botón "atrás" del celular también cierra el detalle ----
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!window.history.state?.pdModal) {
            window.history.pushState({ ...(window.history.state || {}), pdModal: true }, "");
        }
        const onPop = () => onCloseRef.current();
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    const close = useCallback(() => {
        setClosing(true);
        window.setTimeout(() => {
            if (window.history.state?.pdModal) window.history.back();
            else onCloseRef.current();
        }, 160);
    }, []);

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
            if (addedTimer.current) clearTimeout(addedTimer.current);
        };
    }, [close]);

    // ---- Galería ----
    const onGalleryScroll = () => {
        const el = galleryRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollLeft / el.clientWidth);
        if (idx !== currentImageIndex) {
            setCurrentImageIndex(idx);
            setOverrideImage(null);
        }
    };

    const goToImage = (idx: number) => {
        setOverrideImage(null);
        setCurrentImageIndex(idx);
        galleryRef.current?.scrollTo({ left: idx * galleryRef.current.clientWidth, behavior: "smooth" });
    };

    // ---- Acciones ----
    const flashAddedAndClose = () => {
        setAdded(true);
        addedTimer.current = setTimeout(close, ADDED_FEEDBACK_MS);
    };

    const handleAdd = () => {
        if (storeClosed) { addToCart(liveProduct); return; } // muestra el aviso de tienda cerrada
        if (isOutOfStock || remaining <= 0 || added) return;
        if (liveProduct.isCombo) { setShowComboModal(true); return; }
        if (hasSelectableVariants) { setShowVariantModal(true); return; }

        addToCart({
            ...liveProduct,
            id: cartItemId,
            baseProductId: liveProduct.id,
            selectedVariant: selectedVariant || undefined,
            price: finalPrice,
            name: selectedVariant ? `${liveProduct.name} (${selectedVariant})` : liveProduct.name,
        }, Math.min(qty, maxPick));
        flashAddedAndClose();
    };

    const handleFavorite = () => {
        if (!user) { setShowLoginModal(true); return; }
        toggleFavorite(liveProduct.id);
    };

    const openCart = () => {
        close();
        window.setTimeout(() => setIsSidebarOpen(true), 220);
    };

    let buttonLabel: React.ReactNode;
    if (added) buttonLabel = <><FaCheck /> Agregado</>;
    else if (storeClosed) buttonLabel = "Tienda cerrada";
    else if (isOutOfStock) buttonLabel = "Sin stock";
    else if (remaining <= 0) buttonLabel = "Ya tenés todo el stock";
    else if (needsOptions) buttonLabel = liveProduct.isCombo ? "Armar mi combo" : "Elegir opciones";
    else buttonLabel = <><span>Agregar</span><span className="pd-add-total">{money(finalPrice * qty)}</span></>;

    const addDisabled = !storeClosed && (isOutOfStock || remaining <= 0);

    return (
        <div className={`pd-overlay ${closing ? "closing" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
            <div className="pd-screen" role="dialog" aria-modal="true" aria-label={liveProduct.name}>
                <div className="pd-media">
                    <div className="pd-gallery" ref={galleryRef} onScroll={onGalleryScroll}>
                        {(overrideImage ? [overrideImage] : images).map((src, idx) => (
                            <div className="pd-slide" key={`${src}-${idx}`}>
                                <div className="pd-slide-bg" style={{ backgroundImage: `url("${src}")` }} />
                                <img
                                    src={src}
                                    alt={idx === 0 ? liveProduct.name : `${liveProduct.name} (${idx + 1})`}
                                    className={`pd-slide-img ${isOutOfStock ? "grayscale" : ""}`}
                                    draggable={false}
                                />
                            </div>
                        ))}
                    </div>

                    <button className="pd-round-btn pd-back-btn" onClick={close} aria-label="Volver">
                        <FaArrowLeft />
                    </button>
                    <button
                        className={`pd-round-btn pd-fav-btn ${isFav ? "active" : ""}`}
                        onClick={handleFavorite}
                        aria-label={isFav ? "Quitar de favoritos" : "Agregar a favoritos"}
                    >
                        {isFav ? <FaHeart /> : <FaRegHeart />}
                    </button>

                    {!overrideImage && images.length > 1 && (
                        <div className="pd-dots">
                            {images.map((_, idx) => (
                                <button
                                    key={idx}
                                    className={`pd-dot ${currentImageIndex === idx ? "active" : ""}`}
                                    onClick={() => goToImage(idx)}
                                    aria-label={`Ver imagen ${idx + 1}`}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div className="pd-panel">
                    <div className="pd-scroll">
                        {liveProduct.categoria && <span className="pd-category">{liveProduct.categoria}</span>}
                        <h1 className="pd-title">{liveProduct.name}</h1>

                        <div className="pd-price-row">
                            <span className={`pd-price ${hasDiscount ? "discounted" : ""}`}>{money(finalPrice)}</span>
                            {hasDiscount && <span className="pd-price-old">{money(variantPrice)}</span>}
                            {hasDiscount && <span className="pd-chip pd-chip-sale">-{Math.round(liveProduct.discount || 0)}%</span>}
                        </div>

                        <div className="pd-chips">
                            {isOutOfStock ? (
                                <span className="pd-chip pd-chip-out">Agotado</span>
                            ) : lowStock ? (
                                <span className="pd-chip pd-chip-low">¡Quedan {fmtQty(maxStock)}!</span>
                            ) : !hasSelectableVariants ? (
                                <span className="pd-chip pd-chip-ok">{fmtQty(maxStock)} disponibles</span>
                            ) : null}
                            {readyTime && <span className="pd-chip pd-chip-time"><FaClock /> Listo desde las {readyTime}</span>}
                            {liveProduct.customBadgeEnabled && liveProduct.customBadgeText && (
                                <span className="pd-chip pd-chip-custom">{liveProduct.customBadgeText}</span>
                            )}
                        </div>

                        {hasSelectableVariants && (
                            <div className="pd-block">
                                <h3 className="pd-section-title">Opciones</h3>
                                <div className="variant-tags pd-variant-tags">
                                    {liveProduct.variants!.map((variant, idx) => {
                                        const outOfStock = !variantHasStock(variant);
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                className={`variant-tag ${outOfStock ? "variant-tag-out-of-stock" : ""} ${selectedVariant === variant.name ? "variant-tag-active" : ""}`}
                                                onClick={() => setSelectedVariant(variant.name)}
                                                title={outOfStock ? `${variant.name} (Sin stock)` : variant.name}
                                            >
                                                {variant.name}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="pd-hint">Elegís sabores y cantidades en el siguiente paso.</p>
                            </div>
                        )}

                        {liveProduct.description && (
                            <div className="pd-block">
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

                        <div className="pd-block pd-reviews">
                            <ReviewsSection productId={String(liveProduct.id)} />
                        </div>
                    </div>

                    <div className="pd-bar">
                        {storeClosed && <div className="pd-bar-note closed">{closedMessage || "La tienda está cerrada en este momento."}</div>}
                        {!storeClosed && inCart > 0 && !added && (
                            <button className="pd-bar-note" onClick={openCart}>
                                <FaShoppingCart /> Ya tenés {fmtQty(inCart)} en el carrito · <b>Ver carrito</b>
                            </button>
                        )}

                        <div className="pd-bar-row">
                            {!needsOptions && !storeClosed && !isOutOfStock && remaining > 0 && (
                                <div className="pd-stepper" aria-label="Cantidad">
                                    <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1 || added} aria-label="Quitar uno">
                                        <FaMinus />
                                    </button>
                                    <span aria-live="polite">{qty}</span>
                                    <button onClick={() => setQty((q) => Math.min(maxPick, q + 1))} disabled={qty >= maxPick || added} aria-label="Sumar uno">
                                        <FaPlus />
                                    </button>
                                </div>
                            )}
                            <button
                                className={`pd-add-btn ${added ? "added" : ""}`}
                                onClick={handleAdd}
                                disabled={addDisabled}
                            >
                                {buttonLabel}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showComboModal && (
                <ComboSelectionModal
                    product={liveProduct}
                    isOpen={showComboModal}
                    maxQuantity={maxStock}
                    onClose={() => setShowComboModal(false)}
                    onAddToCart={(_, comboItems) => {
                        const isSingleChoiceCombo = (liveProduct.comboItemsCount || 0) === 1; // incluye el modo de elección libre
                        const totalQty = isSingleChoiceCombo
                            ? Math.max(1, comboItems.reduce((sum, item) => sum + item.quantity, 0))
                            : 1;
                        addToCart({
                            ...liveProduct,
                            id: `${cartItemId}-combo-${Date.now()}`,
                            baseProductId: liveProduct.id,
                            selectedVariant: selectedVariant || undefined,
                            price: finalPrice,
                            name: selectedVariant ? `${liveProduct.name} (${selectedVariant})` : liveProduct.name,
                            selectedComboItems: comboItems,
                        }, totalQty);
                        setShowComboModal(false);
                        flashAddedAndClose();
                    }}
                />
            )}

            {showVariantModal && (
                <VariantSelectionModal
                    product={liveProduct}
                    isOpen={showVariantModal}
                    onClose={() => setShowVariantModal(false)}
                    onAddToCart={(selections) => {
                        selections.forEach(({ variantName, quantity: q }) => {
                            const variantObj = liveProduct.variants?.find((v) => v.name === variantName);
                            const price = getVariantPrice(liveProduct.price, variantObj);
                            const priceWithDiscount = hasDiscount ? price * (1 - liveProduct.discount! / 100) : price;
                            addToCart({
                                ...liveProduct,
                                id: `${liveProduct.id}-${variantName}`,
                                baseProductId: liveProduct.id,
                                selectedVariant: variantName,
                                price: priceWithDiscount,
                                name: `${liveProduct.name} (${variantName})`,
                            }, q);
                        });
                        if (selections.length > 0) {
                            setShowVariantModal(false);
                            flashAddedAndClose();
                        }
                    }}
                />
            )}

            <LoginRequiredModal
                isOpen={showLoginModal}
                onClose={() => setShowLoginModal(false)}
                message="Necesitas iniciar sesión para guardar favoritos."
            />
        </div>
    );
}
