import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import ProductSkeleton from "../components/ProductSkeleton";
import CategorySlider from "../components/CategorySlider";
import Hero from "../components/Hero"; // Import Hero
import ProductModal from "../components/ProductModal";
import FloatingCartButton from "../components/FloatingCartButton";
import "./Home.css";
import { db, auth } from "../firebase/firebaseConfig";
import { collection, doc, increment, setDoc, onSnapshot, query, where, limit, orderBy } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Product, useCart } from "../context/CartContext";

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAIL || "").split(",").map((e: string) => e.trim());
import { FaStoreSlash, FaWhatsapp, FaTrophy, FaTimes, FaGift } from "react-icons/fa";
export default function Home() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [categoryOrder, setCategoryOrder] = useState<Record<string, number>>({});
  const [categoryVisibility, setCategoryVisibility] = useState<Record<string, boolean>>({});

  const [activeRaffle, setActiveRaffle] = useState<any>(null);
  const [raffleParticipants, setRaffleParticipants] = useState<any[]>([]);
  const [showRaffleModal, setShowRaffleModal] = useState(false);

  useEffect(() => {
    const qRaffle = query(collection(db, "raffles"), where("isActive", "==", true), limit(1));
    const unsubRaffle = onSnapshot(qRaffle, (snap) => {
      if (!snap.empty) {
        const raffleData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setActiveRaffle(raffleData);
        
        const qParts = query(collection(db, `raffles/${raffleData.id}/participants`), orderBy("date", "desc"));
        onSnapshot(qParts, (snapParts) => {
          const parts: any[] = [];
          snapParts.docs.forEach(d => parts.push({ id: d.id, ...d.data() }));
          setRaffleParticipants(parts);
        });
      } else {
        setActiveRaffle(null);
        setRaffleParticipants([]);
      }
    });
    return () => unsubRaffle();
  }, []);

  const {
    isStoreOpen,
    closedMessage,
    isStoreClosedDismissed,
    dismissStoreClosed,
    catalogProducts: products,
    catalogLoading: loading,
    getCatalogProduct,
  } = useCart();
  const location = useLocation();

  // Registro de visitas (no cuenta si es admin)
  useEffect(() => {
    document.body.classList.add('svg-background');
    return () => document.body.classList.remove('svg-background');
  }, []);

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

      const queryParams = new URLSearchParams(location.search);
      let source = (queryParams.get('ref') || 'Directo').trim();
      // Capitalize first letter for better display (e.g. facebook -> Facebook)
      source = source.charAt(0).toUpperCase() + source.slice(1).toLowerCase();

      try {
        const statsRef = doc(db, "stats", "general");
        const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: "America/Argentina/Buenos_Aires", year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

        await setDoc(statsRef, {
          visits: increment(1),
          dailyVisits: { [todayDate]: increment(1) },
          visitsBySource: { [source]: increment(1) },
          dailyVisitsBySource: { [todayDate]: { [source]: increment(1) } }
        }, { merge: true });
      } catch (error: any) {
        console.error("Error logging visit:", error);
      }
      sessionStorage.setItem('hasVisited', 'true');
    });
  }, [location.search]);

  // Removed redundant fetchStoreStatus useEffect since Context handles it

  // Categorías (productos vienen en vivo desde CartContext)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "categories"),
      (categoriesSnapshot) => {
        const orders: Record<string, number> = {};
        const visibility: Record<string, boolean> = {};
        categoriesSnapshot.docs.forEach((d) => {
          const data = d.data();
          orders[data.name] = data.order ?? 9999;
          visibility[data.name] = data.isVisible !== false;
        });
        setCategoryOrder(orders);
        setCategoryVisibility(visibility);
      },
      (error) => console.error("Error loading categories:", error)
    );
    return () => unsub();
  }, []);

  // Modal de detalle: mantener producto sincronizado con el catálogo en vivo
  useEffect(() => {
    if (!selectedProduct) return;
    const live = getCatalogProduct(String(selectedProduct.id));
    if (live) setSelectedProduct(live);
  }, [products, selectedProduct?.id, getCatalogProduct]);

  return (
    <div className="home-container">
      <Hero onRaffleClick={() => setShowRaffleModal(true)} activeRaffle={activeRaffle} />
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
      
      {activeRaffle && (
        <button
          className="floating-raffle-btn"
          onClick={() => setShowRaffleModal(true)}
          title="Ver Sorteo Actual"
        >
          <FaTrophy color="#eab308" size={24} />
        </button>
      )}

      {showRaffleModal && activeRaffle && (
        <div className="store-closed-overlay" onClick={() => setShowRaffleModal(false)} style={{ zIndex: 10000 }}>
          <div className="store-closed-modal raffle-home-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%' }}>
            <button className="raffle-modal-close" onClick={() => setShowRaffleModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#666' }}><FaTimes /></button>
            <FaTrophy color="#eab308" size={40} style={{ marginBottom: '10px' }} />
            <h2 style={{ marginBottom: '5px', fontSize: '1.5rem', color: '#1e293b' }}>{activeRaffle.title || 'Sorteo de la Semana'}</h2>
            <p style={{ color: '#047857', fontWeight: 'bold', marginBottom: activeRaffle.drawDate ? '5px' : '20px' }}>Premios: {activeRaffle.prize}</p>
            {activeRaffle.drawDate && (
              <p style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '15px' }}>
                📅 Se sortea el: {new Date(activeRaffle.drawDate + 'T00:00:00').toLocaleDateString()}
              </p>
            )}
            
            <div className="raffle-participants-list" style={{ textAlign: 'left', background: '#f8fafc', padding: '15px', borderRadius: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              <h3 style={{ fontSize: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '10px', color: '#334155' }}>
                Participantes ({raffleParticipants.length})
              </h3>
              {raffleParticipants.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center' }}>Aún no hay participantes. ¡Haz tu pedido para ser el primero!</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {raffleParticipants.map(p => (
                    <li key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', fontSize: '0.95rem', color: '#475569' }}>
                      <FaGift style={{ color: '#34d399', marginRight: '10px' }} />
                      {p.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      
      <a
        href="https://wa.me/5492995206821"
        target="_blank"
        rel="noopener noreferrer"
        className="floating-whatsapp-btn"
        aria-label="Chat en WhatsApp"
      >
        <FaWhatsapp size={32} />
      </a>
    </div>
  );
}