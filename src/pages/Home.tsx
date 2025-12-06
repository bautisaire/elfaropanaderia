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
            stock: data.stock, // Mapear stock
            discount: data.discount || 0, // Mapear descuento
            categoria: data.categoria || "General" // Mapear categoría
          } as Product;
        });

        // Ordenar: Primero con stock, al final sin stock
        prods.sort((a, b) => {
          const aOutOfStock = a.variants && a.variants.length > 0
            ? a.variants.every(v => !v.stock)
            : a.stock === false;

          const bOutOfStock = b.variants && b.variants.length > 0
            ? b.variants.every(v => !v.stock)
            : b.stock === false;

          if (aOutOfStock === bOutOfStock) return 0;
          return aOutOfStock ? 1 : -1;
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
      <h1 className="home-title">Elegí, pedí y disfrutá. <br /> <br />Envíos <span>GRATIS</span> a todo Senillosa</h1>
      <div className="home">
        {loading ? (
          // Mostrar 6 esqueletos mientras carga
          Array.from({ length: 6 }).map((_, index) => (
            <ProductSkeleton key={index} />
          ))
        ) : (
          Object.entries(
            products.reduce((acc, product) => {
              const category = product.categoria || "General";
              if (!acc[category]) {
                acc[category] = [];
              }
              acc[category].push(product);
              return acc;
            }, {} as Record<string, Product[]>)
          )
            .sort(([catA], [catB]) => catA.localeCompare(catB))
            .map(([category, categoryProducts]) => (
              <div key={category} className="category-section">
                <h2 className="category-title">{category}</h2>
                <div className="products-grid">
                  {categoryProducts.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </div>
            ))
        )}
      </div>
      <BottomCartModal />
    </div>
  );
}