import { Link } from "react-router-dom";
import { useContext, useState, useEffect, useRef } from "react";
import { CartContext } from "../context/CartContext";
import "./Header.css";
import logo from "../assets/logo.png";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const { cart } = useContext(CartContext);
  const totalItems = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);

  const [activeLetterIndex, setActiveLetterIndex] = useState(0);
  const [randomColors, setRandomColors] = useState<string[]>([]);
  const onlineText = "ONLINE";

  const [showCompact, setShowCompact] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  // Generar colores aleatorios al montar el componente
  useEffect(() => {
    const colors = onlineText.split("").map(() => {
      const hue = Math.floor(Math.random() * 360);
      return `hsl(${hue}, 100%, 45%)`;
    });
    setRandomColors(colors);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveLetterIndex((prev) => (prev + 1) % onlineText.length);
    }, 100); // Cambio cada 100ms

    return () => clearInterval(interval);
  }, [onlineText.length]);

  // Observador para mostrar header compacto cuando el header principal ya no está visible
  useEffect(() => {
    if (!headerRef.current) return;
    const node = headerRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowCompact(!entry.isIntersecting);
      },
      { threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Header compacto fijo que aparece cuando el header principal sale de la vista */}
      {showCompact && (
        <div className="compact-header" role="banner" aria-hidden={!showCompact}>
          <nav className="compact-nav">
            <Link to="/" className="compact-link">Inicio</Link>
            <Link to="/carrito" className="compact-link">
              Carrito {totalItems > 0 && <span className="compact-badge">({totalItems})</span>}
            </Link>
          </nav>
        </div>
      )}

      {/* Header principal observado */}
      <header className="header" ref={headerRef}>
        <div className="logo-container">
          <img src={logo} alt="Logo" className="logo" />
          <div>
            <h1>
              EL FARO PANADERIA{" "}
              <span style={{ fontSize: "24px", fontWeight: "600", letterSpacing: "1px" }}>
                {onlineText.split("").map((letter, index) => (
                  <span
                    key={index}
                    style={{
                      color: index === activeLetterIndex ? randomColors[index] : "#b35600",
                      transition: "color 200ms ease",
                      fontWeight: index === activeLetterIndex ? "700" : "600",
                    }}
                  >
                    {letter}
                  </span>
                ))}
              </span>
            </h1>
          </div>
        </div>
        <nav>
          <Link to="/">Inicio </Link>
          <Link to="/carrito">
            Carrito 
            {totalItems > 0 && <span className="badge">({totalItems})</span>}
          </Link>
          <div>
            {user ? (
              <button hidden onClick={logout}>
                Cerrar sesión ({user.displayName})
              </button>
            ) : (
              <button hidden onClick={() => document.dispatchEvent(new CustomEvent("openLogin"))}>
                Iniciar sesión
              </button>
            )}
          </div>
        </nav>
      </header>
    </>
  );
}

