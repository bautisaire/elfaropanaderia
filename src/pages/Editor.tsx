import { useEffect, useState, useRef } from "react";
import "./Editor.css";
import { auth, googleProvider, db } from "../firebase/firebaseConfig";
import { collection, query, onSnapshot, doc, getDoc } from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { useNavigate, useLocation, Routes, Route, Navigate } from "react-router-dom";
import { FaHome, FaSignOutAlt, FaStore, FaClipboardCheck, FaChartPie, FaCashRegister, FaBars, FaTimes, FaChevronLeft, FaChevronRight, FaClipboardList, FaCog, FaUserFriends, FaGift, FaMotorcycle, FaHeadset } from "react-icons/fa";
import OrdersManager from "../components/OrdersManager";
import StockManager from "../components/StockManager";
import Dashboard from "../components/Dashboard";
import StoreEditor from "../components/StoreEditor";
import POSManager from "../components/POSManager";
import { AiOutlineRead } from "react-icons/ai";
import AdminSettings from "../components/AdminSettings";
import CostManager from "../components/CostManager";
import EmployeesManager from "../components/EmployeesManager";
import RaffleManager from "../components/RaffleManager";
import RiderDashboard from "../components/RiderDashboard";
import RiderSettings from "../components/RiderSettings";
import { useCart } from "../context/CartContext";

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAIL || "").split(",").map((e: string) => e.trim());

export default function Editor() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true); // Collapsed by default for desktop
  const { adminPermissions } = useCart();

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
    let roleUnsub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (roleUnsub) {
        roleUnsub();
        roleUnsub = null;
      }

      if (user && user.email) {
        if (user.email === 'sairebautista@gmail.com' || ADMIN_EMAILS.includes(user.email)) {
          setCurrentUser(user);
        } else {
          roleUnsub = onSnapshot(doc(db, "admin_roles", user.email), (roleDoc) => {
            if (roleDoc.exists()) {
              setCurrentUser(user);
            } else {
              setCurrentUser(null);
            }
            setCheckingAuth(false);
          }, (e) => {
            console.error(e);
            setCurrentUser(null);
            setCheckingAuth(false);
          });
        }
        setCurrentUser(null);
      }
      // Note: setCheckingAuth(false) is called inside onSnapshot for non-superadmins
      if (!user || user.email === 'sairebautista@gmail.com' || ADMIN_EMAILS.includes(user?.email || '')) {
         setCheckingAuth(false);
      }
    });
    return () => {
      unsubscribe();
      if (roleUnsub) roleUnsub();
    };
  }, []);



  // Global Listener for Pending Count
  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, "orders"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Logic for Pending Count
      const count = snapshot.docs.filter(doc => {
        const data = doc.data();
        const status = data.status || "pendiente";
        return status !== "cancelado" && status !== "entregado" && data.isTestOrder !== true;
      }).length;
      setPendingOrdersCount(count);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user.email) {
         if (result.user.email === 'sairebautista@gmail.com' || ADMIN_EMAILS.includes(result.user.email)) {
             // allow
         } else {
             const roleDoc = await getDoc(doc(db, "admin_roles", result.user.email));
             if (!roleDoc.exists()) {
                 await signOut(auth);
                 alert("⛔ Acceso denegado: Este email no tiene permisos de administrador.");
             }
         }
      } else {
        await signOut(auth);
        alert("⛔ Acceso denegado: No se pudo obtener el email.");
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

  if (checkingAuth || adminPermissions === null) {
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
              {adminPermissions?.dashboard !== false && (
                <button
                  className={currentPath === "dashboard" || currentPath === "" ? "active" : ""}
                  onClick={() => handleNavClick("/editor/")}
                  title="Dashboard"
                >
                  <div className="nav-icon" style={{ color: '#3b82f6' }}><FaChartPie /></div>
                  <span className="nav-text">Dashboard</span>
                </button>
              )}
              {adminPermissions?.pos_sales !== false && (
                <button
                  className={currentPath === "pos" ? "active" : ""}
                  onClick={() => handleNavClick("/editor/pos")}
                  title="Punto de Venta"
                >
                  <div className="nav-icon" style={{ color: '#22c55e' }}><FaCashRegister /></div>
                  <span className="nav-text">Punto de Venta</span>
                </button>
              )}

              {adminPermissions?.costs !== false && (
                <button
                  className={currentPath === "costs" || currentPath === "products" ? "active" : ""}
                  onClick={() => handleNavClick("/editor/costs")}
                  title="Productos, Costos y Recetas"
                >
                  <div className="nav-icon" style={{ color: '#f97316' }}><AiOutlineRead /></div>
                  <span className="nav-text">Productos, Costos y Recetas</span>
                </button>
              )}
              {adminPermissions?.stock !== false && (
                <button
                  className={currentPath === "stock" ? "active" : ""}
                  onClick={() => handleNavClick("/editor/stock")}
                  title="Gestión de Stock"
                >
                  <div className="nav-icon" style={{ color: '#eab308' }}><FaClipboardCheck /></div>
                  <span className="nav-text">Gestión de Stock</span>
                </button>
              )}
              {adminPermissions?.orders !== false && (
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
              )}
              {adminPermissions?.store_editor !== false && (
                <button
                  className={currentPath === "store_editor" ? "active" : ""}
                  onClick={() => handleNavClick("/editor/store_editor")}
                  title="Editor de Tienda"
                >
                  <div className="nav-icon" style={{ color: '#ec4899' }}><FaStore /></div>
                  <span className="nav-text">Editor de Tienda</span>
                </button>
              )}
              {adminPermissions?.settings !== false && (
                <button
                  className={currentPath === "settings" ? "active" : ""}
                  onClick={() => handleNavClick("/editor/settings")}
                  title="Configuración"
                >
                  <div className="nav-icon" style={{ color: '#6b7280' }}><FaCog /></div>
                  <span className="nav-text">Configuración</span>
                </button>
              )}

              {adminPermissions?.employees !== false && (
                <button
                  className={currentPath === "employees" ? "active" : ""}
                  onClick={() => handleNavClick("/editor/employees")}
                  title="Personal"
                >
                  <div className="nav-icon" style={{ color: '#0ea5e9' }}><FaUserFriends /></div>
                  <span className="nav-text">Personal</span>
                </button>
              )}

              {adminPermissions?.raffle !== false && (
                <button
                  className={currentPath === "raffle" ? "active" : ""}
                  onClick={() => handleNavClick("/editor/raffle")}
                  title="Sorteos"
                >
                  <div className="nav-icon" style={{ color: '#f43f5e' }}><FaGift /></div>
                  <span className="nav-text">Sorteos</span>
                </button>
              )}

              {adminPermissions?.is_rider === true && (
                <>
                  <button
                    className={currentPath === "rider" && location.pathname === "/editor/rider" ? "active" : ""}
                    onClick={() => handleNavClick("/editor/rider")}
                    title="Panel de Repartidor"
                  >
                    <div className="nav-icon" style={{ color: '#0ea5e9' }}><FaMotorcycle /></div>
                    <span className="nav-text">Panel de Repartidor</span>
                  </button>
                  <a
                    href="https://wa.me/5492995206821"
                    target="_blank"
                    rel="noreferrer"
                    style={{textDecoration: 'none'}}
                  >
                    <button title="Soporte Técnico" style={{width: '100%'}}>
                        <div className="nav-icon" style={{ color: '#ef4444' }}><FaHeadset /></div>
                        <span className="nav-text">Soporte Técnico</span>
                    </button>
                  </a>
                  <button
                    className={location.pathname === "/editor/rider-settings" ? "active" : ""}
                    onClick={() => handleNavClick("/editor/rider-settings")}
                    title="Configurar Respuestas Rápidas"
                  >
                    <div className="nav-icon" style={{ color: '#64748b' }}><FaCog /></div>
                    <span className="nav-text">Respuestas Rápidas</span>
                  </button>
                </>
              )}

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

          <main className={`editor-content ${collapsed ? 'collapsed-mode' : ''} ${currentPath === 'pos' ? 'pos-active-tab' : ''} ${currentPath === 'orders' ? 'editor-orders-fullbleed' : ''} ${currentPath === 'costs' ? 'editor-costs-fullbleed' : ''}`}>
            <Routes>
              {adminPermissions?.dashboard !== false && <Route path="/" element={<Dashboard />} />}
              {adminPermissions?.pos_sales !== false && <Route path="/pos" element={<POSManager />} />}
              {adminPermissions?.orders !== false && <Route path="/orders/*" element={<OrdersManager />} />}
              {adminPermissions?.store_editor !== false && <Route path="/store_editor" element={<StoreEditor />} />}
              {adminPermissions?.stock !== false && <Route path="/stock" element={<StockManager />} />}
              {adminPermissions?.settings !== false && <Route path="/settings" element={<AdminSettings />} />}
              {adminPermissions?.costs !== false && <Route path="/costs/*" element={<CostManager />} />}
              {adminPermissions?.costs !== false && <Route path="/products" element={<Navigate to="/editor/costs/products" replace />} />}
              {adminPermissions?.employees !== false && <Route path="/employees" element={<EmployeesManager />} />}
              {adminPermissions?.raffle !== false && <Route path="/raffle" element={<RaffleManager />} />}
              {adminPermissions?.is_rider === true && <Route path="/rider" element={<RiderDashboard />} />}
              {adminPermissions?.is_rider === true && <Route path="/rider-settings" element={<RiderSettings />} />}
              <Route path="*" element={
                 (() => {
                   if (adminPermissions?.dashboard !== false) return <Navigate to="/editor/" replace />;
                   if (adminPermissions?.orders !== false) return <Navigate to="/editor/orders/deliveries" replace />;
                   if (adminPermissions?.pos_sales !== false) return <Navigate to="/editor/pos" replace />;
                   if (adminPermissions?.is_rider === true) return <Navigate to="/editor/rider" replace />;
                   if (adminPermissions?.costs !== false) return <Navigate to="/editor/costs" replace />;
                   if (adminPermissions?.stock !== false) return <Navigate to="/editor/stock" replace />;
                   if (adminPermissions?.store_editor !== false) return <Navigate to="/editor/store_editor" replace />;
                   if (adminPermissions?.employees !== false) return <Navigate to="/editor/employees" replace />;
                   if (adminPermissions?.raffle !== false) return <Navigate to="/editor/raffle" replace />;
                   if (adminPermissions?.settings !== false) return <Navigate to="/editor/settings" replace />;
                   return <div style={{padding: '50px', textAlign: 'center'}}>No tienes permiso para ver ninguna sección.</div>;
                 })()
              } />
            </Routes>
          </main>
        </div>
      )}

    </div>
  );
}