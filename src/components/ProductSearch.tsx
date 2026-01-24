import { forwardRef } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';
import './ProductSearch.css';

interface ProductSearchProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

const ProductSearch = forwardRef<HTMLInputElement, ProductSearchProps>(({ value, onChange, placeholder = "Buscar productos...", className = "" }, ref) => {
    return (
        <div className={`product-search-container ${className}`}>
            <FaSearch className="product-search-icon" />
            <input
                ref={ref}
                type="text"
                className="product-search-input"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            {value && (
                <button
                    className="product-search-clear"
                    onClick={() => onChange("")}
                    aria-label="Limpiar búsqueda"
                >
                    <FaTimes />
                </button>
            )}
        </div>
    );
});

export default ProductSearch;
