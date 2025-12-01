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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
            Inicio
          </Link>

          <Link to="/carrito" className="nav-link cart-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
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

