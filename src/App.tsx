import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Carrito from "./pages/Carrito";
import Checkout from "./pages/Checkout";
import Header from "./components/HeaderTemp";
import Footer from "./components/Footer";
import Editor from "./pages/Editor";
import Proximamente from "./pages/Proximamente";

export default function App() {
  return (
    <Router>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header />
        <div style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/carrito" element={<Carrito />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/Proximamente" element={<Proximamente />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </Router>
  );
}