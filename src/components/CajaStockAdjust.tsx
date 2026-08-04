import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';
import { FaArrowLeft, FaSearch, FaBoxOpen } from 'react-icons/fa';
import StockAdjustmentModal from './StockAdjustmentModal';
import './CajaVenta.css';

interface Product {
    id: string;
    nombre: string;
    shortId?: string;
    stockQuantity?: number;
    categoria: string;
    variants?: {
        name: string;
        stockQuantity?: number;
        shortId?: string;
    }[];
    unitType?: 'unit' | 'weight';
    stockDependency?: { productId: string; unitsToDeduct?: number };
    [key: string]: any;
}

interface CajaStockAdjustProps {
    onBack: () => void;
}

export default function CajaStockAdjust({ onBack }: CajaStockAdjustProps) {
    const [products, setProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [codeBuffer, setCodeBuffer] = useState('');
    const [showBuffer, setShowBuffer] = useState(false);
    const bufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined);
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'products'), (snap) => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
        });
        return () => unsub();
    }, []);

    const findByCode = (code: string): { product: Product; variant?: string } | null => {
        for (const p of products) {
            if (p.variants) {
                const v = p.variants.find(v => v.shortId === code);
                if (v) return { product: p, variant: v.name };
            }
            if (p.shortId === code) return { product: p };
        }
        return null;
    };

    const openStockModal = (product: Product, variant?: string) => {
        setSelectedProduct(product);
        setSelectedVariant(variant);
        setIsStockModalOpen(true);
    };

    // Numeric buffer for barcode-style code entry, same behavior as the sale screen's add-product picker.
    useEffect(() => {
        if (isStockModalOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const isSearchFocused = document.activeElement === searchInputRef.current;
            if (isSearchFocused) return;

            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                setCodeBuffer(prev => prev + e.key);
                setShowBuffer(true);
                if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
                bufferTimeoutRef.current = setTimeout(() => setShowBuffer(false), 3000);
                return;
            }

            if (e.key === 'Backspace' && codeBuffer.length > 0) {
                e.preventDefault();
                setCodeBuffer(prev => prev.slice(0, -1));
                return;
            }

            if (e.key === 'Enter' && codeBuffer.length > 0) {
                e.preventDefault();
                const found = findByCode(codeBuffer);
                setCodeBuffer('');
                setShowBuffer(false);
                if (found) openStockModal(found.product, found.variant);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [codeBuffer, isStockModalOpen, products]);

    const filteredResults = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const items: { product: Product; variant?: string; label: string; code?: string; stock: number }[] = [];

        products.forEach(p => {
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    const label = `${p.nombre} (${v.name})`;
                    const code = v.shortId || '';
                    const matches = !term || label.toLowerCase().includes(term) || code.toLowerCase().includes(term);
                    if (matches) {
                        items.push({ product: p, variant: v.name, label, code: v.shortId, stock: v.stockQuantity || 0 });
                    }
                });
            } else {
                const code = p.shortId || '';
                const matches = !term || p.nombre.toLowerCase().includes(term) || code.toLowerCase().includes(term);
                if (matches) {
                    items.push({ product: p, label: p.nombre, code: p.shortId, stock: p.stockQuantity || 0 });
                }
            }
        });

        items.sort((a, b) => {
            const codeA = a.code || '';
            const codeB = b.code || '';
            if (codeA && codeB) {
                const numA = parseInt(codeA);
                const numB = parseInt(codeB);
                if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
                return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
            }
            if (codeA) return -1;
            if (codeB) return 1;
            return a.label.localeCompare(b.label);
        });

        return items;
    }, [searchTerm, products]);

    return (
        <div className="caja-venta-container">
            <div className="caja-venta-header">
                <button className="caja-venta-back-btn" onClick={onBack}>
                    <FaArrowLeft /> Volver
                </button>
                <h2><FaBoxOpen /> Ajustar Stock</h2>
            </div>

            <div className="caja-venta-add-modal caja-stock-adjust-panel">
                <div className="caja-venta-search-box">
                    <FaSearch className="caja-venta-search-icon" />
                    <input
                        ref={searchInputRef}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar producto por nombre... (o escaneá/ingresá un código sin hacer clic acá)"
                        autoFocus
                    />
                </div>
                <div className="caja-venta-search-results">
                    {filteredResults.length === 0 ? (
                        <p className="caja-venta-search-hint">No se encontraron productos.</p>
                    ) : (
                        filteredResults.map((item, idx) => (
                            <div
                                key={`${item.product.id}-${item.variant || 'base'}-${idx}`}
                                className="caja-venta-search-result stock-mode"
                                onClick={() => openStockModal(item.product, item.variant)}
                            >
                                <span className="caja-venta-search-result-code">{item.code || '—'}</span>
                                <span className="caja-venta-search-result-name">{item.label}</span>
                                <span className={`caja-venta-search-result-stock ${item.stock <= 0 ? 'out' : item.stock < 5 ? 'low' : ''}`}>
                                    Stock: {Number(item.stock.toFixed(3))}{item.product.unitType === 'weight' ? 'kg' : ''}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {showBuffer && (
                <div className="caja-venta-code-buffer">
                    <span className="caja-venta-code-buffer-label">Código</span>
                    <span>{codeBuffer}</span>
                </div>
            )}

            <StockAdjustmentModal
                isOpen={isStockModalOpen}
                onClose={() => {
                    setIsStockModalOpen(false);
                    setSelectedProduct(null);
                    setSelectedVariant(undefined);
                }}
                product={selectedProduct}
                initialVariantName={selectedVariant}
                onSuccess={() => {
                    setIsStockModalOpen(false);
                    setSelectedProduct(null);
                    setSelectedVariant(undefined);
                    setSearchTerm('');
                }}
            />
        </div>
    );
}
