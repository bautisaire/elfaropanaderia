import { useEffect, useState } from "react";

import BottomCartModal from "../components/BottomCartModal";
import ProductSkeleton from "../components/ProductSkeleton";
import CategorySlider from "../components/CategorySlider";
import Hero from "../components/Hero"; // Import Hero
import "./Home.css";
import { db } from "../firebase/firebaseConfig";
import { collection, getDocs, doc, updateDoc, increment, setDoc, getDoc } from "firebase/firestore";
import { Product } from "../context/CartContext";
import { FaStoreSlash } from "react-icons/fa";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isStoreOpen, setIsStoreOpen] = useState(true);
  const [storeMessage, setStoreMessage] = useState("");

  // Registro de visitas
  useEffect(() => {
    const recordVisit = async () => {
      const visited = sessionStorage.getItem('hasVisited');
      if (!visited) {
        try {
          const statsRef = doc(db, "stats", "general");
          await updateDoc(statsRef, {
            visits: increment(1)
          });
        } catch (error: any) {
          if (error.code === 'not-found') {
            await setDoc(doc(db, "stats", "general"), {
              visits: 1
            });
          }
        }
        sessionStorage.setItem('hasVisited', 'true');
      }
    };
    recordVisit();
  }, []);

  // Cargar estado de la tienda
  useEffect(() => {
    const fetchStoreStatus = async () => {
      try {
        const docSnap = await getDoc(doc(db, "config", "store_settings"));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.isOpen === false) {
            setIsStoreOpen(false);
            setStoreMessage(data.closeMessage || "Estamos cerrados. Abrimos de Lunes a Sábado de 8 a 22hs.");
          }
        }
      } catch (error) {
        console.error("Error checking store status:", error);
      }
    };
    fetchStoreStatus();
  }, []);

  // Cargar productos y categorías desde Firebase
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [productsSnapshot, categoriesSnapshot] = await Promise.all([
          getDocs(collection(db, "products")),
          getDocs(collection(db, "categories"))
        ]);

        // Procesar Categorías para obtener orden
        const orders: Record<string, number> = {};
        categoriesSnapshot.docs.forEach(doc => {
          const data = doc.data();
          orders[data.name] = data.order ?? 9999;
        });
        setCategoryOrder(orders);

        // Procesar Productos
        const prods: Product[] = productsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.nombre,
            price: data.precio,
            image: data.img || "",
            images: data.images || (data.img ? [data.img] : []),
            variants: data.variants || [],
            quantity: 0,
            stock: data.stock,
            stockQuantity: data.stockQuantity,
            isVisible: data.isVisible !== false,
            discount: data.discount || 0,
            categoria: (data.categoria || "Otros").trim()
          } as Product;
        });

        // Ordenar productos: Primero con stock, al final sin stock
        prods.sort((a, b) => {
          const aOutOfStock = a.variants && a.variants.length > 0
            ? a.variants.every(v => !v.stock)
            : (a.stockQuantity !== undefined ? a.stockQuantity <= 0 : a.stock === false);

          const bOutOfStock = b.variants && b.variants.length > 0
            ? b.variants.every(v => !v.stock)
            : (b.stockQuantity !== undefined ? b.stockQuantity <= 0 : b.stock === false);

          if (aOutOfStock === bOutOfStock) return 0;
          return aOutOfStock ? 1 : -1;
        });

        setProducts(prods.filter(p => p.isVisible !== false));
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="home-container">
      <Hero />
      <div className="home">
        {loading ? (
          // Mostrar 6 esqueletos mientras carga
          Array.from({ length: 6 }).map((_, index) => (
            <ProductSkeleton key={index} />
          ))
        ) : (
          Object.entries(
            products.reduce((acc, product) => {
              const category = product.categoria || "Otros";
              if (!acc[category]) acc[category] = [];
              acc[category].push(product);
              return acc;
            }, {} as Record<string, Product[]>)
          )
            .sort(([a], [b]) => {
              const orderA = categoryOrder[a] ?? 9999;
              const orderB = categoryOrder[b] ?? 9999;

              if (orderA !== orderB) return orderA - orderB;

              if (a === 'Otros') return 1;
              if (b === 'Otros') return -1;
              return a.localeCompare(b);
            })
            .map(([category, categoryProducts]) => (
              <CategorySlider key={category} category={category} products={categoryProducts} />
            ))
        )}
      </div>

      {!isStoreOpen && (
        <div className="store-closed-overlay">
          <div className="store-closed-modal">
            <FaStoreSlash size={50} color="#ef4444" />
            <h2>Tienda Cerrada</h2>
            <p>{storeMessage}</p>
          </div>
        </div>
      )}

      <BottomCartModal />
    </div>
  );
}