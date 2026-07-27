import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ProductSkeleton from "../components/ProductSkeleton";
import CategorySlider from "../components/CategorySlider";
import Hero from "../components/Hero"; // Import Hero
import ProductDetailsModal from "../components/ProductDetailsModal";
import FloatingCartButton from "../components/FloatingCartButton";
import "./Home.css";
import { db, auth } from "../firebase/firebaseConfig";
import { collection, doc, getDoc, increment, setDoc, updateDoc, onSnapshot, query, where, limit, orderBy } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Product, useCart } from "../context/CartContext";

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAIL || "").split(",").map((e: string) => e.trim());
import { FaStoreSlash, FaWhatsapp, FaTrophy, FaTimes, FaGift, FaExternalLinkAlt } from "react-icons/fa";
export default function Home() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [categoryOrder, setCategoryOrder] = useState<Record<string, number>>({});
  const [categoryVisibility, setCategoryVisibility] = useState<Record<string, boolean>>({});

  const [activeRaffle, setActiveRaffle] = useState<any>(null);
  const [raffleParticipants, setRaffleParticipants] = useState<any[]>([]);
  const [showRaffleModal, setShowRaffleModal] = useState(false); // Participate modal
  const [showRaffleInfoModal, setShowRaffleInfoModal] = useState(false); // Info modal (participants/roulette)
  const [raffleModalStep, setRaffleModalStep] = useState<1 | 2>(1);
  const [showImageLinkOverlay, setShowImageLinkOverlay] = useState(false);

  useEffect(() => {
    const qRaffle = query(collection(db, "raffles"), where("isActive", "==", true), limit(1));
    const unsubRaffle = onSnapshot(qRaffle, (snap) => {
      if (!snap.empty) {
        const raffleData = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
        setActiveRaffle(raffleData);

        // Preload the image so it's ready when the modal opens
        if (raffleData.imageUrl) {
          const img = new Image();
          img.src = raffleData.imageUrl;
        }

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
    user,
  } = useCart();
  const location = useLocation();
  const navigate = useNavigate();

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

  // Modal Automático para sorteos
  useEffect(() => {
    if (activeRaffle?.isModalMode && isStoreOpen) {
      const shown = localStorage.getItem(`raffle_modal_shown_${activeRaffle.id}`);
      if (!shown) {
        setShowRaffleModal(true);
        setRaffleModalStep(1);
        localStorage.setItem(`raffle_modal_shown_${activeRaffle.id}`, 'true');
      }
    }
  }, [activeRaffle, isStoreOpen]);

  const [dbParticipated, setDbParticipated] = useState(false);
  useEffect(() => {
    if (user?.uid && activeRaffle) {
      getDoc(doc(db, "users", user.uid)).then(d => {
        if (d.exists() && d.data().participatedRaffles?.[activeRaffle.id]) {
          setDbParticipated(true);
          localStorage.setItem(`raffle_unlocked_${activeRaffle.id}`, 'true');
        }
      });
    }
  }, [user, activeRaffle]);

  // Handle abandoned participations
  useEffect(() => {
    if (activeRaffle?.id) {
      const hasIntent = localStorage.getItem(`raffle_intent_${activeRaffle.id}`);
      const isUnlocked = localStorage.getItem(`raffle_unlocked_${activeRaffle.id}`) || dbParticipated;
      const sessionStep1 = sessionStorage.getItem(`raffle_step1_done_${activeRaffle.id}`);

      if (hasIntent && !isUnlocked && !sessionStep1) {
        // User started participating but closed/restarted session without completing an order
        updateDoc(doc(db, "raffles", activeRaffle.id), {
          abandonedParticipations: increment(1)
        }).catch(err => console.error("Error updating abandoned participations", err));
        
        localStorage.removeItem(`raffle_intent_${activeRaffle.id}`);
      } else if (isUnlocked && hasIntent) {
        // User successfully completed participation
        localStorage.removeItem(`raffle_intent_${activeRaffle.id}`);
      }
    }
  }, [activeRaffle, dbParticipated]);

  const handleDescriptionLinkClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A' || target.closest('a')) {
      if (activeRaffle?.id) {
        updateDoc(doc(db, "raffles", activeRaffle.id), {
          linkClicks: increment(1)
        }).catch(err => console.error("Error updating link clicks", err));
      }
    }
  };

  const handleImageClick = (e: React.MouseEvent) => {
    if (!activeRaffle?.imageLink) return;
    e.stopPropagation();
    
    const isDesktop = window.matchMedia('(hover: hover)').matches;
    if (isDesktop || showImageLinkOverlay) {
      if (activeRaffle?.id) {
        updateDoc(doc(db, "raffles", activeRaffle.id), {
          linkClicks: increment(1)
        }).catch(err => console.error("Error updating link clicks", err));
      }
      window.open(activeRaffle.imageLink, "_blank", "noopener,noreferrer");
      setShowImageLinkOverlay(false);
    } else {
      setShowImageLinkOverlay(true);
    }
  };

  const handleOpenRaffleModal = () => {
    if (!activeRaffle) return;
    const isUnlocked = localStorage.getItem(`raffle_unlocked_${activeRaffle.id}`) || dbParticipated;
    if (isUnlocked) {
      setShowRaffleInfoModal(true);
    } else {
      const step1Done = sessionStorage.getItem(`raffle_step1_done_${activeRaffle.id}`);
      setRaffleModalStep(step1Done ? 2 : 1);
      setShowRaffleModal(true);
    }
  };

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
      <Hero onRaffleClick={handleOpenRaffleModal} activeRaffle={activeRaffle} />
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
              <CategorySlider key={category} category={category} products={categoryProducts} onOpenDetails={setSelectedProduct} />
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
        <ProductDetailsModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      <FloatingCartButton />

      {activeRaffle && (
        <button
          className="floating-raffle-btn"
          onClick={handleOpenRaffleModal}
          title="Ver Sorteo Actual"
        >
          <FaTrophy color="#eab308" size={24} />
        </button>
      )}

      {/* Modal de Participación (Auto-start) */}
      {showRaffleModal && activeRaffle && (
        <div className="store-closed-overlay" onClick={() => { setShowRaffleModal(false); setShowImageLinkOverlay(false); }} style={{ zIndex: 10000 }}>
          <div className="store-closed-modal raffle-home-modal" onClick={e => { e.stopPropagation(); setShowImageLinkOverlay(false); }} style={{ maxWidth: '400px', width: '90%', padding: '0', overflow: 'hidden' }}>
            <button className="raffle-modal-close" onClick={() => { setShowRaffleModal(false); setShowImageLinkOverlay(false); }} style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(255,255,255,0.8)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', cursor: 'pointer', color: '#333', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}><FaTimes /></button>

            {activeRaffle.imageUrl && (
              <div
                onClick={activeRaffle.imageLink ? handleImageClick : undefined}
                onMouseEnter={() => {
                  if (activeRaffle.imageLink && window.matchMedia('(hover: hover)').matches) {
                    setShowImageLinkOverlay(true);
                  }
                }}
                onMouseLeave={() => {
                  if (activeRaffle.imageLink && window.matchMedia('(hover: hover)').matches) {
                    setShowImageLinkOverlay(false);
                  }
                }}
                style={{
                  width: '100%',
                  height: '200px',
                  backgroundImage: `url(${activeRaffle.imageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: '#f1f5f9',
                  position: 'relative',
                  cursor: activeRaffle.imageLink ? 'pointer' : 'default'
                }}>
                {activeRaffle.imageLink && showImageLinkOverlay && (
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(50, 50, 50, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2
                  }}>
                    <span style={{
                      color: 'white',
                      fontSize: '1.4rem',
                      fontWeight: 'bold',
                      padding: '10px 28px',
                      border: '3px solid #8b0000',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(0, 0, 0, 0.4)',
                      letterSpacing: '1px'
                    }}>
                      Visitar
                    </span>
                  </div>
                )}
              </div>
            )}

            <div style={{ padding: '20px' }}>
              {raffleModalStep === 1 ? (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ background: '#fef3c7', color: '#d97706', display: 'inline-block', padding: '4px 12px', borderRadius: '16px', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '15px' }}>Paso 1/2</div>
                    <br />
                    {!activeRaffle.imageUrl && <FaTrophy color="#eab308" size={40} style={{ marginBottom: '10px' }} />}
                    <h2 style={{ marginBottom: '5px', fontSize: '1.5rem', color: '#1e293b' }}>{activeRaffle.title || 'Sorteo de la Semana'}</h2>
                    {activeRaffle.description && <p className="raffle-description-html" style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '15px', fontStyle: 'italic' }} dangerouslySetInnerHTML={{ __html: activeRaffle.description }} onClick={handleDescriptionLinkClick}></p>}
                  </div>

                  <div style={{ color: '#047857', marginBottom: activeRaffle.drawDate ? '10px' : '20px', textAlign: 'center', width: '100%', fontSize: '0.95rem' }}>
                    {activeRaffle.prizes && Array.isArray(activeRaffle.prizes) ? (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontWeight: '500' }}>
                        {activeRaffle.prizes.map((p: string, i: number) => <li key={i} style={{ marginBottom: '4px' }}>{activeRaffle.prizes.length > 1 ? `${i + 1}. ` : ''}{p}</li>)}
                      </ul>
                    ) : (
                      <p style={{ fontWeight: 'bold' }}>Premios: {activeRaffle.prize}</p>
                    )}
                  </div>

                  {activeRaffle.drawDate && (
                    <p style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '15px', textAlign: 'center' }}>
                      Se sortea el: {new Date(activeRaffle.drawDate + 'T00:00:00').toLocaleDateString('es-AR')}
                    </p>
                  )}

                  <button
                    onClick={() => {
                      sessionStorage.setItem(`raffle_step1_done_${activeRaffle.id}`, 'true');
                      localStorage.setItem(`raffle_intent_${activeRaffle.id}`, 'true');
                      setRaffleModalStep(2);
                    }}
                    style={{
                      marginTop: '10px',
                      width: '100%',
                      padding: '12px',
                      background: '#b45309', // Dark gold / Amber-700
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '1.1rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}
                  >
                    Participar!
                  </button>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <div style={{ background: '#fef3c7', color: '#d97706', display: 'inline-block', padding: '4px 12px', borderRadius: '16px', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '15px' }}>Paso 2/2</div>
                  <h2 style={{ marginBottom: '15px', fontSize: '1.4rem', color: '#1e293b' }}>¡Estás a un paso!</h2>
                  <p style={{ color: '#475569', fontSize: '1.05rem', lineHeight: '1.5', marginBottom: '25px' }}>
                    Debes realizar un pedido para participar en el sorteo.<br /><i>Con cada compra sumás chances de ganar!</i>
                  </p>
                  <button
                    onClick={() => setShowRaffleModal(false)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: '#eab308',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '1.1rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}
                  >
                    Hacer un pedido
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Información (Manual: Participantes y Ruleta) */}
      {showRaffleInfoModal && activeRaffle && (
        <div className="store-closed-overlay" onClick={() => { setShowRaffleInfoModal(false); setShowImageLinkOverlay(false); }} style={{ zIndex: 10000 }}>
          <div className="store-closed-modal raffle-home-modal" onClick={e => { e.stopPropagation(); setShowImageLinkOverlay(false); }} style={{ maxWidth: '400px', width: '90%', padding: '0', overflow: 'hidden' }}>
            <button className="raffle-modal-close" onClick={() => { setShowRaffleInfoModal(false); setShowImageLinkOverlay(false); }} style={{ position: 'absolute', top: '15px', right: '15px', background: activeRaffle.imageUrl ? 'rgba(255,255,255,0.8)' : 'none', border: 'none', borderRadius: activeRaffle.imageUrl ? '50%' : '0', width: activeRaffle.imageUrl ? '30px' : 'auto', height: activeRaffle.imageUrl ? '30px' : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', cursor: 'pointer', color: activeRaffle.imageUrl ? '#333' : '#666', zIndex: 10, boxShadow: activeRaffle.imageUrl ? '0 2px 4px rgba(0,0,0,0.2)' : 'none' }}><FaTimes /></button>

            {activeRaffle.imageUrl && (
              <div
                onClick={activeRaffle.imageLink ? handleImageClick : undefined}
                onMouseEnter={() => {
                  if (activeRaffle.imageLink && window.matchMedia('(hover: hover)').matches) {
                    setShowImageLinkOverlay(true);
                  }
                }}
                onMouseLeave={() => {
                  if (activeRaffle.imageLink && window.matchMedia('(hover: hover)').matches) {
                    setShowImageLinkOverlay(false);
                  }
                }}
                style={{
                  width: '100%',
                  height: '200px',
                  backgroundImage: `url(${activeRaffle.imageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: '#f1f5f9',
                  position: 'relative',
                  cursor: activeRaffle.imageLink ? 'pointer' : 'default'
                }}>
                {activeRaffle.imageLink && showImageLinkOverlay && (
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(50, 50, 50, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2
                  }}>
                    <span style={{
                      backgroundColor: 'var(--primary-color)',
                      color: 'white',
                      fontSize: '1.2rem',
                      fontWeight: '600',
                      padding: '12px 28px',
                      border: 'none',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                      cursor: 'pointer'
                    }}>
                      Visitar <FaExternalLinkAlt size={16} />
                    </span>
                  </div>
                )}
              </div>
            )}

            <div style={{ padding: '25px 20px', textAlign: 'center' }}>
              {!activeRaffle.imageUrl && <FaTrophy color="#eab308" size={40} style={{ marginBottom: '10px' }} />}
              <h2 style={{ marginBottom: '5px', fontSize: '1.5rem', color: '#1e293b' }}>{activeRaffle.title || 'Sorteo de la Semana'}</h2>
              {activeRaffle.description && <p className="raffle-description-html" style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '15px', fontStyle: 'italic' }} dangerouslySetInnerHTML={{ __html: activeRaffle.description }} onClick={handleDescriptionLinkClick}></p>}

              <div style={{ color: '#047857', marginBottom: '15px', textAlign: 'center', width: '100%', fontSize: '0.95rem' }}>
                {activeRaffle.prizes && Array.isArray(activeRaffle.prizes) ? (
                  <ol style={{ margin: 0, paddingLeft: '0', listStylePosition: 'inside', fontWeight: '500' }}>
                    {activeRaffle.prizes.map((p: string, i: number) => <li key={i} style={{ marginBottom: '4px' }}>{activeRaffle.prizes.length > 1 ? `${i + 1}. ` : ''}{p}</li>)}
                  </ol>
                ) : (
                  <p style={{ fontWeight: 'bold' }}>Premios: {activeRaffle.prize}</p>
                )}
              </div>

              <div style={{ background: '#d1fae5', color: '#065f46', padding: '12px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #6ee7b7' }}>
                <div style={{ fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '5px' }}>🎉 ¡Ya estás participando!🎉</div>
                {activeRaffle.customMessage && <div style={{ fontSize: '1.05rem', fontWeight: 'bold', marginTop: '5px' }} dangerouslySetInnerHTML={{ __html: activeRaffle.customMessage }} onClick={handleDescriptionLinkClick}></div>}
              </div>

              {activeRaffle.drawDate && (
                <p style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '20px', textAlign: 'center' }}>
                  📅 Se sortea el: {new Date(activeRaffle.drawDate + 'T00:00:00').toLocaleDateString('es-AR')}
                </p>
              )}

              <div style={{ textAlign: 'left', width: '100%', marginTop: '10px' }}>
                <h3 style={{ fontSize: '1.1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '10px', color: '#334155' }}>
                  Participantes ({raffleParticipants.length})
                </h3>
                <div className="raffle-participants-list" style={{ maxHeight: '250px', overflowY: 'auto', paddingRight: '5px' }}>
                  {raffleParticipants.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', margin: '20px 0' }}>Aún no hay participantes. ¡Haz tu pedido para ser el primero!</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {raffleParticipants.map(p => (
                        <li key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', fontSize: '0.95rem', color: '#475569' }}>
                          <FaGift style={{ color: '#34d399', marginRight: '10px', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <button
                onClick={() => navigate('/ruleta')}
                style={{
                  marginTop: '20px',
                  width: '100%',
                  padding: '12px',
                  background: '#eab308',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}
              >
                🎡 Ver Ruleta
              </button>
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