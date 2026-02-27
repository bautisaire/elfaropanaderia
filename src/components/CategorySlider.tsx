import { useState } from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import ProductCard from "./ProductCard";
import { Product } from "../context/CartContext";
import "../pages/Home.css"; // Reuse existing styles

interface CategorySliderProps {
    category: string;
    products: Product[];
}

export default function CategorySlider({ category, products }: CategorySliderProps) {
    // Función auxiliar para determinar si un producto no tiene stock
    const isOutOfStock = (p: Product) => {
        if (p.variants && p.variants.length > 0) {
            return p.variants.every(v => !v.stock);
        }
        return p.stockQuantity !== undefined ? p.stockQuantity <= 0 : p.stock === false;
    };

    // Particionar productos
    const outOfStockProducts = products.filter(isOutOfStock);
    const inStockProducts = products.filter(p => !isOutOfStock(p));

    // Verificamos si todos los productos están sin stock en esta categoría
    const allOutOfStock = products.length > 0 && inStockProducts.length === 0;

    const [isExpanded, setIsExpanded] = useState(!allOutOfStock);
    const [showOutOfStock, setShowOutOfStock] = useState(false);

    return (
        <div className="category-section" id={category.replace(/\s+/g, '-')}>
            <h2
                className="category-title"
                onClick={() => allOutOfStock && setIsExpanded(!isExpanded)}
                style={{
                    cursor: allOutOfStock ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    opacity: allOutOfStock ? 0.7 : 1,
                    transition: 'opacity 0.2s',
                    paddingRight: '16px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {category}
                </div>
                {allOutOfStock && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888' }}>
                        <span style={{ fontSize: '1rem', fontWeight: '500' }}>(Sin Stock)</span>
                        <span style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center' }}>
                            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                        </span>
                    </div>
                )}
            </h2>

            {isExpanded && (
                <>
                    {/* Productos CON stock */}
                    {inStockProducts.length > 0 && (
                        <div className="products-slider">
                            {inStockProducts.map((p) => (
                                <ProductCard key={p.id} product={p} />
                            ))}
                        </div>
                    )}

                    {/* Botón y contenedor para productos SIN stock (cuando hay productos con stock) */}
                    {!allOutOfStock && outOfStockProducts.length > 0 && (
                        <div className="out-of-stock-section">
                            <button
                                onClick={() => setShowOutOfStock(!showOutOfStock)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: 'none',
                                    border: 'none',
                                    color: '#888',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    width: '100%',
                                    justifyContent: 'center',
                                    marginBottom: showOutOfStock ? '0' : '10px'
                                }}
                            >
                                {showOutOfStock ? 'Ocultar productos agotados' : `Ver productos agotados (${outOfStockProducts.length})`}
                                {showOutOfStock ? <FaChevronUp /> : <FaChevronDown />}
                            </button>

                            {showOutOfStock && (
                                <div className="products-slider" style={{ opacity: 0.75 }}>
                                    {outOfStockProducts.map((p) => (
                                        <ProductCard key={p.id} product={p} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Si TODA la categoría está sin stock, los mostramos directamente (ya que el título sirve de toggle) */}
                    {allOutOfStock && (
                        <div className="products-slider" style={{ opacity: 0.75 }}>
                            {outOfStockProducts.map((p) => (
                                <ProductCard key={p.id} product={p} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
