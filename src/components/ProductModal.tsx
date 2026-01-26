import { FaTimes } from 'react-icons/fa';
import ProductCard from './ProductCard';
import { Product } from '../context/CartContext';
import { useEffect } from 'react';

interface ProductModalProps {
    product: Product;
    onClose: () => void;
}

export default function ProductModal({ product, onClose }: ProductModalProps) {
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'auto'; };
    }, []);

    return (
        <div
            className="product-modal-overlay"
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.6)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                backdropFilter: 'blur(3px)'
            }}
        >
            <div
                className="product-modal-content"
                onClick={e => e.stopPropagation()}
                style={{
                    position: 'relative',
                    maxWidth: '400px',
                    width: '100%',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    animation: 'zoomIn 0.2s ease-out'
                }}
            >
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        zIndex: 10,
                        background: 'rgba(0,0,0,0.5)',
                        border: 'none',
                        color: 'white',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                    }}
                >
                    <FaTimes />
                </button>

                <ProductCard product={product} />

                <style>{`
                    @keyframes zoomIn {
                        from { transform: scale(0.95); opacity: 0; }
                        to { transform: scale(1); opacity: 1; }
                    }
                `}</style>
            </div>
        </div>
    );
}
