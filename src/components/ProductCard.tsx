import { useContext, useState, useEffect } from "react";
import { CartContext, Product } from "../context/CartContext";
import "./ProductCard.css";

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const { addToCart, removeFromCart, cart } = useContext(CartContext);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [overrideImage, setOverrideImage] = useState<string | null>(null);

  // Initialize selectedVariant with the first in-stock variant
  const [selectedVariant, setSelectedVariant] = useState<string | null>(() => {
    if (product.variants && product.variants.length > 0) {
      const firstInStock = product.variants.find(v => v.stock);
      return firstInStock ? firstInStock.name : product.variants[0].name;
    }
    return null;
  });

  // Determine the effective ID for the cart (base ID or variant ID)
  const cartItemId = selectedVariant
    ? `${product.id}-${selectedVariant}`
    : product.id;

  // Check if item is in cart using the effective ID
  const cartItem = cart.find((item) => item.id === cartItemId);
  const quantity = cartItem?.quantity ?? 0;

  // Effect to handle variant image override
  useEffect(() => {
    if (selectedVariant && product.variants) {
      const v = product.variants.find(v => v.name === selectedVariant);
      if (v && v.image) {
        setOverrideImage(v.image);
      } else {
        setOverrideImage(null);
      }
    } else {
      setOverrideImage(null);
    }
  }, [selectedVariant, product.variants]);

  // Image handling
  const images = product.images && product.images.length > 0 ? product.images : [product.image];
  const currentImage = overrideImage || images[currentImageIndex];

  // Preload images for smoother navigation
  useEffect(() => {
    // Main images
    images.forEach((src) => {
      const img = new Image();
      img.src = src;
    });

    // Variant images
    if (product.variants) {
      product.variants.forEach(v => {
        if (v.image) {
          const img = new Image();
          img.src = v.image;
        }
      });
    }
  }, [images, product.variants]);

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  // Calculate Discount
  const hasDiscount = (product.discount || 0) > 0;
  const finalPrice = hasDiscount
    ? product.price * (1 - (product.discount! / 100))
    : product.price;

  const handleAddToCart = () => {
    if (product.variants && product.variants.length > 0 && !selectedVariant) {
      alert("Por favor selecciona una opción");
      return;
    }

    // Create a product object for the cart with the FINAL PRICE
    const productToAdd = {
      ...product,
      id: cartItemId,
      price: finalPrice, // Use discounted price
      name: selectedVariant ? `${product.name} (${selectedVariant})` : product.name
    };

    addToCart(productToAdd);
  };

  const handleRemoveOne = () => {
    removeFromCart(cartItemId);
  };

  // Determine if the product is out of stock
  const isOutOfStock = product.variants && product.variants.length > 0
    ? product.variants.every(v => (v.stockQuantity !== undefined ? v.stockQuantity <= 0 : !v.stock))
    : (product.stockQuantity !== undefined ? product.stockQuantity <= 0 : !product.stock);

  return (
    <div className={`product-card ${isOutOfStock ? "out-of-stock" : ""}`}>
      <div className="image-wrapper">
        <img
          src={currentImage}
          alt={product.name}
          className={`product-image ${isOutOfStock ? "grayscale" : ""}`}
          loading="lazy"
          decoding="async"
        />

        {hasDiscount && !isOutOfStock && (
          <div className="discount-badge">
            -{product.discount}% OFF
          </div>
        )}

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
        <h3 className="product-title">{product.name}</h3>

        {product.variants && product.variants.length > 0 && (
          <div className="variants-section">
            <div className="variants-bubbles">
              {product.variants.map((variant, idx) => (
                <button
                  key={idx}
                  className={`variant-bubble ${selectedVariant === variant.name ? "selected" : ""}`}
                  onClick={() => {
                    const hasStock = variant.stockQuantity !== undefined ? variant.stockQuantity > 0 : variant.stock;
                    if (hasStock) setSelectedVariant(variant.name);
                  }}
                  disabled={variant.stockQuantity !== undefined ? variant.stockQuantity <= 0 : !variant.stock}
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
              <span className="original-price">${Math.floor(product.price)}</span>
            )}
            <span className={`product-price ${hasDiscount ? "discounted" : ""}`}>
              ${Math.floor(finalPrice)}
            </span>
          </div>

          {quantity === 0 ? (
            <button
              className="btn-add"
              onClick={handleAddToCart}
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
              <button className="btn-qty minus" onClick={handleRemoveOne}>−</button>
              <span className="quantity-display">{quantity}</span>
              <button className="btn-qty plus" onClick={handleAddToCart}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
