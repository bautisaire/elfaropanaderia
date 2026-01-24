import { useState, useEffect, useMemo, useRef } from 'react';
import ProductSearch from './ProductSearch';
import { db } from "../firebase/firebaseConfig";
import { collection, getDocs, doc, runTransaction } from "firebase/firestore";
import { FaTrash, FaPlus, FaMinus, FaMoneyBillWave, FaCreditCard, FaExchangeAlt, FaArrowLeft, FaShoppingCart, FaTimes, FaBoxOpen, FaEdit } from 'react-icons/fa';
import POSModal from "./POSModal";
import "./POSManager.css";
import { syncChildProducts } from '../utils/stockUtils';
import StockAdjustmentModal from './StockAdjustmentModal';

interface Product {
    id: string;
    nombre: string;
    precio: number;
    categoria: string;
    img?: string;
    stock: boolean;
    stockQuantity?: number;
    variants?: {
        name: string;
        stockQuantity?: number;
        stock?: boolean;
        image?: string;
    }[];
    unitType?: 'unit' | 'weight';
    wholesalePrice?: number;
    stockDependency?: any;
    isHiddenInPOS?: boolean;
}

interface CartItem extends Product {
    quantity: number;
    selectedVariant?: string;
}

interface ModalState {
    isOpen: boolean;
    type: 'success' | 'error';
    title: string;
    message?: string;
    content?: React.ReactNode;
    onConfirm?: () => void;
}

export default function POSManager() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories] = useState<string[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("Todas");
    const [paymentMethod, setPaymentMethod] = useState<"Efectivo" | "Tarjeta" | "Transferencia">("Efectivo");
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);

    // Weight Logic State
    const [weightModalOpen, setWeightModalOpen] = useState(false);
    const [pendingProduct, setPendingProduct] = useState<{ product: Product, variant?: string } | null>(null);
    const [weightInput, setWeightInput] = useState("");
    const [priceInput, setPriceInput] = useState(""); // Local state for price typing
    const [smartInputUsed, setSmartInputUsed] = useState(false);
    const [inputMode, setInputMode] = useState<'weight' | 'price'>('weight'); // 'weight' or 'price'
    const [priceMode, setPriceMode] = useState<'public' | 'wholesale'>('public'); // Pricing mode

    // Cart Visibility (Mobile: Toggle View, Desktop: Slider)
    const [isCartOpen, setIsCartOpen] = useState(false);

    // Generic Modal State
    const [modalConfig, setModalConfig] = useState<ModalState>({
        isOpen: false,
        type: 'success',
        title: ''
    });

    // Stock Adjustment Modal in POS
    // Stock Adjustment Modal in POS
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [stockModalProduct, setStockModalProduct] = useState<Product | null>(null);
    const [stockModalVariant, setStockModalVariant] = useState<string | undefined>(undefined);

    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            // Ignorar si el foco ya está en un input
            const tag = document.activeElement?.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            // Ignorar si hay modales abiertos
            if (weightModalOpen || isStockModalOpen || modalConfig.isOpen) return;

            // Detectar letras/números (length 1) - ignorar teclas especiales
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [weightModalOpen, isStockModalOpen, modalConfig.isOpen]);

    const closeModal = () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
    };

    const showModal = (type: 'success' | 'error', title: string, message?: string, onConfirm?: () => void, content?: React.ReactNode) => {
        setModalConfig({
            isOpen: true,
            type,
            title,
            message,
            onConfirm,
            content
        });
    };

    const handleStockError = (product: Product, message: string) => {
        showModal(
            'error',
            'Stock Insuficiente',
            undefined,
            undefined,
            <div style={{ textAlign: 'center' }}>
                <p style={{ marginBottom: '15px' }}>{message}</p>
                <button
                    className="btn-save-stock"
                    style={{ background: '#f59e0b', width: '100%', padding: '10px', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => {
                        closeModal();
                        setStockModalProduct(product);
                        setIsStockModalOpen(true);
                    }}
                >
                    <FaBoxOpen style={{ marginRight: '8px' }} />
                    Corregir / Agregar Stock
                </button>
            </div>
        );
    };

    useEffect(() => {
        fetchProducts();
        // fetchCategories(); // Assuming this function exists elsewhere or needs to be called.
    }, []);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "products"));
            const prods: Product[] = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Product));
            setProducts(prods);
        } catch (error) {
            console.error("Error fetching products:", error);
        } finally {
            setLoading(false);
        }
    };

    // const fetchCategories = async () => {
    //     try {
    //         const querySnapshot = await getDocs(collection(db, "categories"));
    //         const cats = querySnapshot.docs.map(doc => doc.data().name);
    //         setCategories(["Todas", ...cats]);
    //     } catch (error) {
    //         console.error("Error fetching categories:", error);
    //     }
    // };

    const confirmWeight = () => {
        if (!pendingProduct || !weightInput) return;
        let qty = parseFloat(weightInput);
        if (isNaN(qty) || qty <= 0) return;

        // Enforce max 3 decimals
        qty = Math.round(qty * 1000) / 1000;

        const { product, variant } = pendingProduct;

        // Stock Check for Weight
        let maxStock = 0;
        if (variant && product.variants) {
            const v = product.variants.find((v: any) => v.name === variant);
            maxStock = v ? (v.stockQuantity || 0) : 0;
        } else {
            maxStock = product.stockQuantity || 0;
        }

        // Check if existing
        const existing = cart.find(item => item.id === product.id && item.selectedVariant === variant);
        const currentQty = existing ? existing.quantity : 0;

        if (currentQty + qty > maxStock) {
            setWeightModalOpen(false);
            handleStockError(product, `Solo hay ${maxStock}kg disponibles (intentas llevar ${(currentQty + qty).toFixed(3)}kg).`);
            return;
        }

        setCart(prev => {
            if (existing) {
                return prev.map(item =>
                    (item.id === product.id && item.selectedVariant === variant)
                        ? { ...item, quantity: item.quantity + qty }
                        : item
                );
            }
            return [...prev, { ...product, quantity: qty, selectedVariant: variant }];
        });

        setWeightModalOpen(false);
        setPendingProduct(null);
        setWeightInput("");
    };

    const addToCart = (product: Product, variantName?: string) => {
        // Determine Price to use
        const priceToUse = priceMode === 'wholesale'
            ? (product.wholesalePrice || product.precio)
            : product.precio;

        // Stock Check
        let maxStock = 0;
        if (variantName && product.variants) {
            const v = product.variants.find((v: any) => v.name === variantName);
            maxStock = v ? (v.stockQuantity || 0) : 0;
        } else {
            maxStock = product.stockQuantity || 0;
        }

        if (maxStock <= 0) {
            handleStockError(product, "No hay stock disponible de este producto.");
            return;
        }

        // Weight Logic
        if (product.unitType === 'weight') {
            setPendingProduct({ product, variant: variantName });
            setWeightInput("");
            setPriceInput("");
            setSmartInputUsed(false);
            setInputMode('weight');
            setWeightModalOpen(true);
            // We don't use confirmWeight here directly, we open the modal.
            // The modal will call confirmWeight.
            return;
        }

        setCart(prev => {
            const existing = prev.find(item => item.id === product.id && item.selectedVariant === variantName);
            if (existing) {
                if (existing.quantity >= maxStock) {
                    handleStockError(product, "No hay más unidades disponibles de este producto.");
                    return prev;
                }
                return prev.map(item =>
                    (item.id === product.id && item.selectedVariant === variantName)
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, { ...product, quantity: 1, selectedVariant: variantName, precio: priceToUse }];
        });
    };

    const updateQuantity = (id: string, variantName: string | undefined, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id && item.selectedVariant === variantName) {
                // Check Max Stock for increment
                if (delta > 0) {
                    let maxStock = 0;
                    if (variantName && item.variants) {
                        const v = item.variants.find((v: any) => v.name === variantName);
                        maxStock = v?.stockQuantity || 0;
                    } else {
                        maxStock = item.stockQuantity || 0;
                    }

                    if (item.quantity >= maxStock) {
                        handleStockError(item, "No puedes agregar más unidades de las que hay en stock.");
                        return item;
                    }
                }

                return { ...item, quantity: Math.max(1, item.quantity + delta) };
            }
            return item;
        }));
    };

    const removeFromCart = (id: string, variantName: string | undefined) => {
        setCart(prev => prev.filter(item => !(item.id === id && item.selectedVariant === variantName)));
    };

    const total = useMemo(() => {
        return cart.reduce((acc, item) => acc + (item.precio * item.quantity), 0);
    }, [cart]);

    // Effect to update cart prices when mode changes
    useEffect(() => {
        setCart(prev => prev.map(item => {
            // Find original product to get prices
            const original = products.find(p => p.id === item.id);
            if (!original) return item;

            const newPrice = priceMode === 'wholesale'
                ? (original.wholesalePrice || original.precio)
                : original.precio;

            return { ...item, precio: newPrice };
        }));
    }, [priceMode, products]);

    const handleCheckout = async () => {
        if (cart.length === 0) return;
        setProcessing(true);

        try {
            const updates = await runTransaction(db, async (transaction) => {
                // 1. Identify all products to read (Items + Parents for dependencies)
                const productIdsToRead = new Set<string>();
                cart.forEach(item => {
                    productIdsToRead.add(item.id);
                    if (item.stockDependency?.productId) {
                        productIdsToRead.add(item.stockDependency.productId);
                    }
                });

                const uniqueIds = Array.from(productIdsToRead);
                const refs = uniqueIds.map(id => doc(db, "products", id));
                const docsSnap = await Promise.all(refs.map(ref => transaction.get(ref)));

                const productDataMap: Record<string, any> = {};
                docsSnap.forEach((d, i) => {
                    if (d.exists()) productDataMap[uniqueIds[i]] = d.data();
                });

                const productsToUpdate = new Set<string>();

                // 2. Apply Deductions in Memory
                for (const item of cart) {
                    const itemDoc = productDataMap[item.id];
                    if (!itemDoc) throw `Producto ${item.nombre} no encontrado`;

                    // CASE A: Derived Product (Pack) -> Deduct from Parent
                    if (itemDoc.stockDependency?.productId) {
                        const parentId = itemDoc.stockDependency.productId;
                        const parentDoc = productDataMap[parentId];

                        // Only proceed if parent exists
                        if (parentDoc) {
                            const unitsToDeduct = itemDoc.stockDependency.unitsToDeduct || 1;
                            const totalDeduct = item.quantity * unitsToDeduct;

                            // Decrease Parent Stock
                            const currentStock = parentDoc.stockQuantity || 0;
                            parentDoc.stockQuantity = Math.max(0, currentStock - totalDeduct);
                            parentDoc.stock = parentDoc.stockQuantity > 0;

                            productsToUpdate.add(parentId);
                        }
                    }
                    // CASE B: Standard Product (or Variant) -> Deduct from Self
                    else {
                        if (item.selectedVariant && itemDoc.variants) {
                            const vIdx = itemDoc.variants.findIndex((v: any) => v.name === item.selectedVariant);
                            if (vIdx >= 0) {
                                const variant = itemDoc.variants[vIdx];
                                const currentStock = variant.stockQuantity || 0;
                                variant.stockQuantity = Math.max(0, currentStock - item.quantity);
                                variant.stock = variant.stockQuantity > 0;
                                productsToUpdate.add(item.id);
                            }
                        } else {
                            const currentStock = itemDoc.stockQuantity || 0;
                            itemDoc.stockQuantity = Math.max(0, currentStock - item.quantity);
                            itemDoc.stock = itemDoc.stockQuantity > 0;
                            productsToUpdate.add(item.id);
                        }
                    }
                }

                // 3. Write Updates to Firestore
                productsToUpdate.forEach(pid => {
                    const newData = productDataMap[pid];
                    transaction.update(doc(db, "products", pid), {
                        stockQuantity: newData.stockQuantity,
                        stock: newData.stock,
                        variants: newData.variants || []
                    });
                });

                // 4. Create Order
                const orderRef = doc(collection(db, "orders"));
                const orderData = {
                    items: cart.map(item => ({
                        id: item.id,
                        name: item.nombre,
                        price: item.precio,
                        quantity: item.quantity,
                        variant: item.selectedVariant || null
                    })),
                    total: total,
                    cliente: {
                        nombre: "Cliente Local",
                        direccion: "Local Físico",
                        telefono: "",
                        metodoPago: paymentMethod
                    },
                    date: new Date(),
                    status: "entregado", // POS orders are completed immediately
                    source: priceMode === 'public' ? 'pos_public' : 'pos_wholesale'
                };
                transaction.set(orderRef, orderData);

                // 5. Log Movements
                cart.forEach(item => {
                    const moveRef = doc(collection(db, "stock_movements"));
                    const movementData = {
                        productId: item.id,
                        productName: item.nombre,
                        type: 'OUT',
                        quantity: item.quantity,
                        reason: 'Venta POS',
                        observation: `Venta Local${item.selectedVariant ? ` (Var: ${item.selectedVariant})` : ''}`,
                        date: new Date()
                    };
                    transaction.set(moveRef, movementData);
                });

                return Array.from(productsToUpdate).map(id => ({ id, newStock: productDataMap[id].stockQuantity }));
            });

            // Sync Child Products (Derived Stock)
            if (updates && updates.length > 0) {
                await Promise.all(updates.map(u => syncChildProducts(u.id, u.newStock)));
            }

            // Show Success Modal
            showModal(
                'success',
                '¡Venta Registrada!',
                undefined,
                undefined,
                <p className="pos-modal-total">Total: ${total}</p>
            );

            setCart([]);
            setIsCartOpen(false);
            fetchProducts();
        } catch (error) {
            console.error("Checkout error:", error);
            showModal('error', 'Error en la Venta', 'Ocurrió un error al procesar la venta. Por favor verifique el stock e intente nuevamente.');
        } finally {
            setProcessing(false);
        }
    };

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === "Todas" || p.categoria === selectedCategory;
        const visibleInPos = !p.isHiddenInPOS;
        return matchesSearch && matchesCategory && visibleInPos;
    });

    return (
        <div className="pos-container">
            {/* Products Section */}
            <div className={`pos-products-section ${isCartOpen ? 'mobile-only-hidden' : ''}`}>

                <div className="pos-header-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h2 style={{ margin: 0 }}>POS</h2>
                    <button
                        onClick={() => setPriceMode(prev => prev === 'public' ? 'wholesale' : 'public')}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '20px',
                            border: 'none',
                            background: priceMode === 'wholesale' ? '#8b5cf6' : '#e5e7eb',
                            color: priceMode === 'wholesale' ? 'white' : '#374151',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                        }}
                    >
                        {priceMode === 'public' ? '🛒 Público' : '🏢 Despensa'}
                    </button>
                </div>

                <div className="pos-search-bar" style={{ padding: '0', background: 'transparent', boxShadow: 'none' }}>
                    <ProductSearch
                        ref={searchInputRef}
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Buscar productos en POS..."
                    />
                </div>

                <div className="pos-categories">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            className={`pos-category-btn ${selectedCategory === cat ? 'active' : ''}`}
                            onClick={() => setSelectedCategory(cat)}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="pos-products-grid">
                    {loading ? (
                        <div style={{ padding: '20px', textAlign: 'center', width: '100%' }}>Cargando productos...</div>
                    ) : filteredProducts.map(product => {
                        // Logic to handle variants presentation could be complex.
                        // For simplicity, if variants exist, show them as separate "cards" or require modal.
                        // Here: If variants, showing just the main card opens a mini-selector (simplified for MVP: default to main or show variants if any)

                        if (product.variants && product.variants.length > 0) {
                            return product.variants.map((v) => (
                                <div key={`${product.id}-${v.name}`} className="pos-product-card" onClick={() => addToCart(product, v.name)}>
                                    <img src={v.image || product.img} alt={product.nombre} className="pos-product-img" />
                                    <div className="pos-product-info">
                                        <div className="pos-product-name">{product.nombre} ({v.name})</div>
                                        <div className="pos-product-price">
                                            ${priceMode === 'wholesale' ? (product.wholesalePrice || product.precio) : product.precio}
                                        </div>
                                        <div className={`pos-product-stock ${v.stockQuantity && v.stockQuantity < 5 ? 'low' : ''}`}>
                                            Stock: {v.stockQuantity ?? 0}
                                        </div>
                                    </div>
                                    <button
                                        className="btn-quick-stock-edit"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // Create a temp product object representing this variant as a standalone for the modal if needed, 
                                            // OR better: pass the main product and pre-select the variant in the modal.
                                            // The modal supports selecting variant. But we want to pre-select if possible?
                                            // Current modal doesn't seem to support pre-selected variant prop easily without mod.
                                            // Let's pass the main product. The user can select the variant inside, OR we improve modal later.
                                            // Actually, standardizing on passing main product is safer.
                                            // Actually, standardizing on passing main product is safer.
                                            setStockModalProduct(product);
                                            setStockModalVariant(v.name);
                                            setIsStockModalOpen(true);
                                        }}
                                        title="Ajustar Stock"
                                    >
                                        <FaEdit size={12} /> Stock
                                    </button>
                                </div>
                            ));
                        }

                        return (
                            <div key={product.id} className="pos-product-card" onClick={() => addToCart(product)}>
                                <img src={product.img} alt={product.nombre} className="pos-product-img" />
                                <div className="pos-product-info">
                                    <div className="pos-product-name">{product.nombre}</div>
                                    <div className="pos-product-price">
                                        ${priceMode === 'wholesale' ? (product.wholesalePrice || product.precio) : product.precio}
                                    </div>
                                    <div className={`pos-product-stock ${product.stockQuantity && product.stockQuantity < 5 ? 'low' : ''}`}>
                                        Stock: {product.stockQuantity ?? 0}
                                    </div>
                                </div>
                                <button
                                    className="btn-quick-stock-edit"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setStockModalProduct(product);
                                        setStockModalVariant(undefined);
                                        setIsStockModalOpen(true);
                                    }}
                                    title="Ajustar Stock"
                                >
                                    <FaEdit size={12} /> Stock
                                </button>
                            </div>
                        );
                    })}
                </div>


                {/* Mobile Footer Summary (Only visible on mobile when viewing products) */}
                <div className="pos-mobile-footer-summary" onClick={() => setIsCartOpen(true)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaShoppingCart />
                        <span>{cart.reduce((a, b) => a + b.quantity, 0)} items</span>
                    </div>
                    <div style={{ fontWeight: 'bold' }}>
                        ${total}
                    </div>
                    <button className="pos-mobile-view-cart-btn">
                        Ver Carrito
                    </button>
                </div>
            </div>

            {/* Cart Section - Slider on Desktop, Full View on Mobile */}
            <div className={`pos-cart-section ${isCartOpen ? 'open' : ''} ${!isCartOpen ? 'mobile-only-hidden' : ''}`}>
                <div className="pos-cart-header">
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                        {/* Mobile Back Button */}
                        <button className="pos-back-btn mobile-only-visible" onClick={() => setIsCartOpen(false)}>
                            <FaArrowLeft /> Volver
                        </button>

                        <h3 style={{ margin: 0 }}>Ticket de Venta</h3>

                        {/* Desktop Close Button */}
                        <button
                            className="pos-close-slider-btn desktop-only-visible"
                            onClick={() => setIsCartOpen(false)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '5px' }}
                        >
                            <FaTimes />
                        </button>
                    </div>
                </div>

                <div className="pos-cart-items">
                    {cart.map((item) => (
                        <div key={`${item.id}-${item.selectedVariant || 'base'}`} className="pos-cart-item">
                            <div className="pos-item-details">
                                <span className="pos-item-name">{item.nombre} {item.selectedVariant ? `(${item.selectedVariant})` : ''}</span>
                                <span className="pos-item-price">${item.precio} x {item.unitType === 'weight' ? item.quantity.toFixed(3) : item.quantity} = ${(item.precio * item.quantity).toFixed(2)}</span>
                            </div>
                            <div className="pos-item-controls">
                                <button className="btn-qty" onClick={() => updateQuantity(item.id, item.selectedVariant, -1)}><FaMinus size={10} /></button>
                                <span>{item.quantity}</span>
                                <button className="btn-qty" onClick={() => updateQuantity(item.id, item.selectedVariant, 1)}><FaPlus size={10} /></button>
                                <button className="btn-remove" onClick={() => removeFromCart(item.id, item.selectedVariant)}><FaTrash /></button>
                            </div>
                        </div>
                    ))}
                    {cart.length === 0 && <p style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>Carrito vacío</p>}
                </div>

                <div className="pos-cart-footer">
                    <div className="pos-total-row">
                        <span>Total:</span>
                        <span>${total}</span>
                    </div>

                    <div className="pos-payment-methods">
                        <button
                            className={`payment-btn ${paymentMethod === 'Efectivo' ? 'active' : ''}`}
                            onClick={() => setPaymentMethod('Efectivo')}
                        >
                            <FaMoneyBillWave /> Efectivo
                        </button>
                        <button
                            className={`payment-btn ${paymentMethod === 'Tarjeta' ? 'active' : ''}`}
                            onClick={() => setPaymentMethod('Tarjeta')}
                        >
                            <FaCreditCard /> Tarjeta
                        </button>
                        <button
                            className={`payment-btn ${paymentMethod === 'Transferencia' ? 'active' : ''}`}
                            onClick={() => setPaymentMethod('Transferencia')}
                        >
                            <FaExchangeAlt /> Transf.
                        </button>
                    </div>

                    <button
                        className="btn-checkout"
                        onClick={handleCheckout}
                        disabled={cart.length === 0 || processing}
                    >
                        {processing ? 'Procesando...' : 'Confirmar Venta'}
                    </button>
                </div>
            </div>

            {/* Desktop Floating Cart Trigger (FAB) */}
            {
                cart.length > 0 && !isCartOpen && (
                    <button
                        className="pos-fab-cart desktop-only-visible"
                        onClick={() => setIsCartOpen(true)}
                    >
                        <FaShoppingCart />
                        <span className="pos-fab-badge">{cart.reduce((a, b) => a + b.quantity, 0)}</span>
                    </button>
                )
            }

            {/* Overlay for Desktop Slider */}
            {
                isCartOpen && (
                    <div className="pos-slider-overlay desktop-only-visible" onClick={() => setIsCartOpen(false)}></div>
                )
            }

            {/* Global POS Modal */}
            <POSModal
                isOpen={modalConfig.isOpen}
                onClose={closeModal}
                type={modalConfig.type}
                title={modalConfig.title}
                message={modalConfig.message}
            >
                {modalConfig.content}
            </POSModal>

            {/* Weight Input Modal */}
            {
                weightModalOpen && (
                    <div className="pos-modal-overlay">
                        <div className="pos-modal">
                            <h3>Cantidad (Kg)</h3>
                            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <input
                                        type="number"
                                        autoFocus
                                        value={weightInput}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (inputMode === 'price') return; // Should not happen if overlay covers, but good safety

                                            if (!smartInputUsed && val.length === 1 && /^[1-9]$/.test(val)) {
                                                setWeightInput("0." + val);
                                                setSmartInputUsed(true);
                                            } else {
                                                setWeightInput(val);
                                                setSmartInputUsed(true);
                                            }
                                        }}
                                        onFocus={() => setInputMode('weight')}
                                        onKeyDown={(e) => { if (e.key === 'Enter') confirmWeight(); }}
                                        placeholder="0.000"
                                        step="0.005"
                                        min="0"
                                        style={{
                                            fontSize: '2rem',
                                            width: '150px',
                                            padding: '10px',
                                            textAlign: 'center',
                                            borderRadius: '10px',
                                            border: '1px solid #ddd',
                                            opacity: inputMode === 'price' ? 0.5 : 1
                                        }}
                                    />
                                    <span style={{ fontSize: '1.2rem', color: '#666' }}>Kg</span>
                                </div>

                                {/* Dynamic Price Display - Clickable */}
                                {/* Dynamic Price Display - Clickable */}
                                {pendingProduct && (
                                    <div
                                        style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2ecc71', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                                        onClick={() => {
                                            if (inputMode === 'price') return;
                                            setInputMode('price');
                                            // Initialize price input (Integer for Argentina)
                                            if (weightInput && !isNaN(parseFloat(weightInput))) {
                                                const currentPrice = parseFloat(weightInput) * (priceMode === 'wholesale' ? (pendingProduct.product.wholesalePrice || pendingProduct.product.precio) : pendingProduct.product.precio);
                                                setPriceInput(Math.round(currentPrice).toString());
                                            } else {
                                                setPriceInput("");
                                            }
                                        }}
                                    >
                                        <span>$</span>
                                        {inputMode === 'weight' ? (
                                            <span>
                                                {(weightInput && !isNaN(parseFloat(weightInput)))
                                                    ? Math.round(parseFloat(weightInput) * (priceMode === 'wholesale' ? (pendingProduct.product.wholesalePrice || pendingProduct.product.precio) : pendingProduct.product.precio)).toString()
                                                    : "0"}
                                            </span>
                                        ) : (
                                            <input
                                                type="number"
                                                autoFocus
                                                value={priceInput}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setPriceInput(val);

                                                    if (val === "") {
                                                        setWeightInput("");
                                                        return;
                                                    }

                                                    const priceToUse = priceMode === 'wholesale' ? (pendingProduct.product.wholesalePrice || pendingProduct.product.precio) : pendingProduct.product.precio;
                                                    const priceVal = parseFloat(val);

                                                    if (!isNaN(priceVal) && priceToUse > 0) {
                                                        const newWeight = priceVal / priceToUse;
                                                        // Keep 3 decimals for weight precision derived from price
                                                        setWeightInput(newWeight.toFixed(3));
                                                    }
                                                }}
                                                placeholder="0"
                                                step="1"
                                                style={{
                                                    fontSize: '1.5rem',
                                                    fontWeight: 'bold',
                                                    color: '#2ecc71',
                                                    width: '120px',
                                                    border: 'none',
                                                    borderBottom: '2px solid #2ecc71',
                                                    outline: 'none',
                                                    textAlign: 'center'
                                                }}
                                            />
                                        )}
                                    </div>
                                )}

                                <div style={{ width: '100%', padding: '0 20px' }}>
                                    {(() => {
                                        let maxStock = 10;
                                        if (pendingProduct) {
                                            const { product, variant } = pendingProduct;
                                            if (variant && product.variants) {
                                                const v = product.variants.find((v: any) => v.name === variant);
                                                maxStock = v ? (v.stockQuantity || 0) : 0;
                                            } else {
                                                maxStock = product.stockQuantity || 0;
                                            }
                                            const existing = cart.find(item => item.id === product.id && item.selectedVariant === variant);
                                            if (existing) maxStock -= existing.quantity;
                                            maxStock = Math.max(0, maxStock);
                                        }

                                        return (
                                            <>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max={maxStock}
                                                    step="0.005"
                                                    value={weightInput || 0}
                                                    onChange={(e) => setWeightInput(e.target.value)}
                                                    className="pos-weight-slider"
                                                    style={{ width: '100%', cursor: 'pointer', margin: '15px 0' }}
                                                />
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '0.8rem', marginTop: '5px' }}>
                                                    <span>0kg</span>
                                                    <span>{(maxStock * 0.25).toFixed(2)}kg</span>
                                                    <span>{(maxStock * 0.5).toFixed(2)}kg</span>
                                                    <span>{(maxStock * 0.75).toFixed(2)}kg</span>
                                                    <span>{maxStock.toFixed(2)}kg</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    className="pos-modal-btn"
                                    style={{ background: '#ddd', color: '#333' }}
                                    onClick={() => setWeightModalOpen(false)}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className="pos-modal-btn"
                                    onClick={confirmWeight}
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Stock Adjustment Modal */}
            <StockAdjustmentModal
                isOpen={isStockModalOpen}
                onClose={() => setIsStockModalOpen(false)}
                product={stockModalProduct}
                initialVariantName={stockModalVariant}
                onSuccess={() => {
                    fetchProducts();
                    // Optionally reopen cart or something, but usually just refreshing is enough.
                }}
            />
        </div >
    );
}
