import { useState, useEffect, useMemo } from 'react';
import { db } from "../firebase/firebaseConfig";
import { collection, onSnapshot } from "firebase/firestore";
import { FaBoxOpen, FaEdit, FaThLarge, FaList } from 'react-icons/fa';
import "./POSManager.css";
import { getVariantPrice } from '../utils/cartStock';
import { normalizeForSearch } from '../utils/textSearch';
import StockAdjustmentModal from './StockAdjustmentModal';
import ProductManager from './ProductManager';

// Vista de stock en tarjetas (la grilla del antiguo POS, sin carrito):
// tocar un producto abre las opciones para editar su stock o el producto.

interface CatalogVariant {
    name: string;
    stockQuantity?: number;
    stock?: boolean;
    image?: string;
    shortId?: string;
    priceOverride?: number;
}

interface CatalogProduct {
    id: string;
    nombre: string;
    shortId?: string;
    precio: number;
    categoria: string;
    img?: string;
    stock: boolean;
    stockQuantity?: number;
    variants?: CatalogVariant[];
    isHiddenInPOS?: boolean;
    discount?: number;
}

type CatalogItem =
    | { type: 'product'; product: CatalogProduct }
    | { type: 'variant'; product: CatalogProduct; variant: CatalogVariant };

const getItemCode = (item: CatalogItem) =>
    (item.type === 'variant' ? item.variant.shortId : item.product.shortId) || "";

const getItemName = (item: CatalogItem) =>
    item.type === 'variant' ? `${item.product.nombre} (${item.variant.name})` : item.product.nombre;

const formatPrice = (value: number) => `$${Math.round(value * 100) / 100}`;

export default function StockCatalog({ searchTerm }: { searchTerm: string }) {
    const [products, setProducts] = useState<CatalogProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
        try {
            return (localStorage.getItem('posViewMode') as "grid" | "list") || "grid";
        } catch {
            return "grid";
        }
    });

    const [editOptions, setEditOptions] = useState<{ product: CatalogProduct, variant?: string } | null>(null);
    const [stockModal, setStockModal] = useState<{ product: CatalogProduct, variant?: string } | null>(null);
    const [editModeProductId, setEditModeProductId] = useState<string | null>(null);

    useEffect(() => {
        try {
            localStorage.setItem('posViewMode', viewMode);
        } catch {
            // Sin acceso a localStorage: la vista vuelve a cuadrícula al recargar.
        }
    }, [viewMode]);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "products"), (snapshot) => {
            setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CatalogProduct)));
            setLoading(false);
        }, (error) => {
            console.error("Error listening to products:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const filteredItems = useMemo(() => {
        const term = normalizeForSearch(searchTerm);
        const items: CatalogItem[] = [];

        products.forEach(product => {
            if (product.isHiddenInPOS) return;

            if (product.variants && product.variants.length > 0) {
                product.variants.forEach(variant => {
                    const item: CatalogItem = { type: 'variant', product, variant };
                    if (normalizeForSearch(getItemName(item)).includes(term) || getItemCode(item) === searchTerm.trim()) {
                        items.push(item);
                    }
                });
            } else {
                const item: CatalogItem = { type: 'product', product };
                if (normalizeForSearch(product.nombre).includes(term) || getItemCode(item) === searchTerm.trim()) {
                    items.push(item);
                }
            }
        });

        // Primero los que tienen código (en orden numérico), después el resto por nombre.
        return items.sort((a, b) => {
            const codeA = getItemCode(a);
            const codeB = getItemCode(b);
            if (codeA && codeB) return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
            if (codeA) return -1;
            if (codeB) return 1;
            return getItemName(a).localeCompare(getItemName(b));
        });
    }, [products, searchTerm]);

    const renderPrice = (product: CatalogProduct, variant?: CatalogVariant) => {
        const basePrice = getVariantPrice(product.precio, variant);
        if ((product.discount || 0) > 0) {
            return (
                <>
                    <span style={{ textDecoration: 'line-through', fontSize: '0.85em', color: '#9ca3af', marginRight: '6px' }}>
                        {formatPrice(basePrice)}
                    </span>
                    <span style={{ color: '#eab308', fontWeight: 'bold' }}>
                        {formatPrice(basePrice * (1 - product.discount! / 100))}
                    </span>
                </>
            );
        }
        return formatPrice(basePrice);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px' }}>
                <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    Tocá un producto para editar su stock o sus datos.
                </span>
                <div style={{ display: 'flex', background: '#e5e7eb', borderRadius: '8px', padding: '4px', flexShrink: 0 }}>
                    {([['grid', <FaThLarge key="g" />, 'Vista Cuadrícula'], ['list', <FaList key="l" />, 'Vista Lista']] as const).map(([mode, icon, title]) => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            title={title}
                            style={{
                                border: 'none', background: viewMode === mode ? 'white' : 'transparent', color: viewMode === mode ? '#3b82f6' : '#6b7280', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                        >
                            {icon}
                        </button>
                    ))}
                </div>
            </div>

            <div className={viewMode === 'list' ? "pos-products-list" : "pos-products-grid"}>
                {viewMode === 'list' && !loading && filteredItems.length > 0 && (
                    <div className="pos-list-header">
                        <div className="header-product">Producto</div>
                        <div className="header-price">Precio</div>
                        <div className="header-stock">Stock</div>
                    </div>
                )}
                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', width: '100%' }}>Cargando productos...</div>
                ) : filteredItems.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', width: '100%', color: '#6b7280' }}>No se encontraron productos.</div>
                ) : filteredItems.map(item => {
                    const { product } = item;
                    const variant = item.type === 'variant' ? item.variant : undefined;
                    const code = getItemCode(item);
                    const stockQty = (variant ? variant.stockQuantity : product.stockQuantity) || 0;

                    return (
                        <div
                            key={`${product.id}-${variant?.name || 'base'}`}
                            className="pos-product-card"
                            onClick={() => setEditOptions({ product, variant: variant?.name })}
                        >
                            <img src={variant?.image || product.img} alt={product.nombre} className="pos-product-img" />
                            {code && (
                                <span style={{
                                    position: 'absolute', top: '5px', left: '5px', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', zIndex: 10, pointerEvents: 'none'
                                }}>
                                    {code}
                                </span>
                            )}
                            <div className="pos-product-info">
                                <div className="pos-product-category" style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{product.categoria}</div>
                                <div className="pos-product-name">{getItemName(item)}</div>
                                <div className="pos-product-price">{renderPrice(product, variant)}</div>
                                <div className={`pos-product-stock ${stockQty < 5 ? "low" : ""}`}>
                                    Stock: {Number(stockQty.toFixed(3))}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {editOptions && (
                <div className="stock-modal-overlay" onClick={() => setEditOptions(null)}>
                    <div className="stock-modal" onClick={e => e.stopPropagation()} style={{ minHeight: 'auto', padding: '25px', textAlign: 'center', maxWidth: '350px' }}>
                        <div style={{ color: '#3b82f6', marginBottom: '15px' }}>
                            <FaEdit size={40} />
                        </div>
                        <h3 style={{ border: 'none', margin: '0 0 10px 0', fontSize: '1.4rem' }}>Editar Elemento</h3>
                        <p style={{ color: '#6b7280', marginBottom: '25px', fontWeight: '500' }}>
                            {editOptions.product.nombre}
                            {editOptions.variant ? ` (${editOptions.variant})` : ''}
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <button
                                className="action-btn add"
                                style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe', padding: '14px', justifyContent: 'center', fontSize: '1.05rem' }}
                                onClick={() => {
                                    setStockModal(editOptions);
                                    setEditOptions(null);
                                }}
                            >
                                <FaBoxOpen style={{ marginRight: '8px' }} /> Editar Stock
                            </button>
                            <button
                                className="action-btn add"
                                style={{ background: '#f5f3ff', color: '#6d28d9', borderColor: '#ddd6fe', padding: '14px', justifyContent: 'center', fontSize: '1.05rem' }}
                                onClick={() => {
                                    setEditModeProductId(editOptions.product.id);
                                    setEditOptions(null);
                                }}
                            >
                                <FaEdit style={{ marginRight: '8px' }} /> Editar Producto
                            </button>
                            <button
                                className="btn-cancel"
                                style={{ padding: '12px', marginTop: '10px', fontSize: '1rem' }}
                                onClick={() => setEditOptions(null)}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editModeProductId && (
                <ProductManager
                    editModeProductId={editModeProductId}
                    onCloseEditMode={() => setEditModeProductId(null)}
                />
            )}

            {stockModal && (
                <StockAdjustmentModal
                    isOpen
                    onClose={() => setStockModal(null)}
                    product={stockModal.product}
                    initialVariantName={stockModal.variant}
                    onSuccess={() => setStockModal(null)}
                />
            )}
        </div>
    );
}
