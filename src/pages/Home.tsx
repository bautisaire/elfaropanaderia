import ProductCard from "../components/ProductCard";
import BottomCartModal from "../components/BottomCartModal";
import "./Home.css";

// Importar las imágenes
import logo from "../assets/logo.png";
import frola from "../assets/frola.jpg";
import frola2 from "../assets/frola2.jpg";
import frola3 from "../assets/frola3.jpg";
import matera from "../assets/matera.jpg";
import matera2 from "../assets/matera2.jpg";
import matera3 from "../assets/matera3.jpg";
import matera4 from "../assets/matera4.jpg";
import alfajoresSantafesinos1 from "../assets/alfajoressantafesinos.jpg";
import alfajoresSantafesinos2 from "../assets/alfajoresSantafesinos2.jpg";
import alfajoresSantafesinos3 from "../assets/alfajoresSantafesinos3.jpg";

const products = [
  { 
    id: 1, 
    name: "Pastafrola", 
    price: 7000, 
    image: logo,
    images: [frola, frola2, frola3]
  },
  { 
    id: 2, 
    name: "Matera", 
    price: 5000, 
    image: logo,
    images: [matera, matera2, matera3, matera4]
  },
  { 
    id: 3, 
    name: "Alfajores Santafesinos x6", 
    price: 7500, 
    image: logo,
    images: [alfajoresSantafesinos1, alfajoresSantafesinos2, alfajoresSantafesinos3] 
  },
];

export default function Home() {
  return (
    <div>
      <div className="home">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      <BottomCartModal />
    </div>
  );
}