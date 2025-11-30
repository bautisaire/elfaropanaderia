import { useEffect, useState } from "react";
import ProductCard from "../components/ProductCard";
import BottomCartModal from "../components/BottomCartModal";
import "./Home.css";
import { db } from "../firebase/firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import { Product } from "../context/CartContext";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Cargar productos desde Firebase
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const querySnapshot = await getDocs(collection(db, "products"));
        const prods: Product[] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.nombre,
            price: data.precio,
            image: data.img || "",
            quantity: 0
          } as Product;
        });
        setProducts(prods);
      } catch (error) {
        console.error("Error loading products:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
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
              product={p}
            />
          ))
        )}
      </div>
      <BottomCartModal />
    </div>
  );
}