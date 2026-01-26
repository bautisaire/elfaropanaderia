import { useState, useEffect, useRef } from 'react';
import { Product } from '../context/CartContext';
import { FaSearch, FaTimes } from 'react-icons/fa';

interface SearchBarProps {
    products: Product[];
    onProductSelect: (product: Product) => void;
}

export default function SearchBar({ products, onProductSelect }: SearchBarProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredProducts([]);
            setIsOpen(false);
            return;
        }

        const lowerTerm = searchTerm.toLowerCase();
        const results = products.filter(p =>
            p.name.toLowerCase().includes(lowerTerm) && p.isVisible !== false
        ).slice(0, 5); // Limit to 5 results for cleaner UI

        setFilteredProducts(results);
        setIsOpen(true);
    }, [searchTerm, products]);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="search-bar-wrapper" ref={wrapperRef} style={{
            padding: '10px 15px',
            position: 'relative',
            zIndex: 100
        }}>
            <div className="search-input-container" style={{
                position: 'relative',
                maxWidth: '600px',
                margin: '0 auto'
            }}>
                <FaSearch style={{
                    position: 'absolute',
                    left: '15px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af'
                }} />

                <input
                    type="text"
                    placeholder="¿Qué estás buscando hoy?"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => { if (searchTerm) setIsOpen(true); }}
                    style={{
                        width: '100%',
                        padding: '12px 12px 12px 40px',
                        borderRadius: '25px',
                        border: '1px solid #e5e7eb',
                        fontSize: '1rem',
                        outline: 'none',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                        transition: 'box-shadow 0.2s'
                    }}
                />

                {searchTerm && (
                    <button
                        onClick={() => { setSearchTerm(''); setFilteredProducts([]); }}
                        style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: '#9ca3af',
                            cursor: 'pointer'
                        }}
                    >
                        <FaTimes />
                    </button>
                )}

                {isOpen && filteredProducts.length > 0 && (
                    <div className="search-results" style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '8px',
                        background: 'white',
                        borderRadius: '12px',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                        overflow: 'hidden',
                        padding: '5px'
                    }}>
                        {filteredProducts.map(product => (
                            <div
                                key={product.id}
                                onClick={() => {
                                    onProductSelect(product);
                                    setIsOpen(false);
                                    setSearchTerm('');
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '10px',
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <img
                                    src={product.image}
                                    alt={product.name}
                                    style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '500', fontSize: '0.95rem' }}>{product.name}</div>
                                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                                        ${product.price}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
