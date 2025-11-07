import ProductCard from "../components/ProductCard";
import "./Home.css";
const products = [
  { id: 1, name: "Frolitas tofi", price: 1500, image: "../assets/logo.png" },
  { id: 2, name: "Facturas surtidas", price: 2000, image: "../assets/logo.png" },
  { id: 3, name: "Medialunas", price: 2500, image: "../assets/logo.png" },
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