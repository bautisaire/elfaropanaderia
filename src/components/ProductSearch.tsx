
import { FaSearch, FaTimes } from 'react-icons/fa';
import './ProductSearch.css';

interface ProductSearchProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export default function ProductSearch({ value, onChange, placeholder = "Buscar productos...", className = "" }: ProductSearchProps) {
    return (
        <div className={`product-search-container ${className}`}>
            <FaSearch className="product-search-icon" />
            <input
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
}
