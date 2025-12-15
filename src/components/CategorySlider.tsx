import { useRef } from "react";
import ProductCard from "./ProductCard";
import { Product } from "../context/CartContext";
import "../pages/Home.css"; // Reuse existing styles

interface CategorySliderProps {
    category: string;
    products: Product[];
}

export default function CategorySlider({ category, products }: CategorySliderProps) {
    const sliderRef = useRef<HTMLDivElement>(null);

    return (
        <div className="category-section" id={category.replace(/\s+/g, '-')}>
            <h2 className="category-title">{category}</h2>
            <div
                className="products-slider"
                ref={sliderRef}
            >
                {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                ))}
            </div>
        </div>
    );
}
