import { useNavigate, useLocation } from "react-router-dom";
import { useContext, useState, useEffect, useRef } from "react";
import { CartContext } from "../context/CartContext";
import "./Header.css";
import logo from "../assets/logo.png";
import { db } from "../firebase/firebaseConfig";
import { onSnapshot, doc, getDocs, collection } from "firebase/firestore";
import { FaSearch, FaTimes, FaWhatsapp, FaShoppingCart, FaUser, FaClipboardList } from "react-icons/fa";
import SearchBar from "./SearchBar";
import ProductModal from "./ProductModal";
import { Product } from "../context/CartContext";

const BanderinSVG = ({ className }: { className?: string }) => (
  <svg 
    className={className} 
    viewBox="0 0 60 30" 
    xmlns="http://www.w3.org/2000/svg"
    style={{ filter: 'drop-shadow(0px 2px 3px rgba(0,0,0,0.15))' }}
  >
    <polygon points="0,0 60,0 50,10 0,10" fill="#74ACDF" />
    <polygon points="0,10 50,10 45,15 50,20 0,20" fill="#FFFFFF" />
    <polygon points="0,20 50,20 60,30 0,30" fill="#74ACDF" />
    <circle cx="22" cy="15" r="3.5" fill="#F6B40E" />
  </svg>
);

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const { cart, isStoreOpen, allowPickup, allowDelivery, setIsSidebarOpen } = useContext(CartContext);
  const totalItems = cart.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [orderStatuses, setOrderStatuses] = useState<Record<string, any>>({});

  const [isNavHidden, setIsNavHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 80) {
        setIsNavHidden(false);
      } else if (currentScrollY > lastScrollY.current) {
        setIsNavHidden(true);
      } else if (currentScrollY < lastScrollY.current) {
        setIsNavHidden(false);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // Fetch products for global search
    const fetchProducts = async () => {
      try {
        const productsSnapshot = await getDocs(collection(db, "products"));
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
            availableAt: data.availableAt,
            createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
          } as Product;
        });
        setProducts(prods.filter(p => p.isVisible !== false));
      } catch (error) {
        console.error("Error loading products for search:", error);
      }
    };
    fetchProducts();
  }, []);

  const activeOrdersCount = Object.values(orderStatuses).filter(
    (o: any) => o.status !== 'entregado' && o.status !== 'cancelado'
  ).length;

  useEffect(() => {
    let unsubscribers: (() => void)[] = [];

    const setupListeners = () => {
      unsubscribers.forEach(u => u());
      unsubscribers = [];
      setOrderStatuses({});

      let validIds: any[] = [];
      try {
        const storedIds = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');
        validIds = storedIds
          .map((item: any) => typeof item === 'object' ? (item.id || item.orderId) : item)
          .filter((id: any) => id);
      } catch (e) {
        console.warn("Error accessing localStorage for orders:", e);
      }

      if (validIds.length === 0) return;

      validIds.forEach(id => {
        const docRef = doc(db, "orders", id);
        const unsub = onSnapshot(docRef, (snapshot) => {
          if (snapshot.exists()) {
            setOrderStatuses(prev => {
              const data = snapshot.data();
              return { ...prev, [snapshot.id]: { status: data.status, date: data.date?.seconds || 0 } };
            });
          }
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

  const isCuentaActive = location.pathname.startsWith("/mi-cuenta");
  const isPedidosActive = location.pathname.startsWith("/mis-pedidos");

  return (
    <>
      {!isStoreOpen && (
        <div className={`topbar-cerrado ${isNavHidden && !isSearchOpen ? 'nav-hidden' : ''}`}>
          CERRADO
        </div>
      )}

      {isStoreOpen && allowPickup && !allowDelivery && (
        <div className={`topbar-cerrado ${isNavHidden && !isSearchOpen ? 'nav-hidden' : ''}`} style={{ backgroundColor: '#16a34a' }}>
          SOLO RETIRO EN LOCAL
        </div>
      )}

      <header className={`header-container scrolled ${(!isStoreOpen || (isStoreOpen && allowPickup && !allowDelivery)) ? 'with-topbar' : ''} ${isNavHidden && !isSearchOpen ? 'nav-hidden' : ''}`}>
        <div className="header-content" style={{ display: isSearchOpen ? 'none' : 'grid' }}>
          <div className="header-left">
            <a
              href="https://wa.me/5492995206821"
              target="_blank"
              rel="noopener noreferrer"
              className="burger-menu-btn header-whatsapp-btn"
              aria-label="Chat en WhatsApp"
            >
              <FaWhatsapp />
            </a>
          </div>

          <div className="logo-section" onClick={handleLogoClick}>
            <BanderinSVG className="banderin-left" />
            <img src={logo} alt="El Faro Panadería" className="logo-img" />
            <span className="brand-name">EL FARO <span className="brand-suffix">PANADERIA</span></span>
            <BanderinSVG className="banderin-right" />
          </div>

          <div className="header-right">
            <nav className="nav-menu">
              <button
                className="header-icon-btn"
                onClick={() => setIsSearchOpen(true)}
                aria-label="Buscar"
                title="Buscar"
              >
                <FaSearch />
              </button>

              <div className="header-desktop-actions">
                <button
                  className="header-icon-btn"
                  onClick={() => setIsSidebarOpen(true)}
                  aria-label="Carrito"
                  title="Carrito"
                >
                  <FaShoppingCart />
                  {totalItems > 0 && <span className="header-icon-badge">{totalItems}</span>}
                </button>

                <button
                  className={`header-icon-btn ${isPedidosActive ? "active" : ""}`}
                  onClick={() => navigate("/mis-pedidos")}
                  aria-label="Mis Pedidos"
                  title="Mis Pedidos"
                >
                  <FaClipboardList />
                  {activeOrdersCount > 0 && <span className="header-icon-badge">{activeOrdersCount}</span>}
                </button>

                <button
                  className={`header-icon-btn ${isCuentaActive ? "active" : ""}`}
                  onClick={() => navigate("/mi-cuenta")}
                  aria-label="Mi Cuenta"
                  title="Mi Cuenta"
                >
                  <FaUser />
                </button>
              </div>
            </nav>
          </div>
        </div>

        {isSearchOpen && (
          <div className="global-search-container" style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <SearchBar
                products={products}
                onProductSelect={(prod) => {
                  setSelectedProduct(prod);
                  setIsSearchOpen(false); // Optionally close search or keep it open
                }}
              />
            </div>
            <button
              onClick={() => setIsSearchOpen(false)}
              style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#666', cursor: 'pointer', padding: '10px', display: 'flex', alignItems: 'center' }}
            >
              <FaTimes />
            </button>
          </div>
        )}
      </header>

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
}
