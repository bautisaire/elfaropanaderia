import { useContext } from "react";
import { CartContext, Product } from "../context/CartContext";
import "./ProductCard.css";

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const { addToCart } = useContext(CartContext);

  return (
    <div className="product-card">
      <img src={product.image} alt={product.name} className="product-image" />

      <div className="card-body">
        <h3 className="product-title">{product.name}</h3>
        <p className="product-price">${product.price}</p>

        <button
          className="btn-add"
          onClick={() => addToCart(product)}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
