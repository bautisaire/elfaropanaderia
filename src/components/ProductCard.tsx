import { useContext, useState } from "react";
import { CartContext, Product } from "../context/CartContext";
import "./ProductCard.css";

interface Props {
  product: Product & { images?: string[] };
}

export default function ProductCard({ product }: Props) {
  const { addToCart, removeFromCart, cart } = useContext(CartContext);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false); // Estado para animación

  // Obtener la cantidad del producto en el carrito
  const cartItem = cart.find((item) => item.id === product.id);
  const quantity = cartItem?.quantity ?? 0;

  const handleRemoveOne = () => {
    removeFromCart(product.id);
  };

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

  // Función para agregar al carrito con animación
  const handleAddToCart = () => {
    setIsAnimating(true);
    addToCart(product);

    // Resetea la animación después de 600ms
    setTimeout(() => {
      setIsAnimating(false);
    }, 600);
  };

  return (
    <div className={`product-card ${isAnimating ? "animate-add" : ""}`}>
      <div className="card-header">
        <div className="image-wrapper">
          <img src={currentImage} alt={product.name} className="product-image" />

          {images.length > 1 && (
            <>
              <button className="nav-btn left" onClick={handlePrevImage} aria-label="Anterior">
                ‹
              </button>
              <button className="nav-btn right" onClick={handleNextImage} aria-label="Siguiente">
                ›
              </button>
            </>
          )}
        </div>

        {images.length > 1 && (
          <div className="carousel-dots">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentImageIndex(index)}
                className={`dot ${index === currentImageIndex ? "active" : ""}`}
                aria-label={`Ir a imagen ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="card-body">
        <h3 className="product-title">{product.name}</h3>
        <p className="product-price">${product.price.toFixed(2)}</p>

        {product.variants && product.variants.length > 0 && (
          <div className="product-variants">
            <span className="variants-label">Opciones:</span>
            <div className="variants-list">
              {product.variants.map((v, idx) => (
                <span
                  key={idx}
                  className={`variant-chip ${!v.stock ? "out-of-stock" : ""}`}
                  title={!v.stock ? "Sin stock" : "Disponible"}
                >
                  {v.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="card-actions">
          {quantity === 0 ? (
            /* Botón "Agregar": MANTIENE handleAddToCart para la animación */
            <button className="btn-add" onClick={handleAddToCart}>
              Agregar al Carrito
            </button>
          ) : (
            <div className="quantity-control">
              <button className="btn-qty minus" onClick={handleRemoveOne}>−</button>

              <span className="quantity-display">{quantity}</span>

              {/* Botón "+": CAMBIADO para evitar la animación */}
              <button
                className="btn-qty plus"
                onClick={() => addToCart(product)}
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
