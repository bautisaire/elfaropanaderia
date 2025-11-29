import  { useEffect, useState } from "react";
import ProductCard from "../components/ProductCard";
import BottomCartModal from "../components/BottomCartModal";
import "./Home.css";

// Define el tipo Product para tipado
interface Product {
  id: number;
  name: string;
  price: number;
  image?: string;
  images?: string[];
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Cargar productos desde el backend
  useEffect(() => {
    fetch("http://localhost:3001/api/productos", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="home">
        {loading ? (
          <p>Cargando productos...</p>
        ) : (
          products.map((p) => (
            <ProductCard
              key={p.id}
              product={{
                ...p,
                image: p.image ?? "", // <-- asegura que image sea string
                images: p.images ?? [], // <-- asegura que images sea array
              }}
            />
          ))
        )}
      </div>
      <BottomCartModal />
    </div>
  );
}