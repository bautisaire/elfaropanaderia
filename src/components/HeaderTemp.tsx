import { Link, useNavigate } from "react-router-dom";
import { useContext, useState, useEffect } from "react";
import { CartContext } from "../context/CartContext";
import "./Header.css";
import logo from "../assets/logo.png";


export default function Header() {
  const navigate = useNavigate();

  const { cart } = useContext(CartContext);
  const totalItems = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogoClick = () => {
    navigate("/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className={`header-container ${isScrolled ? "scrolled" : ""}`}>
      <div className="header-content">
        {/* Logo Area */}
        <div className="logo-section" onClick={handleLogoClick}>
          <img src={logo} alt="El Faro Panadería" className="logo-img" />
          <span className="brand-name">EL FARO PANADERIA</span>
        </div>

        {/* Navigation */}
        <nav className="nav-menu">
          <Link to="/" className="nav-link">
            Inicio
          </Link>

          <Link to="/carrito" className="nav-link cart-link">
            Carrito
            {totalItems > 0 && (
              <span className="cart-badge">{totalItems}</span>
            )}
          </Link>


        </nav>
      </div>
    </header>
  );
}

