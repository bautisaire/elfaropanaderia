import { useEffect, useState, useRef, type ReactNode } from "react";
import "./Editor.css";
import { auth, googleProvider, db } from "../firebase/firebaseConfig";
import { collection, query, onSnapshot, doc } from "firebase/firestore";
import { signInWithRedirect, signOut, onAuthStateChanged, User } from "firebase/auth";
import { useNavigate, useLocation, Routes, Route, Navigate } from "react-router-dom";
import { FaHome, FaSignOutAlt, FaStore, FaClipboardCheck, FaChartPie, FaBars, FaTimes, FaChevronLeft, FaChevronRight, FaClipboardList, FaCog, FaUserFriends, FaMotorcycle, FaHeadset, FaFileInvoiceDollar, FaMoneyBillWave, FaBreadSlice, FaCalculator } from "react-icons/fa";
import OrdersManager from "../components/OrdersManager";
import StockManager from "../components/StockManager";
import Dashboard from "../components/Dashboard";
import StoreEditor from "../components/StoreEditor";
import CajaManager from "../components/CajaManager";
import AdminSettings from "../components/AdminSettings";
import CostManager from "../components/CostManager";
import ProductsSection from "../components/ProductsSection";
import BillsManager from "../components/BillsManager";
import EmployeesManager from "../components/EmployeesManager";
import RiderDashboard from "../components/RiderDashboard";
import RiderSettings from "../components/RiderSettings";
import { useCart } from "../context/CartContext";

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  color: string;
  path: string;
  visible: boolean;
  active: boolean;
  badge?: number;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

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
          setCheckingAuth(false);
        } else {
          roleUnsub = onSnapshot(doc(db, "admin_roles", user.email.toLowerCase()), (roleDoc) => {
            if (roleDoc.exists()) {
              setCurrentUser(user);
            } else {
              signOut(auth);
              setCurrentUser(null);
              alert("⛔ Acceso denegado: Este email no tiene permisos de administrador.");
            }
            setCheckingAuth(false);
          }, (e) => {
            console.error(e);
            setCurrentUser(null);
            setCheckingAuth(false);
          });
        }
      } else {
        // No user, or anonymous user (no email)
        if (user && !user.email) {
          // You might want to let them stay anonymous for the store, but they aren't admin.
          // Don't sign them out to not break their cart, but don't set them as admin.
          setCurrentUser(null);
        } else {
          setCurrentUser(null);
        }
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
      // Using signInWithRedirect to bypass Cross-Origin-Opener-Policy (COOP) blocks
      await signInWithRedirect(auth, googleProvider);
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

  const navGroups: NavGroup[] = [
    {
      items: [
        { key: "dashboard", label: "Resumen", icon: <FaChartPie />, color: '#3b82f6', path: "/editor/", visible: adminPermissions?.dashboard !== false, active: currentPath === "dashboard" || currentPath === "" },
      ]
    },
    {
      label: "Día a día",
      items: [
        { key: "stock", label: "Stock", icon: <FaClipboardCheck />, color: '#eab308', path: "/editor/stock", visible: adminPermissions?.stock !== false, active: currentPath === "stock" },
        { key: "orders", label: "Pedidos", icon: <FaClipboardList />, color: '#a855f7', path: "/editor/orders/pos", visible: adminPermissions?.orders !== false, active: currentPath === "orders", badge: pendingOrdersCount },
        { key: "caja", label: "Caja", icon: <FaMoneyBillWave />, color: '#8b5cf6', path: "/editor/caja", visible: adminPermissions?.pos_sales !== false, active: currentPath === "caja" },
      ]
    },
    {
      label: "Producción",
      items: [
        { key: "products", label: "Productos", icon: <FaBreadSlice />, color: '#f97316', path: "/editor/products", visible: adminPermissions?.costs !== false, active: currentPath === "products" },
        { key: "costs", label: "Costos y Recetas", icon: <FaCalculator />, color: '#fb923c', path: "/editor/costs/recipes", visible: adminPermissions?.costs !== false, active: currentPath === "costs" },
      ]
    },
    {
      label: "Finanzas",
      items: [
        { key: "bills", label: "Gastos", icon: <FaFileInvoiceDollar />, color: '#dc2626', path: "/editor/bills/gastos", visible: adminPermissions?.bills === true, active: currentPath === "bills" },
        { key: "employees", label: "Personal", icon: <FaUserFriends />, color: '#0ea5e9', path: "/editor/employees", visible: adminPermissions?.employees !== false, active: currentPath === "employees" },
      ]
    },
    {
      label: "Tienda online",
      items: [
        { key: "store_editor", label: "Tienda", icon: <FaStore />, color: '#ec4899', path: "/editor/store_editor", visible: adminPermissions?.store_editor !== false, active: currentPath === "store_editor" },
      ]
    },
  ];

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
              {navGroups.map((group, groupIdx) => {
                const visibleItems = group.items.filter(item => item.visible);
                if (visibleItems.length === 0) return null;
                return (
                  <div key={group.label || groupIdx} className="nav-group">
                    {group.label && <div className="nav-group-label">{group.label}</div>}
                    {visibleItems.map(item => (
                      <button
                        key={item.key}
                        className={item.active ? "active" : ""}
                        onClick={() => handleNavClick(item.path)}
                        title={item.label}
                      >
                        <div className="nav-icon" style={{ color: item.color }}>{item.icon}</div>
                        <span className="nav-text">{item.label}</span>
                        {!!item.badge && (
                          <span className={`sidebar-badge ${collapsed ? 'badge-mini' : ''}`}>{item.badge}</span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}

              {adminPermissions?.is_rider === true && (
                <div className="nav-group">
                  <div className="nav-group-label">Reparto</div>
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
                    style={{ textDecoration: 'none' }}
                  >
                    <button title="Soporte Técnico" style={{ width: '100%' }}>
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
                </div>
              )}

              <div className="sidebar-footer">
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

          <main className={`editor-content ${collapsed ? 'collapsed-mode' : ''} ${currentPath === 'caja' ? 'pos-active-tab' : ''} ${currentPath === 'orders' || currentPath === 'bills' ? 'editor-orders-fullbleed' : ''} ${currentPath === 'costs' || currentPath === 'products' ? 'editor-costs-fullbleed' : ''}`}>
            <Routes>
              {adminPermissions?.dashboard !== false && <Route path="/" element={<Dashboard />} />}
              {/* El POS de venta se reemplazó por Stock → Productos (Caja es donde se vende) */}
              <Route path="/pos" element={<Navigate to="/editor/stock" replace />} />
              {adminPermissions?.pos_sales !== false && <Route path="/caja" element={<CajaManager />} />}
              {adminPermissions?.orders !== false && <Route path="/orders/*" element={<OrdersManager />} />}
              {adminPermissions?.store_editor !== false && <Route path="/store_editor" element={<StoreEditor />} />}
              {adminPermissions?.stock !== false && <Route path="/stock" element={<StockManager />} />}
              {adminPermissions?.settings !== false && <Route path="/settings" element={<AdminSettings />} />}
              {adminPermissions?.costs !== false && <Route path="/costs/*" element={<CostManager />} />}
              {adminPermissions?.costs !== false && <Route path="/products/*" element={<ProductsSection />} />}
              {adminPermissions?.bills === true && <Route path="/bills/*" element={<BillsManager />} />}
              {adminPermissions?.employees !== false && <Route path="/employees" element={<EmployeesManager />} />}
              {adminPermissions?.is_rider === true && <Route path="/rider" element={<RiderDashboard />} />}
              {adminPermissions?.is_rider === true && <Route path="/rider-settings" element={<RiderSettings />} />}
              <Route path="*" element={
                (() => {
                  if (adminPermissions?.dashboard !== false) return <Navigate to="/editor/" replace />;
                  if (adminPermissions?.orders !== false) return <Navigate to="/editor/orders/deliveries" replace />;
                  if (adminPermissions?.pos_sales !== false) return <Navigate to="/editor/caja" replace />;
                  if (adminPermissions?.is_rider === true) return <Navigate to="/editor/rider" replace />;
                  if (adminPermissions?.costs !== false) return <Navigate to="/editor/costs" replace />;
                  if (adminPermissions?.stock !== false) return <Navigate to="/editor/stock" replace />;
                  if (adminPermissions?.store_editor !== false) return <Navigate to="/editor/store_editor" replace />;
                  if (adminPermissions?.employees !== false) return <Navigate to="/editor/employees" replace />;
                  if (adminPermissions?.bills === true) return <Navigate to="/editor/bills/gastos" replace />;
                  if (adminPermissions?.settings !== false) return <Navigate to="/editor/settings" replace />;
                  return <div style={{ padding: '50px', textAlign: 'center' }}>No tienes permiso para ver ninguna sección.</div>;
                })()
              } />
            </Routes>
          </main>
        </div>
      )}

    </div>
  );
}