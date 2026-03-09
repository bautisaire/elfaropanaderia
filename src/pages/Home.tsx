import { useEffect, useState } from "react";

import ProductSkeleton from "../components/ProductSkeleton";
import CategorySlider from "../components/CategorySlider";
import Hero from "../components/Hero"; // Import Hero
import ProductModal from "../components/ProductModal";
import FloatingCartButton from "../components/FloatingCartButton";
import "./Home.css";
import { db, auth } from "../firebase/firebaseConfig";
import { collection, getDocs, doc, updateDoc, increment, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Product, useCart } from "../context/CartContext";

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAIL || "").split(",").map((e: string) => e.trim());
import { FaStoreSlash } from "react-icons/fa";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [categoryOrder, setCategoryOrder] = useState<Record<string, number>>({});
  const [categoryVisibility, setCategoryVisibility] = useState<Record<string, boolean>>({});

  // Use Context for store status
  const { isStoreOpen, closedMessage, isStoreClosedDismissed, dismissStoreClosed } = useCart();

  // Registro de visitas (no cuenta si es admin)
  useEffect(() => {
    const visited = sessionStorage.getItem('hasVisited');
    if (visited) return; // Already counted this session, do nothing

    // Wait for Firebase Auth to resolve before deciding
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      unsubscribe(); // We only need the first resolved state

      // No contar visitas de administradores
      if (currentUser?.email && ADMIN_EMAILS.includes(currentUser.email)) {
        sessionStorage.setItem('hasVisited', 'true');
        return;
      }

      try {
        const statsRef = doc(db, "stats", "general");
        const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: "America/Argentina/Buenos_Aires", year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

        await updateDoc(statsRef, {
          visits: increment(1),
          [`dailyVisits.${todayDate}`]: increment(1)
        });
      } catch (error: any) {
        if (error.code === 'not-found') {
          const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: "America/Argentina/Buenos_Aires", year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
          await setDoc(doc(db, "stats", "general"), {
            visits: 1,
            dailyVisits: { [todayDate]: 1 }
          });
        }
      }
      sessionStorage.setItem('hasVisited', 'true');
    });
  }, []);

  // Removed redundant fetchStoreStatus useEffect since Context handles it

  // Cargar productos y categorías desde Firebase
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [productsSnapshot, categoriesSnapshot] = await Promise.all([
          getDocs(collection(db, "products")),
          getDocs(collection(db, "categories"))
        ]);

        // Procesar Categorías para obtener orden y visibilidad
        const orders: Record<string, number> = {};
        const visibility: Record<string, boolean> = {};
        categoriesSnapshot.docs.forEach(doc => {
          const data = doc.data();
          orders[data.name] = data.order ?? 9999;
          visibility[data.name] = data.isVisible !== false; // Default to true if undefined
        });
        setCategoryOrder(orders);
        setCategoryVisibility(visibility);

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
            categoria: (data.categoria || "Otros").trim(),
            stockReadyTime: data.stockReadyTime,
            customBadgeText: data.customBadgeText,
            badgeExpiresAt: data.badgeExpiresAt
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
            .filter(([category]) => categoryVisibility[category] !== false)
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

      {!isStoreOpen && !isStoreClosedDismissed && (
        <div className="store-closed-overlay">
          <div className="store-closed-modal">
            <FaStoreSlash size={50} color="#ef4444" />
            <h2>Tienda Cerrada</h2>
            <p>{closedMessage || "Lo sentimos, el local se encuentra cerrado."}</p>
            <button
              onClick={dismissStoreClosed}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                background: 'transparent',
                border: '1px solid #7f1d1d',
                color: '#7f1d1d',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem'
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      <FloatingCartButton />
    </div>
  );
}