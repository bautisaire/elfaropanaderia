import { useContext, useState } from "react";
import { CartContext, Product } from "../context/CartContext";
import "./ProductCard.css";

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const { addToCart } = useContext(CartContext);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  const handleAddToCart = () => {
    if (product.variants && product.variants.length > 0 && !selectedVariant) {
      alert("Por favor selecciona una opción");
      return;
    }
    addToCart(product);
  };

  return (
    <div className="product-card">
      <img src={product.image} alt={product.name} className="product-image" />

      <div className="card-body">
        <h3 className="product-title">{product.name}</h3>

        {product.variants && product.variants.length > 0 && (
          <div className="variants-section">
            <span className="variants-label">Opciones:</span>
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
          <button
            className="btn-add"
            onClick={handleAddToCart}
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
