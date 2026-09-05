import { useContext, useState, useEffect, useRef } from "react";
import { FaHeart, FaRegHeart, FaPlus } from "react-icons/fa";
import { CartContext, Product } from "../context/CartContext";
import { getVariantPrice } from "../utils/cartStock";
import "./ProductCard.css";
import ComboSelectionModal from "./ComboSelectionModal";
import LoginRequiredModal from "./LoginRequiredModal";

interface Props {
  product: Product;
  onOpenDetails?: (product: Product) => void;
}

export default function ProductCard({ product, onOpenDetails }: Props) {
  const {
    addToCart,
    removeFromCart,
    cart,
    getCatalogProduct,
    getStockForProduct,
    user,
    isFavorite: checkIsFavorite,
    toggleFavorite: toggleFavoriteInContext,
  } = useContext(CartContext);

  const isFavorite = checkIsFavorite(product.id);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isFavBumping, setIsFavBumping] = useState(false);
  const favBumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    const wasFavorite = isFavorite;
    toggleFavoriteInContext(product.id);
    if (!wasFavorite) {
      if (favBumpTimerRef.current) clearTimeout(favBumpTimerRef.current);
      setIsFavBumping(true);
      favBumpTimerRef.current = setTimeout(() => setIsFavBumping(false), 550);
    }
  };

  useEffect(() => {
    return () => {
      if (favBumpTimerRef.current) clearTimeout(favBumpTimerRef.current);
    };
  }, []);

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

  // Si el stock en vivo cambia, pasar a una variante con stock si la actual se agotó
  useEffect(() => {
    if (!liveProduct.variants?.length || !selectedVariant) return;
    const current = liveProduct.variants.find((v) => v.name === selectedVariant);
    if (current && variantHasStock(current)) return;
    const fallback = liveProduct.variants.find(variantHasStock);
    if (fallback) setSelectedVariant(fallback.name);
  }, [liveProduct.variants, selectedVariant]);

  // Determine the effective ID for the cart (base ID or variant ID)
  const cartItemId = selectedVariant
    ? `${product.id}-${selectedVariant}`
    : product.id;

  // Check if item is in cart using the effective ID
  let quantity = 0;
  if (liveProduct.isCombo) {
    quantity = cart
      .filter((item) => item.baseProductId === liveProduct.id)
      .reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  } else {
    const cartItem = cart.find((item) => item.id === cartItemId);
    quantity = cartItem?.quantity ?? 0;
  }

  // Effect to handle variant image override
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

  // Image handling
  const images = liveProduct.images && liveProduct.images.length > 0 ? liveProduct.images : [liveProduct.image];
  const currentImage = overrideImage || images[currentImageIndex];

  // Preload images for smoother navigation
  useEffect(() => {
    // Main images
    images.forEach((src) => {
      const img = new Image();
      img.src = src;
    });

    // Variant images
    if (liveProduct.variants) {
      liveProduct.variants.forEach(v => {
        if (v.image) {
          const img = new Image();
          img.src = v.image;
        }
      });
    }
  }, [images, liveProduct.variants]);

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  // Calculate Discount
  const selectedVariantObj = liveProduct.variants?.find((v) => v.name === selectedVariant);
  const variantPrice = getVariantPrice(liveProduct.price, selectedVariantObj);
  const hasDiscount = (liveProduct.discount || 0) > 0;
  const finalPrice = hasDiscount
    ? variantPrice * (1 - (liveProduct.discount! / 100))
    : variantPrice;

  const maxStock = getStockForProduct(liveProduct.id, selectedVariant);
  const atMaxQuantity = quantity > 0 && quantity >= maxStock;

  const handleAddToCart = () => {
    if (liveProduct.variants && liveProduct.variants.length > 0 && !selectedVariant) {
      alert("Por favor selecciona una opción");
      return;
    }
    if (maxStock <= 0) return;
    if (quantity >= maxStock) return;

    if (liveProduct.isCombo) {
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

  // Determine if the product is out of stock
  const isOutOfStock =
    liveProduct.variants && liveProduct.variants.length > 0
      ? liveProduct.variants.every((v) => !variantHasStock(v))
      : maxStock <= 0;

  const displayStock = maxStock;

  return (
    <div className={`product-card ${isOutOfStock ? "out-of-stock" : ""}`}>
      <div className="image-wrapper">
        <img
          src={currentImage}
          alt={product.name}
          className={`product-image ${isOutOfStock ? "grayscale" : ""}`}
          loading="lazy"
          decoding="async"
          onClick={() => onOpenDetails && onOpenDetails(liveProduct)}
          style={{ cursor: onOpenDetails ? 'pointer' : 'default' }}
        />

        <button
          className={`favorite-btn ${isFavorite ? "active" : ""} ${isFavBumping ? "fav-bump" : ""}`}
          onClick={handleToggleFavorite}
          aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
        >
          {isFavorite ? <FaHeart /> : <FaRegHeart />}
        </button>


        {/* Preparation Notice Badge */}
        {(() => {
          if (liveProduct.customBadgeEnabled && liveProduct.customBadgeText) {
            return (
              <div className="discount-badge" style={{ backgroundColor: '#4338ca', color: '#fff', fontSize: '0.75rem', padding: '4px 8px', zIndex: 10 }}>
                {liveProduct.customBadgeText}
              </div>
            );
          }

          const isPreparationDelayed = liveProduct.availableAt && new Date(liveProduct.availableAt) > new Date();

          if (isPreparationDelayed) {
            const timeString = new Date(liveProduct.availableAt!).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            return (
              <div className="discount-badge" style={{ backgroundColor: '#eab308', color: '#fff', fontSize: '0.75rem', padding: '4px 8px', zIndex: 10 }}>
                A partir de las {timeString}
              </div>
            );
          }

          // Fallback to discount if no preparation notice
          if (hasDiscount && !isOutOfStock) {
            return (
              <div className="discount-badge">
                -{Math.round(product.discount || 0)}% OFF
              </div>
            );
          }
          return null;
        })()}


        {images.length > 1 && !isOutOfStock && (
          <>
            <button className="nav-btn left" onClick={handlePrevImage}>‹</button>
            <button className="nav-btn right" onClick={handleNextImage}>›</button>
            <div className="dots">
              {images.map((_, idx) => (
                <span
                  key={idx}
                  className={`dot ${idx === currentImageIndex ? "active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOverrideImage(null); // Clear override when manually navigating
                    setCurrentImageIndex(idx);
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card-body">
        <h3
          className="product-title"
          onClick={() => onOpenDetails && onOpenDetails(liveProduct)}
          style={{ cursor: onOpenDetails ? 'pointer' : 'default' }}
        >
          {liveProduct.name}
        </h3>

        {liveProduct.variants && liveProduct.variants.length > 0 && (
          <div className="variants-section">
            <div className="variants-bubbles">
              {liveProduct.variants.map((variant, idx) => (
                <button
                  key={idx}
                  className={`variant-bubble ${selectedVariant === variant.name ? "selected" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
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

        <div className="card-footer">
          <div className="price-container">
            {hasDiscount && (
              <span className="original-price">${Math.floor(variantPrice)}</span>
            )}
            <span className={`product-price ${hasDiscount ? "discounted" : ""}`}>
              ${Math.floor(finalPrice)}
            </span>
            <span className="stock-display">Stock: {displayStock}</span>
          </div>

          {quantity === 0 || liveProduct.isCombo ? (
            <button
              className="btn-add card-add-btn"
              onClick={(e) => { e.stopPropagation(); handleAddToCart(); }}
              disabled={isOutOfStock || quantity >= maxStock}
              title={isOutOfStock ? "Sin Stock" : quantity >= maxStock ? "Stock Máximo" : "Agregar al carrito"}
              aria-label={isOutOfStock ? "Sin Stock" : quantity >= maxStock ? "Stock Máximo" : "Agregar al carrito"}
            >
              <FaPlus />
            </button>
          ) : (
            <div className="quantity-controls card-qty-controls">
              <button className="btn-qty minus" onClick={(e) => { e.stopPropagation(); handleRemoveOne(); }}>−</button>
              <span className="quantity-display">{quantity}</span>
              <button
                className="btn-qty plus"
                onClick={(e) => { e.stopPropagation(); handleAddToCart(); }}
                disabled={atMaxQuantity}
                aria-label={atMaxQuantity ? "Stock máximo alcanzado" : "Agregar uno más"}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
      
      {showComboModal && (
        <ComboSelectionModal
          product={liveProduct}
          isOpen={showComboModal}
          onClose={() => setShowComboModal(false)}
          onAddToCart={(_, comboItems) => {
             // For combos, we generate a unique ID so different selections don't merge, 
             // unless you want them to merge if selections are identical.
             // Using a timestamp + random for simplicity.
             const uniqueCartItemId = `${cartItemId}-combo-${Date.now()}`;
             
             const productToAdd = {
               ...liveProduct,
               id: uniqueCartItemId,
               baseProductId: liveProduct.id,
               selectedVariant: selectedVariant || undefined,
               price: finalPrice,
               name: selectedVariant ? `${liveProduct.name} (${selectedVariant})` : liveProduct.name,
               selectedComboItems: comboItems
             };
             addToCart(productToAdd);
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
