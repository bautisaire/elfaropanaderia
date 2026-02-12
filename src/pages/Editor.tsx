import { useEffect, useState, useRef } from "react";
import "./Editor.css";
import { auth, googleProvider, db } from "../firebase/firebaseConfig";
import { collection, query, onSnapshot } from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { useNavigate, useLocation, Routes, Route, Navigate } from "react-router-dom";
import { FaBoxOpen, FaHome, FaSignOutAlt, FaStore, FaClipboardCheck, FaChartPie, FaCashRegister, FaBars, FaTimes, FaChevronLeft, FaChevronRight, FaClipboardList, FaCog, FaMoneyBillWave } from "react-icons/fa";
import OrdersManager from "../components/OrdersManager";
import ProductManager from "../components/ProductManager";
import StockManager from "../components/StockManager";
import Dashboard from "../components/Dashboard";
import StoreEditor from "../components/StoreEditor";
import POSManager from "../components/POSManager";
import AdminSettings from "../components/AdminSettings";
import ExpenseManager from "../components/ExpenseManager";

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAIL || "").split(",").map((e: string) => e.trim());

export default function Editor() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false); // Collapsed state for desktop

  const navigate = useNavigate();
  const location = useLocation();
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Determine active tab based on path
  const currentPath = location.pathname.replace('/editor', '').split('/')[1] || 'dashboard';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node) &&
        !collapsed &&
        window.innerWidth >= 850 // Only for desktop
      ) {
        setCollapsed(true);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [collapsed]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email && ADMIN_EMAILS.includes(user.email)) {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
      }
      setCheckingAuth(false);
    });
    return () => unsubscribe();
  }, []);



  // Global Notification Listener for New Orders
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, "orders"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Logic for Pending Count (Existing)
      const count = snapshot.docs.filter(doc => {
        const data = doc.data();
        const status = data.status || "pendiente";
        return status !== "cancelado" && status !== "entregado";
      }).length;
      setPendingOrdersCount(count);

      // Logic for Notifications (New)
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const newOrder = change.doc.data();
          const isPos = newOrder.source === 'pos' || newOrder.source === 'pos_public' || newOrder.source === 'pos_wholesale';

          // Skip if source is POS (internal sales don't need alerts)
          if (isPos) return;

          const alertsEnabled = localStorage.getItem('admin_order_alerts_enabled') === 'true';
          const notificationSupported = typeof Notification !== 'undefined';

          if (alertsEnabled && notificationSupported && Notification.permission === "granted") {
            console.log("🔔 Nueva orden detectada:", newOrder);
            const orderId = change.doc.id.slice(-6).toUpperCase();

            const notification = new Notification(`¡Nuevo Pedido Web! #${orderId}`, {
              body: `Total: $${newOrder.total} - ${newOrder.cliente?.nombre || 'Cliente'}`,
              tag: change.doc.id, // prevent duplicates
              icon: '/logo192.png' // Optional: path to favicon/logo if available
            });

            notification.onclick = () => {
              window.focus();
              navigate('/editor/orders/web');
              notification.close();
            };

            console.log("🔔 Notificación enviada");
          }
        }
      });
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (!result.user.email || !ADMIN_EMAILS.includes(result.user.email)) {
        await signOut(auth);
        alert("⛔ Acceso denegado: Este email no tiene permisos de administrador.");
      }
    } catch (error) {
      console.error("Error login:", error);
      setMessage("Error al iniciar sesión con Google");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/");
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  if (checkingAuth) {
    return <div style={{ marginTop: '100px', textAlign: 'center', fontSize: '1.2rem' }}>Verificando credenciales...</div>;
  }

  return (
    <div className="editor-page">
      {!currentUser ? (
        // --- VISTA DE LOGIN (SOLO GOOGLE) ---
        <div className="editor-login" style={{ textAlign: 'center', maxWidth: '400px', margin: '0 auto', padding: '40px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: '12px' }}>
          <h2 style={{ marginBottom: '10px' }}>Panel de Administración</h2>
          <p style={{ marginBottom: '30px', color: '#666' }}>Acceso exclusivo para personal autorizado</p>

          <button
            onClick={handleLogin}
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              width: '100%',
              padding: '12px',
              fontSize: '1rem',
              backgroundColor: '#fff',
              color: '#3c4043',
              border: '1px solid #dadce0',
              boxShadow: 'none'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" /><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" /><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" /><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.272C4.672 5.141 6.656 3.58 9 3.58z" fill="#EA4335" /></svg>
            Entrar con Google
          </button>

          {message && <div className="editor-msg" style={{ marginTop: '20px', color: 'red' }}>{message}</div>}
        </div>
      ) : (
        <div className="editor-layout">
          {/* Mobile Header logic */}
          <div className="mobile-header">
            <button className="burger-btn" onClick={() => setMobileMenuOpen(true)}>
              <FaBars />
            </button>
            <span>Panel Admin</span>
          </div>

          {/* Mobile Overlay */}
          {mobileMenuOpen && <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />}

          <aside ref={sidebarRef} className={`editor-sidebar ${mobileMenuOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
            {/* Mobile close button */}
            <button className="sidebar-close-btn" onClick={() => setMobileMenuOpen(false)}>
              <FaTimes />
            </button>

            {/* Desktop Collapse Toggle */}
            <button className="sidebar-collapse-toggle desktop-only-flex" onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? <FaChevronRight /> : <FaChevronLeft />}
            </button>

            <div className="sidebar-profile">
              <h3>Panel Admin</h3>
              <small>{currentUser.email}</small>
              {collapsed && <div className="collapsed-logo">EA</div>}
            </div>

            <nav>
              <button
                className={currentPath === "dashboard" || currentPath === "" ? "active" : ""}
                onClick={() => handleNavClick("/editor/")}
                title="Dashboard"
              >
                <div className="nav-icon" style={{ color: '#3b82f6' }}><FaChartPie /></div>
                <span className="nav-text">Dashboard</span>
              </button>
              <button
                className={currentPath === "pos" ? "active" : ""}
                onClick={() => handleNavClick("/editor/pos")}
                title="Punto de Venta"
              >
                <div className="nav-icon" style={{ color: '#22c55e' }}><FaCashRegister /></div>
                <span className="nav-text">Punto de Venta</span>
              </button>
              <button
                className={currentPath === "expenses" ? "active" : ""}
                onClick={() => handleNavClick("/editor/expenses")}
                title="Gastos / Materia Prima"
              >
                <div className="nav-icon" style={{ color: '#0ea5e9' }}><FaMoneyBillWave /></div>
                <span className="nav-text">Gastos / Materia Prima</span>
              </button>
              <button
                className={currentPath === "products" ? "active" : ""}
                onClick={() => handleNavClick("/editor/products")}
                title="Productos"
              >
                <div className="nav-icon" style={{ color: '#ef4444' }}><FaBoxOpen /></div>
                <span className="nav-text">Productos</span>
              </button>
              <button
                className={currentPath === "stock" ? "active" : ""}
                onClick={() => handleNavClick("/editor/stock")}
                title="Gestión de Stock"
              >
                <div className="nav-icon" style={{ color: '#eab308' }}><FaClipboardCheck /></div>
                <span className="nav-text">Gestión de Stock</span>
              </button>
              <button
                className={currentPath === "orders" ? "active" : ""}
                onClick={() => handleNavClick("/editor/orders/pos")}
                title="Pedidos"
              >
                <div className="nav-icon" style={{ color: '#a855f7' }}><FaClipboardList /></div>
                <span className="nav-text">Ventas</span>
                {pendingOrdersCount > 0 && (
                  <span className={`sidebar-badge ${collapsed ? 'badge-mini' : ''}`}>{pendingOrdersCount}</span>
                )}
              </button>
              <button
                className={currentPath === "store_editor" ? "active" : ""}
                onClick={() => handleNavClick("/editor/store_editor")}
                title="Editor de Tienda"
              >
                <div className="nav-icon" style={{ color: '#ec4899' }}><FaStore /></div>
                <span className="nav-text">Editor de Tienda</span>
              </button>
              <button
                className={currentPath === "settings" ? "active" : ""}
                onClick={() => handleNavClick("/editor/settings")}
                title="Configuración"
              >
                <div className="nav-icon" style={{ color: '#6b7280' }}><FaCog /></div>
                <span className="nav-text">Configuración</span>
              </button>

              <div className="sidebar-footer">
                <button onClick={() => navigate("/")} title="Ir al Inicio">
                  <div className="nav-icon" style={{ color: '#84cc16' }}><FaHome /></div>
                  <span className="nav-text">Ir al Inicio</span>
                </button>
                <button onClick={handleLogout} className="btn-logout-action" title="Cerrar Sesión">
                  <div className="nav-icon"><FaSignOutAlt /></div>
                  <span className="nav-text">Cerrar Sesión</span>
                </button>
              </div>
            </nav>
          </aside>

          <main className={`editor-content ${collapsed ? 'collapsed-mode' : ''} ${currentPath === 'pos' ? 'pos-active-tab' : ''}`}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/pos" element={<POSManager />} />
              <Route path="/orders/*" element={<OrdersManager />} />
              <Route path="/store_editor" element={<StoreEditor />} />
              <Route path="/stock" element={<StockManager />} />
              <Route path="/settings" element={<AdminSettings />} />
              <Route path="/expenses" element={<ExpenseManager />} />
              <Route path="/products" element={<ProductManager />} />
              <Route path="*" element={<Navigate to="/editor/" replace />} />
            </Routes>
          </main>
        </div>
      )}
    </div>
  );
}