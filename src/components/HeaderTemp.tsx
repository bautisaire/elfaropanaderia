import { Link } from "react-router-dom";
import { useContext } from "react";
import { CartContext } from "../context/CartContext";
import "./Header.css";
import logo from "../assets/logo.png";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const { cart } = useContext(CartContext);
  const totalItems = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);

  return (
    <header className="header">
      <div className="logo-container">
        <img src={logo} alt="Logo" className="logo" />
        <h1>El Faro Panaderia</h1>
      </div>
      <nav>
        <Link to="/">Inicio</Link>
        <Link to="/carrito">Carrito {totalItems > 0 && `(${totalItems})`}</Link>
        <Link to="/checkout">Ir a pagar</Link>
        <div>
          {user ? (
            <button onClick={logout}>
              Cerrar sesión ({user.displayName})
            </button>
          ) : (
            <button onClick={() => document.dispatchEvent(new CustomEvent("openLogin"))}>
              Iniciar sesión
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}

