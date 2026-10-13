import { useNavigate, useLocation } from "react-router-dom";
import { useContext, useState, useEffect } from "react";
import { CartContext } from "../context/CartContext";
import "./Header.css";
import logo from "../assets/logo.png";
import { db } from "../firebase/firebaseConfig";
import { onSnapshot, doc, getDocs, collection } from "firebase/firestore";
import { FaSearch, FaTimes, FaWhatsapp, FaShoppingCart, FaUser, FaClipboardList } from "react-icons/fa";
import SearchBar from "./SearchBar";
import ProductModal from "./ProductModal";
import { Product } from "../context/CartContext";
import { useScrolled } from "../utils/useScrolled";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const scrolled = useScrolled(40);

  const { cart, isStoreOpen, allowPickup, allowDelivery, setIsSidebarOpen } = useContext(CartContext);
  const totalItems = cart.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchClosing, setIsSearchClosing] = useState(false);

  const closeSearch = () => {
    setIsSearchClosing(true);
    setTimeout(() => {
      setIsSearchOpen(false);
      setIsSearchClosing(false);
    }, 180);
  };
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [orderStatuses, setOrderStatuses] = useState<Record<string, any>>({});

  // El buscador del menú inferior (mobile) abre la búsqueda de este header.
  useEffect(() => {
    const open = () => {
      setIsSearchOpen(true);
    };
    window.addEventListener("open-search", open);
    return () => window.removeEventListener("open-search", open);
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

  // Color de la barra de estado del navegador (iOS/Android): oscuro sobre la portada, blanco con el header sólido.
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    const apply = () => {
      const overHero = !scrolled && !isSearchOpen && document.body.classList.contains('has-cover-hero');
      meta!.content = overHero ? '#1f1410' : '#ff4c4f';
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, [scrolled, isSearchOpen]);

  const hasTopbar = !isStoreOpen || (allowPickup && !allowDelivery);
  useEffect(() => {
    document.body.classList.toggle('header-topbar', hasTopbar);
    return () => document.body.classList.remove('header-topbar');
  }, [hasTopbar]);

  const handleLogoClick = () => {
    navigate("/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isCuentaActive = location.pathname.startsWith("/mi-cuenta");
  const isPedidosActive = location.pathname.startsWith("/mis-pedidos");

  // En el checkout el header se reemplaza por la barra de pasos.
  if (location.pathname.startsWith("/checkout")) return null;

  return (
    <>
      {!isStoreOpen && (
        <div className={`topbar-cerrado `}>
          CERRADO
        </div>
      )}

      {isStoreOpen && allowPickup && !allowDelivery && (
        <div className={`topbar-cerrado `} style={{ backgroundColor: '#16a34a' }}>
          SOLO RETIRO EN LOCAL
        </div>
      )}

      <header className={`header-container scrolled ${isSearchOpen ? 'search-open' : ''} ${!scrolled && !isSearchOpen ? 'at-top' : ''} ${(!isStoreOpen || (isStoreOpen && allowPickup && !allowDelivery)) ? 'with-topbar' : ''} `}>
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
            <img src={logo} alt="El Faro Panadería" className="logo-img" />
            <span className="brand-name">EL FARO <span className="brand-suffix">PANADERIA</span></span>
          </div>

          <div className="header-right">
            <nav className="nav-menu">
              <button
                className="header-icon-btn header-search-btn"
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
          <div className={`global-search-container ${isSearchClosing ? 'closing' : ''}`} style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <SearchBar
                products={products}
                onProductSelect={(prod) => {
                  setSelectedProduct(prod);
                  closeSearch();
                }}
              />
            </div>
            <button
              onClick={closeSearch}
              style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#fff', cursor: 'pointer', padding: '10px', display: 'flex', alignItems: 'center' }}
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
