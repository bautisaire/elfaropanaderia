import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, runTransaction, onSnapshot } from 'firebase/firestore';
import { FaArrowLeft, FaPlus, FaTrash, FaTimes, FaSearch, FaMoneyBillWave, FaCreditCard, FaExchangeAlt, FaEdit, FaBoxOpen } from 'react-icons/fa';
import { syncChildProducts } from '../utils/stockUtils';
import { shouldMarkOrderAsTest } from '../utils/testMode';
import { calculateTieredTotal, type PriceTier } from '../utils/priceTiers';
import { getVariantPrice } from '../utils/cartStock';
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
        priceOverride?: number;
    }[];
    unitType?: 'unit' | 'weight';
    stockDependency?: { productId: string; unitsToDeduct?: number };
    isHiddenInPOS?: boolean;
    discount?: number;
    priceTiers?: PriceTier[];
}

interface CartRow {
    key: string;
    productId: string;
    variant?: string;
    nombre: string;
    quantity: number;
    unitType?: 'unit' | 'weight';
    precioUnitario: number;
    priceTiers?: PriceTier[];
    manualPriceOverride?: boolean;
}

const getRowLineTotal = (row: CartRow): number => {
    if (row.manualPriceOverride || row.unitType === 'weight') {
        return round2(row.precioUnitario * row.quantity);
    }
    return round2(calculateTieredTotal(row.quantity, row.precioUnitario, row.priceTiers));
};

interface CajaVentaProps {
    onBack: () => void;
    onSaleComplete: (data: { amount: number; payments: { method: string; amount: number }[]; orderId: string; itemCount: number }) => void;
}

type PaymentMethod = 'Efectivo' | 'Débito' | 'Transferencia';

const PAYMENT_METHODS_ORDER: PaymentMethod[] = ['Efectivo', 'Débito', 'Transferencia'];

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function CajaVenta({ onBack, onSaleComplete }: CajaVentaProps) {
    const { user, isSuperAdmin, adminPermissions } = useCart();
    const canEditPrices = isSuperAdmin || adminPermissions?.orders_can_edit_prices === true;

    const [products, setProducts] = useState<Product[]>([]);
    const [cart, setCart] = useState<CartRow[]>([]);
    const [enabledMethods, setEnabledMethods] = useState<Record<PaymentMethod, boolean>>({ Efectivo: true, 'Débito': false, Transferencia: false });
    const [paymentAmounts, setPaymentAmounts] = useState<Record<PaymentMethod, string>>({ Efectivo: '', 'Débito': '', Transferencia: '' });
    const [combinePayments, setCombinePayments] = useState(false);
    const paymentInputRefs = useRef<Record<PaymentMethod, HTMLInputElement | null>>({ Efectivo: null, 'Débito': null, Transferencia: null });
    const [discountPercentInput, setDiscountPercentInput] = useState('');
    const [totalInput, setTotalInput] = useState('');
    const [processing, setProcessing] = useState(false);
    const [lastSale, setLastSale] = useState<{ time: Date; itemCount: number; amount: number } | null>(null);

    // Envío Modal State: si el carrito tiene un producto "Envío", pedimos el nombre del
    // cliente antes de cobrar y el pedido se registra como delivery pendiente (igual que el POS anterior).
    const [envioModalOpen, setEnvioModalOpen] = useState(false);
    const [envioClientName, setEnvioClientName] = useState('');
    const envioInputRef = useRef<HTMLInputElement>(null);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    // Dentro del mismo picker de "Agregar Producto": si está activo, seleccionar un producto
    // abre el ajuste de stock en vez de agregarlo al carrito. Se resetea al cerrar el modal.
    const [addModalStockMode, setAddModalStockMode] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [addModalError, setAddModalError] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    const closeAddModal = () => {
        setIsAddModalOpen(false);
        setAddModalStockMode(false);
    };

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
    // true once the admin explicitly touches P.Unitario/P.Total in the edit modal: from then on
    // this row's price is a manual override and stops auto-applying quantity price tiers.
    const [editIsManualOverride, setEditIsManualOverride] = useState(false);

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

    useEffect(() => {
        if (envioModalOpen && envioInputRef.current) envioInputRef.current.focus();
    }, [envioModalOpen]);

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

    const openStockAdjustModal = (product: Product, variant?: string) => {
        setStockModalProduct(product);
        setStockModalVariant(variant);
        setStockModalInitialValue(undefined);
        setPendingRetry(null);
        setIsStockModalOpen(true);
    };

    // Selección de producto desde el picker de "Agregar Producto": en modo normal se agrega
    // al carrito, en modo "Ajustar Stock" abre directamente el ajuste de stock del producto.
    const handleProductPicked = (product: Product, variant?: string) => {
        if (addModalStockMode) {
            openStockAdjustModal(product, variant);
        } else {
            openEntryModal(product, variant);
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
                    closeAddModal();
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
                    handleProductPicked(found.product, found.variant);
                } else {
                    setAddModalError(`No existe producto con código "${codeBuffer}"`);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddModalOpen, codeBuffer, quantityModalOpen, weightModalOpen, products, addModalStockMode]);

    const getEffectivePrice = (product: Product, variantName?: string) => {
        const variantObj = variantName && product.variants ? product.variants.find(v => v.name === variantName) : undefined;
        const basePrice = getVariantPrice(product.precio, variantObj);
        return (product.discount || 0) > 0 ? basePrice * (1 - product.discount! / 100) : basePrice;
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
        const precioUnitario = getEffectivePrice(product, variant);
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
                precioUnitario,
                priceTiers: product.priceTiers
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
    };

    const removeRow = (key: string) => {
        setCart(prev => prev.filter(r => r.key !== key));
    };

    const openEditRowModal = (row: CartRow) => {
        setEditRowKey(row.key);
        setEditQuantityInput(String(row.quantity));
        setEditUnitInput(String(row.precioUnitario));
        setEditTotalInput(String(getRowLineTotal(row)));
        setEditIsManualOverride(!!row.manualPriceOverride);
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
        const row = cart.find(r => r.key === editRowKey);
        const unit = parseFloat(editUnitInput) || 0;
        const total = editIsManualOverride || row?.unitType === 'weight'
            ? round2(qty * unit)
            : round2(calculateTieredTotal(qty, unit, row?.priceTiers));
        setEditTotalInput(String(total));
    };

    const handleEditUnitChange = (value: string) => {
        if (!canEditPrices) return;
        setEditUnitInput(value);
        setEditError('');
        setEditIsManualOverride(true);
        const qty = parseFloat(editQuantityInput) || 0;
        const unit = parseFloat(value) || 0;
        setEditTotalInput(String(round2(qty * unit)));
    };

    const handleEditTotalChange = (value: string) => {
        if (!canEditPrices) return;
        setEditTotalInput(value);
        setEditError('');
        setEditIsManualOverride(true);
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
            ? {
                ...r,
                quantity: row.unitType === 'weight' ? Math.round(qty * 1000) / 1000 : qty,
                precioUnitario: canEditPrices ? unit : r.precioUnitario,
                manualPriceOverride: canEditPrices ? editIsManualOverride : r.manualPriceOverride
            }
            : r
        ));
        closeEditRowModal();
    };

    const subtotal = useMemo(() => {
        return round2(cart.reduce((sum, r) => sum + getRowLineTotal(r), 0));
    }, [cart]);

    // The "Importe" total and the "% Descuento" field are bidirectional: editing either one
    // recalculates the other (same pattern as the cart row P.Unitario/P.Total editor).
    const total = useMemo(() => {
        const t = parseFloat(totalInput);
        return isNaN(t) ? 0 : round2(Math.max(0, t));
    }, [totalInput]);

    const discountAmount = useMemo(() => round2(subtotal - total), [subtotal, total]);

    const discountPct = useMemo(() => {
        if (subtotal <= 0) return 0;
        return round2((discountAmount / subtotal) * 100);
    }, [subtotal, discountAmount]);

    const handleDiscountPercentChange = (value: string) => {
        setDiscountPercentInput(value);
        const pct = Math.min(100, Math.max(0, parseFloat(value) || 0));
        setTotalInput(subtotal > 0 ? String(round2(subtotal * (1 - pct / 100))) : '');
    };

    const handleTotalInputChange = (value: string) => {
        setTotalInput(value);
        const newTotal = parseFloat(value) || 0;
        const pct = subtotal > 0 ? round2(Math.min(100, Math.max(0, ((subtotal - newTotal) / subtotal) * 100))) : 0;
        setDiscountPercentInput(pct > 0 ? String(pct) : '');
    };

    // Keep the total synced to the cart's subtotal (via the current discount %) whenever
    // the cart itself changes, so adding/removing products doesn't leave a stale total.
    useEffect(() => {
        const pct = Math.min(100, Math.max(0, parseFloat(discountPercentInput) || 0));
        setTotalInput(subtotal > 0 ? String(round2(subtotal * (1 - pct / 100))) : '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subtotal]);

    // A single enabled method always tracks the live total (still freely editable afterwards,
    // e.g. to enter a higher tendered amount and see "vuelto").
    useEffect(() => {
        const enabled = PAYMENT_METHODS_ORDER.filter(m => enabledMethods[m]);
        if (enabled.length === 1) {
            setPaymentAmounts(prev => ({ ...prev, [enabled[0]]: total > 0 ? String(total) : '' }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [total]);

    // Unchecking "Combinar formas de pago" collapses back down to a single active method.
    useEffect(() => {
        if (combinePayments) return;
        setEnabledMethods(prev => {
            const enabledList = PAYMENT_METHODS_ORDER.filter(m => prev[m]);
            if (enabledList.length <= 1) return prev;
            const keep = enabledList[0];
            setPaymentAmounts({ Efectivo: '', 'Débito': '', Transferencia: '', [keep]: total > 0 ? String(total) : '' });
            return { Efectivo: false, 'Débito': false, Transferencia: false, [keep]: true };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [combinePayments]);

    const togglePaymentMethod = (method: PaymentMethod) => {
        setEnabledMethods(prev => {
            const isCurrentlyEnabled = prev[method];

            // Turning it off: same letter/click on an already-active method disables it.
            if (isCurrentlyEnabled) {
                setPaymentAmounts(prevAmounts => ({ ...prevAmounts, [method]: '' }));
                return { ...prev, [method]: false };
            }

            // Turning it on, single-select mode (default): switch away from whatever was
            // active and hand the full amount to the newly selected method.
            if (!combinePayments) {
                setPaymentAmounts({ Efectivo: '', 'Débito': '', Transferencia: '', [method]: total > 0 ? String(total) : '' });
                return { Efectivo: false, 'Débito': false, Transferencia: false, [method]: true };
            }

            // Turning it on, combine mode: add alongside whatever's already enabled,
            // defaulting to whatever balance remains.
            const next = { ...prev, [method]: true };
            const alreadyEnteredSum = PAYMENT_METHODS_ORDER
                .filter(m => m !== method && next[m])
                .reduce((sum, m) => sum + (parseFloat(paymentAmounts[m]) || 0), 0);
            const remaining = Math.max(0, round2(total - alreadyEnteredSum));
            setPaymentAmounts(prevAmounts => ({ ...prevAmounts, [method]: remaining > 0 ? String(remaining) : '' }));
            return next;
        });
    };

    const handlePaymentAmountChange = (method: PaymentMethod, value: string) => {
        setPaymentAmounts(prev => ({ ...prev, [method]: value }));
    };

    const sumEntered = useMemo(() => {
        return round2(PAYMENT_METHODS_ORDER.reduce((sum, m) => sum + (enabledMethods[m] ? (parseFloat(paymentAmounts[m]) || 0) : 0), 0));
    }, [enabledMethods, paymentAmounts]);

    const paymentDiff = useMemo(() => round2(sumEntered - total), [sumEntered, total]);

    // What actually gets recorded per method, capped so it never exceeds the total
    // (any excess on the last contributing method is "vuelto" and isn't kept as revenue).
    const paymentBreakdown = useMemo(() => {
        let remaining = total;
        const result: { method: PaymentMethod; amount: number }[] = [];
        PAYMENT_METHODS_ORDER.forEach(m => {
            if (!enabledMethods[m]) return;
            const entered = parseFloat(paymentAmounts[m]) || 0;
            if (entered <= 0) return;
            const applied = Math.min(entered, Math.max(0, remaining));
            if (applied > 0) {
                result.push({ method: m, amount: round2(applied) });
                remaining = round2(remaining - applied);
            }
        });
        return result;
    }, [enabledMethods, paymentAmounts, total]);

    const filteredResults = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const items: { product: Product; variant?: string; label: string; price: number; code?: string; stock: number; priceTiers?: PriceTier[] }[] = [];

        products.forEach(p => {
            if (p.isHiddenInPOS) return;
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    const label = `${p.nombre} (${v.name})`;
                    const code = v.shortId || '';
                    const matches = !term || label.toLowerCase().includes(term) || code.toLowerCase().includes(term);
                    if (matches) {
                        items.push({ product: p, variant: v.name, label, price: getEffectivePrice(p, v.name), code: v.shortId, stock: v.stockQuantity || 0, priceTiers: p.priceTiers });
                    }
                });
            } else {
                const code = p.shortId || '';
                const matches = !term || p.nombre.toLowerCase().includes(term) || code.toLowerCase().includes(term);
                if (matches) {
                    items.push({ product: p, label: p.nombre, price: getEffectivePrice(p), code: p.shortId, stock: p.stockQuantity || 0, priceTiers: p.priceTiers });
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
        if (cart.length === 0 || processing || paymentBreakdown.length === 0 || paymentDiff < -0.01) return;

        const hasEnvio = cart.some(row => row.nombre.toLowerCase().includes('envío') || row.nombre.toLowerCase().includes('envio'));

        if (hasEnvio && !envioClientName && !envioModalOpen) {
            setEnvioModalOpen(true);
            return;
        }

        setProcessing(true);

        try {
            const isDeliveryOrder = hasEnvio;

            const result = await runTransaction(db, async (transaction) => {
                const productIdsToRead = new Set<string>();
                cart.forEach(row => {
                    productIdsToRead.add(row.productId);
                    const p = products.find(p => p.id === row.productId);
                    if (p?.stockDependency?.productId) productIdsToRead.add(p.stockDependency.productId);
                });

                const uniqueIds = Array.from(productIdsToRead);
                const refs = uniqueIds.map(id => doc(db, 'products', id));
                const counterRef = doc(db, 'config', 'order_counter');

                const reads: Promise<any>[] = refs.map(ref => transaction.get(ref));
                if (isDeliveryOrder) reads.push(transaction.get(counterRef));

                const allSnaps = await Promise.all(reads);
                const docsSnap = allSnaps.slice(0, refs.length);
                const counterSnap = isDeliveryOrder ? allSnaps[refs.length] : null;

                const productDataMap: Record<string, any> = {};
                docsSnap.forEach((d, i) => {
                    if (d.exists()) productDataMap[uniqueIds[i]] = d.data();
                });

                let orderRef;
                let orderIdString = '';
                let nextOrderCounter = 0;

                if (isDeliveryOrder) {
                    nextOrderCounter = 1000;
                    if (counterSnap && counterSnap.exists()) {
                        nextOrderCounter = (counterSnap.data().current || 999) + 1;
                    }
                    orderIdString = nextOrderCounter.toString();
                    orderRef = doc(db, 'orders', orderIdString);
                } else {
                    orderRef = doc(collection(db, 'orders'));
                    orderIdString = orderRef.id;
                }

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

                if (isDeliveryOrder) {
                    transaction.set(counterRef, { current: nextOrderCounter }, { merge: true });
                }

                const metodoPago = paymentBreakdown.map(p => p.method).join(' + ') || 'Efectivo';

                const orderData = {
                    ...(shouldMarkOrderAsTest() ? { isTestOrder: true } : {}),
                    items: cart.map(row => {
                        const originalDoc = productDataMap[row.productId] || {};
                        const rowLineTotal = getRowLineTotal(row);
                        const effectivePrice = row.quantity > 0 ? round2(rowLineTotal / row.quantity) : row.precioUnitario;
                        return {
                            id: row.productId,
                            name: row.nombre,
                            price: effectivePrice,
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
                    subtotal,
                    discountPercent: discountPct,
                    discountAmount,
                    payments: paymentBreakdown,
                    cliente: {
                        nombre: isDeliveryOrder ? (envioClientName.trim() || 'Cliente') : 'Cliente Local',
                        direccion: isDeliveryOrder ? 'Envío' : 'Local Físico',
                        telefono: '',
                        metodoPago
                    },
                    date: new Date(),
                    status: isDeliveryOrder ? 'pendiente' : 'entregado',
                    source: isDeliveryOrder ? 'pos_delivery' : 'pos_public',
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
                // No bloquea el cobro: el stock del producto vendido ya quedó consistente
                // en la transacción de arriba, esto solo propaga a productos derivados (ej. porciones).
                Promise.all(result.updates.map(u => syncChildProducts(u.id, u.newStock)))
                    .catch(err => console.error('Error sincronizando productos derivados:', err));
            }

            onSaleComplete({ amount: total, payments: paymentBreakdown, orderId: result.orderId, itemCount: cart.length });

            if (isDeliveryOrder) {
                setModalConfig({ isOpen: true, type: 'success', title: `¡Pedido #${result.orderId} Registrado!`, message: `Enviado a Deliveries. Total: $${total.toLocaleString('es-AR')}` });

                if (!shouldMarkOrderAsTest()) {
                    const metodoPago = paymentBreakdown.map(p => p.method).join(' + ') || 'Efectivo';
                    const ticketItems = cart.map(row => ({
                        name: row.nombre,
                        price: row.quantity > 0 ? round2(getRowLineTotal(row) / row.quantity) : row.precioUnitario,
                        quantity: row.quantity,
                        variant: row.variant || null,
                        unitType: row.unitType
                    }));
                    import('../utils/printTicket').then(({ printTicket }) => {
                        printTicket({
                            id: result.orderId,
                            items: ticketItems,
                            total,
                            cliente: {
                                nombre: envioClientName.trim(),
                                direccion: 'Envío',
                                metodoPago
                            },
                            date: new Date()
                        });
                    });
                }
            } else {
                setModalConfig({ isOpen: true, type: 'success', title: '¡Venta Registrada!', message: `Total: $${total.toLocaleString('es-AR')}` });
            }

            setLastSale({ time: new Date(), itemCount: cart.length, amount: total });
            setCart([]);
            setDiscountPercentInput('');
            setTotalInput('');
            setEnabledMethods({ Efectivo: true, 'Débito': false, Transferencia: false });
            setPaymentAmounts({ Efectivo: '', 'Débito': '', Transferencia: '' });
            setCombinePayments(false);
            setEnvioModalOpen(false);
            setEnvioClientName('');
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

    const activatePaymentMethod = (method: PaymentMethod) => {
        const wasEnabled = enabledMethods[method];
        togglePaymentMethod(method);
        if (wasEnabled) return;

        setTimeout(() => {
            paymentInputRefs.current[method]?.focus();
            paymentInputRefs.current[method]?.select();
        }, 50);
    };

    // Keyboard shortcuts on the main sale screen: E/T/D activate the matching payment
    // method's input, Enter charges the sale. Disabled while any modal/overlay is open,
    // and E/T/D are skipped while typing elsewhere so they don't hijack normal typing.
    useEffect(() => {
        const anyModalOpen = isAddModalOpen || quantityModalOpen || weightModalOpen || isStockModalOpen || modalConfig.isOpen || !!editRowKey || envioModalOpen;
        if (anyModalOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirmSale();
                return;
            }

            const activeEl = document.activeElement as HTMLElement | null;
            const isPaymentInput = activeEl !== null && PAYMENT_METHODS_ORDER.some(m => paymentInputRefs.current[m] === activeEl);
            const tag = activeEl?.tagName?.toLowerCase();
            const isTyping = (tag === 'input' || tag === 'textarea' || tag === 'select') && !isPaymentInput;
            if (isTyping) return;

            if (e.key === 'e' || e.key === 'E') {
                e.preventDefault();
                activatePaymentMethod('Efectivo');
            } else if (e.key === 't' || e.key === 'T') {
                e.preventDefault();
                activatePaymentMethod('Transferencia');
            } else if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                activatePaymentMethod('Débito');
            } else if (e.key === ' ') {
                e.preventDefault();
                setIsAddModalOpen(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddModalOpen, quantityModalOpen, weightModalOpen, isStockModalOpen, modalConfig.isOpen, editRowKey, envioModalOpen, envioClientName, cart, enabledMethods, paymentAmounts, total, processing]);

    return (
        <div className="caja-venta-container">
            <div className="caja-venta-header">
                <button className="caja-venta-back-btn" onClick={onBack}>
                    <FaArrowLeft /> Volver
                </button>
                <h2>Caja - Registrar Venta</h2>
            </div>

            <div className="caja-venta-body">
                <div className="caja-venta-main">
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
                                        <span>
                                            {row.nombre}{row.variant ? ` (${row.variant})` : ''}
                                            {!row.manualPriceOverride && row.unitType !== 'weight' && (row.priceTiers || []).some(t => t.quantity > 0 && row.quantity >= t.quantity) && (
                                                <span style={{ marginLeft: '6px', fontSize: '0.7rem', background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                    Precio x cantidad
                                                </span>
                                            )}
                                        </span>
                                        <span>${round2(row.precioUnitario).toLocaleString('es-AR')}</span>
                                        <span>${getRowLineTotal(row).toLocaleString('es-AR')}</span>
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
                </div>

                <div className="caja-venta-summary-panel">
                    <div className="caja-venta-total-box">
                        <div className="caja-venta-total-main">
                            <div className="caja-venta-total-input-row">
                                <span className="caja-venta-total-currency">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="caja-venta-total-value-input"
                                    value={totalInput}
                                    onChange={(e) => handleTotalInputChange(e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                            <span className="caja-venta-total-label">Importe</span>
                        </div>
                        {discountPct > 0 && (
                            <div className="caja-venta-total-sub">
                                <span className="caja-venta-total-sub-value">${subtotal.toLocaleString('es-AR')}</span>
                                <span className="caja-venta-total-sub-label">Importe sin descuento</span>
                            </div>
                        )}
                    </div>

                    <div className="caja-venta-discount-box">
                        <label htmlFor="caja-venta-discount-input">% Descuento</label>
                        <input
                            id="caja-venta-discount-input"
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            placeholder="0"
                            value={discountPercentInput}
                            onChange={(e) => handleDiscountPercentChange(e.target.value)}
                        />
                    </div>

                    <label className="caja-venta-combine-toggle">
                        <input
                            type="checkbox"
                            checked={combinePayments}
                            onChange={(e) => setCombinePayments(e.target.checked)}
                        />
                        Combinar formas de pago
                    </label>

                    <div className="caja-venta-payment-methods">
                        {(['Efectivo', 'Débito', 'Transferencia'] as PaymentMethod[]).map(pm => (
                            <div key={pm} className={`caja-venta-payment-row ${enabledMethods[pm] ? 'active' : ''}`}>
                                <button
                                    type="button"
                                    className="caja-venta-payment-toggle"
                                    onClick={() => togglePaymentMethod(pm)}
                                >
                                    {pm === 'Efectivo' && <FaMoneyBillWave />}
                                    {pm === 'Débito' && <FaCreditCard />}
                                    {pm === 'Transferencia' && <FaExchangeAlt />}
                                    {pm}
                                </button>
                                {enabledMethods[pm] && (
                                    <input
                                        ref={(el) => { paymentInputRefs.current[pm] = el; }}
                                        type="number"
                                        className="caja-venta-payment-input"
                                        value={paymentAmounts[pm]}
                                        onChange={(e) => handlePaymentAmountChange(pm, e.target.value)}
                                        placeholder="0"
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    {paymentBreakdown.length > 0 && Math.abs(paymentDiff) > 0.001 && (
                        <div className={`caja-venta-payment-feedback ${paymentDiff > 0 ? 'change' : 'missing'}`}>
                            {paymentDiff > 0
                                ? `Vuelto: $${paymentDiff.toLocaleString('es-AR')}`
                                : `Restan: $${Math.abs(paymentDiff).toLocaleString('es-AR')}`}
                        </div>
                    )}

                    <button className="caja-venta-confirm-btn" disabled={cart.length === 0 || processing || paymentBreakdown.length === 0 || paymentDiff < -0.01} onClick={handleConfirmSale}>
                        {processing ? 'Procesando...' : 'Cobrar Venta'}
                    </button>

                    {lastSale && (
                        <div className="caja-venta-last-sale">
                            Última venta: {lastSale.time.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · {lastSale.itemCount} {lastSale.itemCount === 1 ? 'producto' : 'productos'} · ${lastSale.amount.toLocaleString('es-AR')}
                        </div>
                    )}
                </div>
            </div>

            {isAddModalOpen && (
                <div className="caja-venta-modal-overlay" onClick={closeAddModal}>
                    <div className={`caja-venta-add-modal ${addModalStockMode ? 'stock-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
                        <div className="caja-venta-add-modal-header">
                            <h3>{addModalStockMode ? 'Ajustar Stock' : 'Agregar Producto'}</h3>
                            <button
                                type="button"
                                className={`caja-venta-stock-mode-toggle ${addModalStockMode ? 'active' : ''}`}
                                onClick={() => setAddModalStockMode(prev => !prev)}
                                title="Al seleccionar un producto se abre su ajuste de stock en vez de agregarlo al carrito"
                            >
                                <FaBoxOpen /> Ajustar Stock
                            </button>
                            <button className="caja-venta-modal-close" onClick={closeAddModal}>
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
                                        onClick={() => handleProductPicked(item.product, item.variant)}
                                    >
                                        <span className="caja-venta-search-result-code">{item.code || '—'}</span>
                                        <span className="caja-venta-search-result-name">
                                            {item.label}
                                            {(item.priceTiers || []).filter(t => t.quantity > 0).length > 0 && (
                                                <span style={{ display: 'block', fontSize: '0.7rem', color: '#059669' }}>
                                                    {item.priceTiers!.filter(t => t.quantity > 0).sort((a, b) => a.quantity - b.quantity).map(t => `${t.quantity}u: $${t.price}`).join(' · ')}
                                                </span>
                                            )}
                                        </span>
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

            {envioModalOpen && (
                <div className="caja-venta-modal-overlay">
                    <div className="caja-venta-entry-modal">
                        <h3>Pedido con Envío</h3>
                        <p style={{ margin: '0 0 15px 0', color: '#475569' }}>Ingresá el nombre del cliente para registrar el pedido:</p>
                        <input
                            ref={envioInputRef}
                            type="text"
                            placeholder="Nombre del cliente"
                            value={envioClientName}
                            onChange={(e) => setEnvioClientName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && envioClientName.trim() !== '') {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    handleConfirmSale();
                                }
                                if (e.key === 'Escape') { setEnvioModalOpen(false); setEnvioClientName(''); }
                            }}
                        />
                        <div className="caja-venta-entry-actions">
                            <button
                                className="caja-venta-entry-confirm"
                                disabled={envioClientName.trim() === '' || processing}
                                onClick={handleConfirmSale}
                            >
                                Confirmar
                            </button>
                            <button
                                className="caja-venta-entry-cancel"
                                onClick={() => { setEnvioModalOpen(false); setEnvioClientName(''); setProcessing(false); }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                    }}
                />
            )}
        </div>
    );
}
