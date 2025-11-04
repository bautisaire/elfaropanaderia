import ProductCard from "../components/ProductCard";
import "./Home.css";
const products = [
  { id: 1, name: "Pan casero", price: 1500, image: "/images/pan.jpg" },
  { id: 2, name: "Facturas surtidas", price: 2000, image: "/images/facturas.jpg" },
  { id: 3, name: "Medialunas", price: 2500, image: "/images/medialunas.jpg" },
];

export default function Home() {
  return (
    <div>
  
      <div style={{ display: "flex",flexWrap: "wrap", gap: "20px", margin: "20px"}}>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}