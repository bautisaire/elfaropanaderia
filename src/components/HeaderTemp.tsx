import { Link, useNavigate } from "react-router-dom";
import { useContext, useState, useEffect } from "react";
import { CartContext } from "../context/CartContext";
import "./Header.css";
import logo from "../assets/logo.png";
import { db } from "../firebase/firebaseConfig";
import { onSnapshot, documentId, query, collection, where } from "firebase/firestore";

export default function Header() {
  const navigate = useNavigate();

  const { cart, isStoreOpen } = useContext(CartContext);
  const totalItems = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);

  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [orderStatuses, setOrderStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    const dateCutoff = new Date('2025-12-14T00:00:00-03:00').getTime() / 1000;
    let count = 0;
    Object.values(orderStatuses).forEach((val: any) => {
      if (val.date >= dateCutoff && val.status !== 'entregado' && val.status !== 'cancelado' && val.status !== 'done') {
        count++;
      }
    });
    setActiveOrdersCount(count);
  }, [orderStatuses]);

  useEffect(() => {
    let unsubscribers: (() => void)[] = [];

    const setupListeners = () => {
      unsubscribers.forEach(u => u());
      unsubscribers = [];
      setOrderStatuses({});

      const storedIds = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');
      const validIds = storedIds
        .map((item: any) => typeof item === 'object' ? (item.id || item.orderId) : item)
        .filter((id: any) => id);

      if (validIds.length === 0) return;

      const chunkArray = (arr: string[], size: number) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size));
        }
        return chunks;
      };

      const chunks = chunkArray(validIds, 10);

      chunks.forEach(chunk => {
        const q = query(collection(db, "orders"), where(documentId(), "in", chunk));
        const unsub = onSnapshot(q, (snapshot) => {
          setOrderStatuses(prev => {
            const next = { ...prev };
            snapshot.docs.forEach(doc => {
              const data = doc.data();
              next[doc.id] = { status: data.status, date: data.date?.seconds || 0 } as any;
            });
            return next;
          });
        });
        unsubscribers.push(unsub);
      });
    };

    window.addEventListener("storage", setupListeners);
    setupListeners();

    return () => {
      window.removeEventListener("storage", setupListeners);
      unsubscribers.forEach(u => u());
    };
  }, []);

  const handleLogoClick = () => {
    navigate("/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className="header-container scrolled">
      <div className="header-content">
        <div className="logo-section" onClick={handleLogoClick}>
          <img src={logo} alt="El Faro Panadería" className="logo-img" />
          <span className="brand-name">EL FARO <span className="brand-suffix">PANADERIA</span></span>
          {!isStoreOpen && (
            <span className="closed-badge" style={{
              backgroundColor: '#ef4444',
              color: 'white',
              fontSize: '0.7rem',
              padding: '4px 8px',
              borderRadius: '12px',
              marginLeft: '8px',
              fontWeight: 'bold',
              verticalAlign: 'middle'
            }}>
              CERRADO
            </span>
          )}
        </div>

        <nav className="nav-menu">
          <Link to="/carrito" className="nav-link cart-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            Carrito
            {totalItems > 0 && (
              <span className="cart-badge">{totalItems}</span>
            )}
          </Link>

          <Link to="/mis-pedidos" className="nav-link" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
            Mis Pedidos
            {activeOrdersCount > 0 && (
              <span className="cart-badge" style={{ backgroundColor: '#df5d07ff', right: '-10px', top: '-10px' }}>
                {activeOrdersCount}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
