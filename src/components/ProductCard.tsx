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
      <img src={product.image} alt={product.name} width="150" />
      <h3>{product.name}</h3>
      <p>${product.price}</p>
      <button onClick={() => addToCart(product)}>Agregar al carrito</button>
    </div>
  );
}