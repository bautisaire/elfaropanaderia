import { useContext, useState, useEffect } from "react";
import { CartContext, Product } from "../context/CartContext";
import "./ProductCard.css";

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
  } = useContext(CartContext);

  const liveProduct = getCatalogProduct(String(product.id)) ?? product;
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [overrideImage, setOverrideImage] = useState<string | null>(null);

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
  const cartItem = cart.find((item) => item.id === cartItemId);
  const quantity = cartItem?.quantity ?? 0;

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
  const hasDiscount = (liveProduct.discount || 0) > 0;
  const finalPrice = hasDiscount
    ? liveProduct.price * (1 - (liveProduct.discount! / 100))
    : liveProduct.price;

  const maxStock = getStockForProduct(liveProduct.id, selectedVariant);
  const atMaxQuantity = quantity > 0 && quantity >= maxStock;

  const handleAddToCart = () => {
    if (liveProduct.variants && liveProduct.variants.length > 0 && !selectedVariant) {
      alert("Por favor selecciona una opción");
      return;
    }
    if (maxStock <= 0) return;
    if (quantity >= maxStock) return;

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
    <div 
      className={`product-card ${isOutOfStock ? "out-of-stock" : ""}`}
      onClick={() => onOpenDetails && onOpenDetails(liveProduct)}
      style={{ cursor: onOpenDetails ? 'pointer' : 'default' }}
    >
      <div className="image-wrapper">
        <img
          src={currentImage}
          alt={product.name}
          className={`product-image ${isOutOfStock && !(liveProduct.customBadgeText && (!liveProduct.badgeExpiresAt || new Date(liveProduct.badgeExpiresAt) > new Date())) ? "grayscale" : ""}`}
          loading="lazy"
          decoding="async"
        />


        {/* Custom Badge Logic */}
        {(() => {
          // Check for valid custom badge
          const hasCustomBadge = liveProduct.customBadgeText &&
            (!liveProduct.badgeExpiresAt || new Date(liveProduct.badgeExpiresAt) > new Date());

          if (hasCustomBadge) {
            return (
              <div className="discount-badge" style={{ backgroundColor: '#eab308', color: '#fff', fontSize: '0.75rem', padding: '4px 8px', zIndex: 10 }}>
                {liveProduct.customBadgeText}
              </div>
            );
          }

          // Fallback to discount if no custom badge
          if (hasDiscount && !isOutOfStock) {
            return (
              <div className="discount-badge">
                -{product.discount}% OFF
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
        <h3 className="product-title">{liveProduct.name}</h3>

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
              <span className="original-price">${Math.floor(liveProduct.price)}</span>
            )}
            <span className={`product-price ${hasDiscount ? "discounted" : ""}`}>
              ${Math.floor(finalPrice)}
            </span>
            <span className="stock-display">Stock: {displayStock}</span>
          </div>

          {quantity === 0 ? (
            <button
              className="btn-add"
              onClick={(e) => { e.stopPropagation(); handleAddToCart(); }}
              disabled={isOutOfStock}
            >
              {isOutOfStock ? "Sin Stock" : (
                <>
                  Agregar <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px' }}><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                </>
              )}
            </button>
          ) : (
            <div className="quantity-controls">
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
    </div>
  );
}
