import { useContext, useState } from "react";
import { CartContext, Product } from "../context/CartContext";
import "./ProductCard.css";

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const { addToCart, removeFromCart, cart } = useContext(CartContext);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

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

  // Image handling
  const images = product.images && product.images.length > 0 ? product.images : [product.image];
  const currentImage = images[currentImageIndex];

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleAddToCart = () => {
    if (product.variants && product.variants.length > 0 && !selectedVariant) {
      alert("Por favor selecciona una opción");
      return;
    }

    // Create a product object for the cart
    const productToAdd = {
      ...product,
      id: cartItemId,
      name: selectedVariant ? `${product.name} (${selectedVariant})` : product.name
    };

    addToCart(productToAdd);
  };

  const handleRemoveOne = () => {
    removeFromCart(cartItemId);
  };

  return (
    <div className="product-card">
      <div className="image-wrapper">
        <img src={currentImage} alt={product.name} className="product-image" />

        {images.length > 1 && (
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
                  onClick={() => variant.stock && setSelectedVariant(variant.name)}
                  disabled={!variant.stock}
                >
                  {variant.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card-footer">
          <span className="product-price">${product.price}</span>

          {quantity === 0 ? (
            <button
              className="btn-add"
              onClick={handleAddToCart}
            >
              Agregar
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
