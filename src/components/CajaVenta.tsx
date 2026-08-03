import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, runTransaction, onSnapshot } from 'firebase/firestore';
import { FaArrowLeft, FaPlus, FaTrash, FaTimes, FaSearch, FaMoneyBillWave, FaCreditCard, FaExchangeAlt, FaEdit, FaBoxOpen } from 'react-icons/fa';
import { syncChildProducts } from '../utils/stockUtils';
import { shouldMarkOrderAsTest } from '../utils/testMode';
import { useCart } from '../context/CartContext';
import POSModal from './POSModal';
import WeightEntryModal from './WeightEntryModal';
import StockAdjustmentModal from './StockAdjustmentModal';
import './CajaVenta.css';

interface Product {
    id: string;
    nombre: string;
    shortId?: string;
    precio: number;
    categoria: string;
    stockQuantity?: number;
    variants?: {
        name: string;
        stockQuantity?: number;
        shortId?: string;
    }[];
    unitType?: 'unit' | 'weight';
    stockDependency?: { productId: string; unitsToDeduct?: number };
    isHiddenInPOS?: boolean;
    discount?: number;
}

interface CartRow {
    key: string;
    productId: string;
    variant?: string;
    nombre: string;
    quantity: number;
    unitType?: 'unit' | 'weight';
    precioUnitario: number;
}

interface CajaVentaProps {
    onBack: () => void;
    onSaleComplete: (data: { amount: number; paymentMethod: string; orderId: string }) => void;
}

type PaymentMethod = 'Efectivo' | 'Débito' | 'Transferencia';

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function CajaVenta({ onBack, onSaleComplete }: CajaVentaProps) {
    const { user, isSuperAdmin, adminPermissions } = useCart();
    const canEditPrices = isSuperAdmin || adminPermissions?.orders_can_edit_prices === true;

    const [products, setProducts] = useState<Product[]>([]);
    const [cart, setCart] = useState<CartRow[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo');
    const [processing, setProcessing] = useState(false);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [addModalError, setAddModalError] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [codeBuffer, setCodeBuffer] = useState('');
    const [showBuffer, setShowBuffer] = useState(false);
    const bufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [pendingProduct, setPendingProduct] = useState<{ product: Product; variant?: string } | null>(null);
    const [quantityModalOpen, setQuantityModalOpen] = useState(false);
    const [quantityInput, setQuantityInput] = useState('');
    const [quantityError, setQuantityError] = useState('');
    const quantityInputRef = useRef<HTMLInputElement>(null);

    const [weightModalOpen, setWeightModalOpen] = useState(false);

    // Edit an existing row's quantity / unit price / total price
    const [editRowKey, setEditRowKey] = useState<string | null>(null);
    const [editQuantityInput, setEditQuantityInput] = useState('');
    const [editUnitInput, setEditUnitInput] = useState('');
    const [editTotalInput, setEditTotalInput] = useState('');
    const [editError, setEditError] = useState('');

    // Stock Insuficiente -> Corregir/Agregar Stock -> retry adding to cart
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [stockModalProduct, setStockModalProduct] = useState<Product | null>(null);
    const [stockModalVariant, setStockModalVariant] = useState<string | undefined>(undefined);
    const [stockModalInitialValue, setStockModalInitialValue] = useState<number | undefined>(undefined);
    const [pendingRetry, setPendingRetry] = useState<{ productId: string; variant?: string; quantity: number } | null>(null);

    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: 'success' | 'error'; title: string; message?: string; content?: React.ReactNode; onConfirm?: () => void }>({
        isOpen: false,
        type: 'success',
        title: ''
    });

    useEffect(() => {
        if (!modalConfig.isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setModalConfig(prev => ({ ...prev, isOpen: false }));
                return;
            }
            if (e.key === 'Enter') {
                if (modalConfig.type === 'success') {
                    setModalConfig(prev => ({ ...prev, isOpen: false }));
                    return;
                }
                if (modalConfig.onConfirm) {
                    e.preventDefault();
                    modalConfig.onConfirm();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [modalConfig]);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'products'), (snap) => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (quantityModalOpen && quantityInputRef.current) quantityInputRef.current.focus();
    }, [quantityModalOpen]);

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

    const openEntryModal = (product: Product, variant?: string) => {
        setPendingProduct({ product, variant });
        setQuantityError('');
        if (product.unitType === 'weight') {
            setWeightModalOpen(true);
        } else {
            setQuantityInput('');
            setQuantityModalOpen(true);
        }
    };

    // Numeric buffer for barcode-style code entry: only while the add-product menu is open
    // and the user hasn't focused the search box (matches a barcode scanner typing digits + Enter).
    useEffect(() => {
        if (!isAddModalOpen || quantityModalOpen || weightModalOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (codeBuffer.length > 0) {
                    setCodeBuffer('');
                    setShowBuffer(false);
                } else {
                    setIsAddModalOpen(false);
                }
                return;
            }

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
                if (found) {
                    setAddModalError('');
                    openEntryModal(found.product, found.variant);
                } else {
                    setAddModalError(`No existe producto con código "${codeBuffer}"`);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddModalOpen, codeBuffer, quantityModalOpen, weightModalOpen, products]);

    const getEffectivePrice = (product: Product) => {
        return (product.discount || 0) > 0 ? product.precio * (1 - product.discount! / 100) : product.precio;
    };

    const getMaxStock = (product: Product, variant?: string) => {
        if (variant && product.variants) {
            const v = product.variants.find(v => v.name === variant);
            return v?.stockQuantity || 0;
        }
        return product.stockQuantity || 0;
    };

    const getQuantityAlreadyInCart = (productId: string, variant?: string) => {
        const row = cart.find(r => r.productId === productId && r.variant === variant);
        return row?.quantity || 0;
    };

    const addRowToCart = (product: Product, variant: string | undefined, qty: number) => {
        const precioUnitario = getEffectivePrice(product);
        const key = `${product.id}-${variant || 'base'}`;

        setCart(prev => {
            const existing = prev.find(r => r.key === key);
            if (existing) {
                return prev.map(r => r.key === key ? { ...r, quantity: r.quantity + qty } : r);
            }
            return [...prev, {
                key,
                productId: product.id,
                variant,
                nombre: product.nombre,
                quantity: qty,
                unitType: product.unitType,
                precioUnitario
            }];
        });
    };

    const handleStockError = (product: Product, variant: string | undefined, message: string, missingAmount: number, qty: number) => {
        const handleFix = () => {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            setStockModalProduct(product);
            setStockModalVariant(variant);
            setStockModalInitialValue(missingAmount);
            setPendingRetry({ productId: product.id, variant, quantity: qty });
            setIsStockModalOpen(true);
        };

        setModalConfig({
            isOpen: true,
            type: 'error',
            title: 'Stock Insuficiente',
            onConfirm: handleFix,
            content: (
                <div style={{ textAlign: 'center' }}>
                    <p style={{ marginBottom: '15px' }}>{message}</p>
                    <button
                        onClick={handleFix}
                        style={{ background: '#f59e0b', width: '100%', padding: '10px', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                        <FaBoxOpen /> Corregir / Agregar Stock
                    </button>
                </div>
            )
        });
    };

    const confirmQuantity = () => {
        if (!pendingProduct) return;
        const qty = parseInt(quantityInput, 10);
        if (isNaN(qty) || qty <= 0) {
            setQuantityError('Ingresá una cantidad válida.');
            return;
        }

        const { product, variant } = pendingProduct;
        const freshProduct = products.find(p => p.id === product.id) || product;
        const maxStock = getMaxStock(freshProduct, variant);
        const already = getQuantityAlreadyInCart(freshProduct.id, variant);

        if (already + qty > maxStock) {
            const deficit = (already + qty) - maxStock;
            setQuantityModalOpen(false);
            setPendingProduct(null);
            handleStockError(freshProduct, variant, `No hay suficiente stock. Solicitado: ${already + qty}, Disponible: ${maxStock}.`, deficit, qty);
            return;
        }

        addRowToCart(freshProduct, variant, qty);
        setQuantityModalOpen(false);
        setPendingProduct(null);
        setQuantityInput('');
        setSearchTerm('');
        if (isAddModalOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
    };

    const confirmWeight = (qty: number) => {
        if (!pendingProduct) return;
        const { product, variant } = pendingProduct;
        const freshProduct = products.find(p => p.id === product.id) || product;
        const maxStock = getMaxStock(freshProduct, variant);
        const already = getQuantityAlreadyInCart(freshProduct.id, variant);

        setWeightModalOpen(false);
        setPendingProduct(null);

        if (already + qty > maxStock) {
            const deficit = (already + qty) - maxStock + 0.005;
            handleStockError(freshProduct, variant, `Solo hay ${maxStock}kg disponibles (ya en lista: ${already}kg, intentaste llevar ${(already + qty).toFixed(3)}kg).`, deficit, qty);
            return;
        }

        addRowToCart(freshProduct, variant, qty);
        setSearchTerm('');
        if (isAddModalOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
    };

    const removeRow = (key: string) => {
        setCart(prev => prev.filter(r => r.key !== key));
    };

    const openEditRowModal = (row: CartRow) => {
        setEditRowKey(row.key);
        setEditQuantityInput(String(row.quantity));
        setEditUnitInput(String(row.precioUnitario));
        setEditTotalInput(String(round2(row.precioUnitario * row.quantity)));
        setEditError('');
    };

    const closeEditRowModal = () => {
        setEditRowKey(null);
        setEditError('');
    };

    const handleEditQuantityChange = (value: string) => {
        setEditQuantityInput(value);
        setEditError('');
        const qty = parseFloat(value) || 0;
        const unit = parseFloat(editUnitInput) || 0;
        setEditTotalInput(String(round2(qty * unit)));
    };

    const handleEditUnitChange = (value: string) => {
        if (!canEditPrices) return;
        setEditUnitInput(value);
        setEditError('');
        const qty = parseFloat(editQuantityInput) || 0;
        const unit = parseFloat(value) || 0;
        setEditTotalInput(String(round2(qty * unit)));
    };

    const handleEditTotalChange = (value: string) => {
        if (!canEditPrices) return;
        setEditTotalInput(value);
        setEditError('');
        const qty = parseFloat(editQuantityInput) || 0;
        const totalVal = parseFloat(value) || 0;
        setEditUnitInput(qty > 0 ? String(round2(totalVal / qty)) : '0');
    };

    const confirmEditRow = () => {
        if (!editRowKey) return;
        const row = cart.find(r => r.key === editRowKey);
        if (!row) return;

        const qty = parseFloat(editQuantityInput);
        const unit = parseFloat(editUnitInput);

        if (isNaN(qty) || qty <= 0) {
            setEditError('Ingresá una cantidad válida.');
            return;
        }
        if (canEditPrices && (isNaN(unit) || unit < 0)) {
            setEditError('Ingresá un precio válido.');
            return;
        }

        const product = products.find(p => p.id === row.productId);
        if (product) {
            const maxStock = getMaxStock(product, row.variant);
            const usedByOtherRows = cart
                .filter(r => r.key !== row.key && r.productId === row.productId && r.variant === row.variant)
                .reduce((sum, r) => sum + r.quantity, 0);

            if (usedByOtherRows + qty > maxStock) {
                setEditError(`No hay suficiente stock. Disponible: ${maxStock}.`);
                return;
            }
        }

        setCart(prev => prev.map(r => r.key === editRowKey
            ? { ...r, quantity: row.unitType === 'weight' ? Math.round(qty * 1000) / 1000 : qty, precioUnitario: canEditPrices ? unit : r.precioUnitario }
            : r
        ));
        closeEditRowModal();
    };

    const total = useMemo(() => {
        return round2(cart.reduce((sum, r) => sum + r.precioUnitario * r.quantity, 0));
    }, [cart]);

    const filteredResults = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const items: { product: Product; variant?: string; label: string; price: number; code?: string; stock: number }[] = [];

        products.forEach(p => {
            if (p.isHiddenInPOS) return;
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    const label = `${p.nombre} (${v.name})`;
                    const code = v.shortId || '';
                    const matches = !term || label.toLowerCase().includes(term) || code.toLowerCase().includes(term);
                    if (matches) {
                        items.push({ product: p, variant: v.name, label, price: getEffectivePrice(p), code: v.shortId, stock: v.stockQuantity || 0 });
                    }
                });
            } else {
                const code = p.shortId || '';
                const matches = !term || p.nombre.toLowerCase().includes(term) || code.toLowerCase().includes(term);
                if (matches) {
                    items.push({ product: p, label: p.nombre, price: getEffectivePrice(p), code: p.shortId, stock: p.stockQuantity || 0 });
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

    const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

    const handleConfirmSale = async () => {
        if (cart.length === 0 || processing) return;
        setProcessing(true);

        try {
            const result = await runTransaction(db, async (transaction) => {
                const productIdsToRead = new Set<string>();
                cart.forEach(row => {
                    productIdsToRead.add(row.productId);
                    const p = products.find(p => p.id === row.productId);
                    if (p?.stockDependency?.productId) productIdsToRead.add(p.stockDependency.productId);
                });

                const uniqueIds = Array.from(productIdsToRead);
                const refs = uniqueIds.map(id => doc(db, 'products', id));
                const docsSnap = await Promise.all(refs.map(ref => transaction.get(ref)));

                const productDataMap: Record<string, any> = {};
                docsSnap.forEach((d, i) => {
                    if (d.exists()) productDataMap[uniqueIds[i]] = d.data();
                });

                const orderRef = doc(collection(db, 'orders'));
                const orderIdString = orderRef.id;
                const productsToUpdate = new Set<string>();
                const stockAlertsToLog: any[] = [];

                for (const row of cart) {
                    const itemDoc = productDataMap[row.productId];
                    if (!itemDoc) throw new Error(`Producto ${row.nombre} no encontrado`);

                    if (itemDoc.stockDependency?.productId) {
                        const parentId = itemDoc.stockDependency.productId;
                        const parentDoc = productDataMap[parentId];
                        if (parentDoc) {
                            const unitsToDeduct = itemDoc.stockDependency.unitsToDeduct || 1;
                            const totalDeduct = row.quantity * unitsToDeduct;
                            const parentVIdx = row.variant && parentDoc.variants
                                ? parentDoc.variants.findIndex((v: any) => v.name === row.variant)
                                : -1;

                            if (parentVIdx >= 0) {
                                const variant = parentDoc.variants[parentVIdx];
                                const currentStock = variant.stockQuantity || 0;
                                if (currentStock < totalDeduct) {
                                    throw new Error(`Stock insuficiente para ${row.nombre} (${row.variant}). Quedan: ${Math.floor(currentStock / unitsToDeduct)} unidades.`);
                                }
                                variant.stockQuantity = currentStock - totalDeduct;
                                variant.stock = variant.stockQuantity > 0;
                                productsToUpdate.add(parentId);
                                if (currentStock > 0 && variant.stockQuantity <= 0 && parentDoc.isVisible !== false) {
                                    stockAlertsToLog.push({ productId: parentId, productName: `${parentDoc.nombre} (${row.variant})`, date: new Date() });
                                }
                            } else {
                                const currentStock = parentDoc.stockQuantity || 0;
                                if (currentStock < totalDeduct) {
                                    throw new Error(`Stock insuficiente para ${row.nombre} (Pack). Quedan: ${Math.floor(currentStock / unitsToDeduct)} unidades.`);
                                }
                                parentDoc.stockQuantity = currentStock - totalDeduct;
                                parentDoc.stock = parentDoc.stockQuantity > 0;
                                productsToUpdate.add(parentId);
                                if (currentStock > 0 && parentDoc.stockQuantity <= 0 && parentDoc.isVisible !== false) {
                                    stockAlertsToLog.push({ productId: parentId, productName: parentDoc.nombre, date: new Date() });
                                }
                            }
                        }
                    } else if (row.variant && itemDoc.variants) {
                        const vIdx = itemDoc.variants.findIndex((v: any) => v.name === row.variant);
                        if (vIdx >= 0) {
                            const variant = itemDoc.variants[vIdx];
                            const currentStock = variant.stockQuantity || 0;
                            if (currentStock < row.quantity) {
                                throw new Error(`Stock insuficiente para ${row.nombre} (${variant.name}). Quedan: ${currentStock}`);
                            }
                            variant.stockQuantity = currentStock - row.quantity;
                            variant.stock = variant.stockQuantity > 0;
                            productsToUpdate.add(row.productId);
                            if (currentStock > 0 && variant.stockQuantity <= 0 && itemDoc.isVisible !== false) {
                                stockAlertsToLog.push({ productId: row.productId, productName: `${row.nombre} (${variant.name})`, date: new Date() });
                            }
                        } else {
                            throw new Error(`Variante no encontrada: ${row.variant}`);
                        }
                    } else {
                        const currentStock = itemDoc.stockQuantity || 0;
                        if (currentStock < row.quantity) {
                            throw new Error(`Stock insuficiente para ${row.nombre}. Quedan: ${currentStock}`);
                        }
                        itemDoc.stockQuantity = currentStock - row.quantity;
                        itemDoc.stock = itemDoc.stockQuantity > 0;
                        productsToUpdate.add(row.productId);
                        if (currentStock > 0 && itemDoc.stockQuantity <= 0 && itemDoc.isVisible !== false) {
                            stockAlertsToLog.push({ productId: row.productId, productName: row.nombre, date: new Date() });
                        }
                    }
                }

                productsToUpdate.forEach(pid => {
                    const newData = productDataMap[pid];
                    transaction.update(doc(db, 'products', pid), {
                        stockQuantity: newData.stockQuantity,
                        stock: newData.stock,
                        variants: newData.variants || []
                    });
                });

                const orderData = {
                    ...(shouldMarkOrderAsTest() ? { isTestOrder: true } : {}),
                    items: cart.map(row => {
                        const originalDoc = productDataMap[row.productId] || {};
                        return {
                            id: row.productId,
                            name: row.nombre,
                            price: row.precioUnitario,
                            quantity: row.quantity,
                            variant: row.variant || null,
                            unitType: row.unitType,
                            historicCost: originalDoc.recipe?.costPerUnit || 0,
                            historicIngredients: originalDoc.recipe?.ingredients ? {
                                ingredients: originalDoc.recipe.ingredients,
                                yield: originalDoc.recipe.yield || 1
                            } : null
                        };
                    }),
                    total,
                    cliente: {
                        nombre: 'Cliente Local',
                        direccion: 'Local Físico',
                        telefono: '',
                        metodoPago: paymentMethod
                    },
                    date: new Date(),
                    status: 'entregado',
                    source: 'pos_public',
                    createdByEmail: user?.email || 'admin',
                    id: orderIdString
                };
                transaction.set(orderRef, orderData);

                cart.forEach(row => {
                    const moveRef = doc(collection(db, 'stock_movements'));
                    const itemDoc = productDataMap[row.productId];
                    let stockAfter: number | undefined;
                    if (row.variant && itemDoc?.variants) {
                        const v = itemDoc.variants.find((variant: any) => variant.name === row.variant);
                        stockAfter = v?.stockQuantity;
                    } else if (itemDoc) {
                        stockAfter = itemDoc.stockQuantity;
                    }
                    transaction.set(moveRef, {
                        productId: row.productId,
                        productName: row.nombre,
                        type: 'OUT',
                        quantity: row.quantity,
                        reason: 'Venta Caja',
                        observation: `Venta Caja${row.variant ? ` (Var: ${row.variant})` : ''}`,
                        date: new Date(),
                        ...(stockAfter !== undefined ? { stockAfter } : {})
                    });
                });

                stockAlertsToLog.forEach(alert => {
                    transaction.set(doc(collection(db, 'stock_alerts')), alert);
                });

                return {
                    orderId: orderIdString,
                    updates: Array.from(productsToUpdate).map(id => ({ id, newStock: productDataMap[id].stockQuantity }))
                };
            });

            if (result.updates.length > 0) {
                await Promise.all(result.updates.map(u => syncChildProducts(u.id, u.newStock)));
            }

            onSaleComplete({ amount: total, paymentMethod, orderId: result.orderId });
            setModalConfig({ isOpen: true, type: 'success', title: '¡Venta Registrada!', message: `Total: $${total.toLocaleString('es-AR')}` });
            setCart([]);
        } catch (error) {
            console.error('Checkout error:', error);
            const errMsg = error instanceof Error ? error.message : 'Error desconocido';
            setModalConfig({
                isOpen: true,
                type: 'error',
                title: errMsg.includes('Stock insuficiente') ? 'Stock Insuficiente' : 'Error en la Venta',
                message: errMsg.includes('Stock insuficiente') ? errMsg : 'Ocurrió un error al procesar la venta. Por favor verifique la conexión.'
            });
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="caja-venta-container">
            <div className="caja-venta-header">
                <button className="caja-venta-back-btn" onClick={onBack}>
                    <FaArrowLeft /> Volver
                </button>
                <h2>Caja - Registrar Venta</h2>
            </div>

            <div className="caja-venta-list-wrapper">
                <div className="caja-venta-list-header">
                    <span>Cantidad</span>
                    <span>Detalle</span>
                    <span>P. Unitario</span>
                    <span>P. Total</span>
                    <span></span>
                </div>
                <div className="caja-venta-list-body">
                    {cart.length === 0 ? (
                        <div className="caja-venta-empty">Lista vacía. Usá "Agregar Producto" para comenzar la venta.</div>
                    ) : (
                        cart.map(row => (
                            <div className="caja-venta-row" key={row.key}>
                                <span>{row.unitType === 'weight' ? `${Math.round(row.quantity * 1000)}g` : row.quantity}</span>
                                <span>{row.nombre}{row.variant ? ` (${row.variant})` : ''}</span>
                                <span>${round2(row.precioUnitario).toLocaleString('es-AR')}</span>
                                <span>${round2(row.precioUnitario * row.quantity).toLocaleString('es-AR')}</span>
                                <span className="caja-venta-row-actions">
                                    <button className="caja-venta-row-edit" onClick={() => openEditRowModal(row)} title="Editar">
                                        <FaEdit />
                                    </button>
                                    <button className="caja-venta-row-remove" onClick={() => removeRow(row.key)} title="Eliminar">
                                        <FaTrash />
                                    </button>
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="caja-venta-add-row">
                <button className="caja-venta-add-btn" onClick={() => setIsAddModalOpen(true)}>
                    <FaPlus /> Agregar Producto
                </button>
            </div>

            <div className="caja-venta-footer">
                <div className="caja-venta-total-row">
                    <span>Total</span>
                    <span>${total.toLocaleString('es-AR')}</span>
                </div>
                <div className="caja-venta-payment-methods">
                    {(['Efectivo', 'Débito', 'Transferencia'] as PaymentMethod[]).map(pm => (
                        <button
                            key={pm}
                            className={`caja-venta-payment-btn ${paymentMethod === pm ? 'active' : ''}`}
                            onClick={() => setPaymentMethod(pm)}
                        >
                            {pm === 'Efectivo' && <FaMoneyBillWave />}
                            {pm === 'Débito' && <FaCreditCard />}
                            {pm === 'Transferencia' && <FaExchangeAlt />}
                            {pm}
                        </button>
                    ))}
                </div>
                <button className="caja-venta-confirm-btn" disabled={cart.length === 0 || processing} onClick={handleConfirmSale}>
                    {processing ? 'Procesando...' : 'Confirmar Venta'}
                </button>
            </div>

            {isAddModalOpen && (
                <div className="caja-venta-modal-overlay" onClick={() => setIsAddModalOpen(false)}>
                    <div className="caja-venta-add-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="caja-venta-add-modal-header">
                            <h3>Agregar Producto</h3>
                            <button className="caja-venta-modal-close" onClick={() => setIsAddModalOpen(false)}>
                                <FaTimes />
                            </button>
                        </div>
                        <div className="caja-venta-search-box">
                            <FaSearch className="caja-venta-search-icon" />
                            <input
                                ref={searchInputRef}
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setAddModalError(''); }}
                                placeholder="Buscar producto por nombre... (o escaneá/ingresá un código sin hacer clic acá)"
                            />
                        </div>
                        {addModalError && <p className="caja-venta-add-error">{addModalError}</p>}
                        <div className="caja-venta-search-results">
                            {filteredResults.length === 0 ? (
                                <p className="caja-venta-search-hint">No se encontraron productos.</p>
                            ) : (
                                filteredResults.map((item, idx) => (
                                    <div
                                        key={`${item.product.id}-${item.variant || 'base'}-${idx}`}
                                        className="caja-venta-search-result"
                                        onClick={() => openEntryModal(item.product, item.variant)}
                                    >
                                        <span className="caja-venta-search-result-code">{item.code || '—'}</span>
                                        <span className="caja-venta-search-result-name">{item.label}</span>
                                        <span className={`caja-venta-search-result-stock ${item.stock <= 0 ? 'out' : item.stock < 5 ? 'low' : ''}`}>
                                            Stock: {Number(item.stock.toFixed(3))}{item.product.unitType === 'weight' ? 'kg' : ''}
                                        </span>
                                        <span className="caja-venta-search-result-price">${round2(item.price).toLocaleString('es-AR')}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showBuffer && (
                <div className="caja-venta-code-buffer">
                    <span className="caja-venta-code-buffer-label">Código</span>
                    <span>{codeBuffer}</span>
                </div>
            )}

            {quantityModalOpen && pendingProduct && (
                <div className="caja-venta-modal-overlay">
                    <div className="caja-venta-entry-modal">
                        <h3>{pendingProduct.product.nombre}{pendingProduct.variant ? ` (${pendingProduct.variant})` : ''}</h3>
                        <span className="caja-venta-entry-stock">
                            Stock: {getMaxStock(products.find(p => p.id === pendingProduct.product.id) || pendingProduct.product, pendingProduct.variant)}
                        </span>
                        <input
                            ref={quantityInputRef}
                            type="number"
                            placeholder="Cantidad"
                            value={quantityInput}
                            onChange={(e) => { setQuantityInput(e.target.value); setQuantityError(''); }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmQuantity();
                                if (e.key === 'Escape') { setQuantityModalOpen(false); setPendingProduct(null); }
                            }}
                        />
                        {quantityError && <p className="caja-venta-entry-error">{quantityError}</p>}
                        <div className="caja-venta-entry-actions">
                            <button className="caja-venta-entry-confirm" onClick={confirmQuantity}>Confirmar</button>
                            <button className="caja-venta-entry-cancel" onClick={() => { setQuantityModalOpen(false); setPendingProduct(null); }}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            <WeightEntryModal
                isOpen={weightModalOpen && !!pendingProduct}
                productName={pendingProduct?.product.nombre || ''}
                variantName={pendingProduct?.variant}
                stockActual={pendingProduct ? getMaxStock(products.find(p => p.id === pendingProduct.product.id) || pendingProduct.product, pendingProduct.variant) : 0}
                maxStock={pendingProduct ? Math.max(0, getMaxStock(products.find(p => p.id === pendingProduct.product.id) || pendingProduct.product, pendingProduct.variant) - getQuantityAlreadyInCart(pendingProduct.product.id, pendingProduct.variant)) : 0}
                unitPrice={pendingProduct ? getEffectivePrice(products.find(p => p.id === pendingProduct.product.id) || pendingProduct.product) : 0}
                onConfirm={confirmWeight}
                onCancel={() => { setWeightModalOpen(false); setPendingProduct(null); }}
            />

            {editRowKey && (() => {
                const editingRow = cart.find(r => r.key === editRowKey);
                if (!editingRow) return null;
                return (
                    <div className="caja-venta-modal-overlay" onClick={closeEditRowModal}>
                        <div className="caja-venta-entry-modal" onClick={(e) => e.stopPropagation()}>
                            <h3>{editingRow.nombre}{editingRow.variant ? ` (${editingRow.variant})` : ''}</h3>

                            <div className="caja-venta-edit-field">
                                <label>{editingRow.unitType === 'weight' ? 'Peso (kg)' : 'Cantidad'}</label>
                                <input
                                    type="number"
                                    step={editingRow.unitType === 'weight' ? '0.001' : '1'}
                                    value={editQuantityInput}
                                    onChange={(e) => handleEditQuantityChange(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') confirmEditRow(); if (e.key === 'Escape') closeEditRowModal(); }}
                                />
                            </div>

                            <div className="caja-venta-edit-field">
                                <label>P. Unitario {!canEditPrices && '(sin permiso)'}</label>
                                <input
                                    type="number"
                                    value={editUnitInput}
                                    disabled={!canEditPrices}
                                    onChange={(e) => handleEditUnitChange(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') confirmEditRow(); if (e.key === 'Escape') closeEditRowModal(); }}
                                />
                            </div>

                            <div className="caja-venta-edit-field">
                                <label>P. Total {!canEditPrices && '(sin permiso)'}</label>
                                <input
                                    type="number"
                                    value={editTotalInput}
                                    disabled={!canEditPrices}
                                    onChange={(e) => handleEditTotalChange(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') confirmEditRow(); if (e.key === 'Escape') closeEditRowModal(); }}
                                />
                            </div>

                            {editError && <p className="caja-venta-entry-error">{editError}</p>}
                            <div className="caja-venta-entry-actions">
                                <button className="caja-venta-entry-confirm" onClick={confirmEditRow}>Guardar</button>
                                <button className="caja-venta-entry-cancel" onClick={closeEditRowModal}>Cancelar</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <POSModal
                isOpen={modalConfig.isOpen}
                onClose={closeModal}
                type={modalConfig.type}
                title={modalConfig.title}
                message={modalConfig.message}
            >
                {modalConfig.content}
            </POSModal>

            {isStockModalOpen && (
                <StockAdjustmentModal
                    isOpen={isStockModalOpen}
                    onClose={() => {
                        setIsStockModalOpen(false);
                        setStockModalProduct(null);
                        setStockModalVariant(undefined);
                        setStockModalInitialValue(undefined);
                        setPendingRetry(null);
                    }}
                    product={stockModalProduct}
                    initialVariantName={stockModalVariant}
                    initialValue={stockModalInitialValue}
                    onSuccess={() => {
                        setIsStockModalOpen(false);
                        setStockModalProduct(null);
                        setStockModalVariant(undefined);
                        setStockModalInitialValue(undefined);

                        if (pendingRetry) {
                            const freshProduct = products.find(p => p.id === pendingRetry.productId);
                            if (freshProduct) {
                                addRowToCart(freshProduct, pendingRetry.variant, pendingRetry.quantity);
                            }
                            setPendingRetry(null);
                        }

                        setSearchTerm('');
                        if (isAddModalOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
                    }}
                />
            )}
        </div>
    );
}
