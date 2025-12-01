import { useEffect, useState } from "react";
import ProductCard from "../components/ProductCard";
import BottomCartModal from "../components/BottomCartModal";
import ProductSkeleton from "../components/ProductSkeleton";
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
            images: data.images || (data.img ? [data.img] : []), // Mapear array de imágenes
            variants: data.variants || [], // Mapear variantes
            quantity: 0,
            stock: data.stock // Mapear stock
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
    <div className="home-container">
      <h1 className="home-title">Elegí, pedí y disfrutá. <br /> Envíos a todo <span>Senillosa</span></h1>
      <div className="home">
        {loading ? (
          // Mostrar 6 esqueletos mientras carga
          Array.from({ length: 6 }).map((_, index) => (
            <ProductSkeleton key={index} />
          ))
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