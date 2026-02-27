import { useNavigate } from "react-router-dom";
import { useContext, useState, useEffect } from "react";
import { CartContext } from "../context/CartContext";
import "./Header.css";
import logo from "../assets/logo.png";
import { db } from "../firebase/firebaseConfig";
import { onSnapshot, documentId, query, collection, where, getDocs } from "firebase/firestore";
import { FaBars, FaSearch, FaTimes } from "react-icons/fa";
import LeftSidebar from "./LeftSidebar";
import SearchBar from "./SearchBar";
import ProductModal from "./ProductModal";
import { Product } from "../context/CartContext";

export default function Header() {
  const navigate = useNavigate();

  const { cart, isStoreOpen, setIsSidebarOpen } = useContext(CartContext);
  const totalItems = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);
  const [isLeftMenuOpen, setIsLeftMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [orderStatuses, setOrderStatuses] = useState<Record<string, string>>({});

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
            customBadgeText: data.customBadgeText,
            badgeExpiresAt: data.badgeExpiresAt
          } as Product;
        });
        setProducts(prods.filter(p => p.isVisible !== false));
      } catch (error) {
        console.error("Error loading products for search:", error);
      }
    };
    fetchProducts();
  }, []);

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
    <>
      {!isStoreOpen && (
        <div className="topbar-cerrado">
          CERRADO
        </div>
      )}

      <header className={`header-container scrolled ${!isStoreOpen ? 'with-topbar' : ''}`}>
        <div className="header-content" style={{ display: isSearchOpen ? 'none' : 'grid' }}>
          <div className="header-left">
            <button className="burger-menu-btn" onClick={() => setIsLeftMenuOpen(true)}>
              <FaBars />
            </button>
          </div>

          <div className="logo-section" onClick={handleLogoClick}>
            <img src={logo} alt="El Faro Panadería" className="logo-img" />
            <span className="brand-name">EL FARO <span className="brand-suffix">PANADERIA</span></span>
          </div>

          <div className="header-right">
            <nav className="nav-menu">
              <button
                className="burger-menu-btn"
                onClick={() => setIsSearchOpen(true)}
              >
                <FaSearch />
              </button>
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

      <LeftSidebar
        isOpen={isLeftMenuOpen}
        onClose={() => setIsLeftMenuOpen(false)}
        activeOrdersCount={activeOrdersCount}
        cartTotalItems={totalItems}
        onOpenCart={() => setIsSidebarOpen(true)}
      />
    </>
  );
}
