import { useState, useEffect, useMemo } from 'react';
import { db } from "../firebase/firebaseConfig";
import { collection, getDocs, doc, runTransaction } from "firebase/firestore";
import { FaTrash, FaPlus, FaMinus, FaMoneyBillWave, FaCreditCard, FaExchangeAlt, FaArrowLeft, FaShoppingCart } from 'react-icons/fa';
import POSModal from "./POSModal";
import "./POSManager.css";

interface Product {
    id: string;
    nombre: string;
    precio: number;
    categoria: string;
    img: string;
    stock: boolean;
    stockQuantity?: number;
    variants?: any[];
    unitType?: 'unit' | 'weight';
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
}

export default function POSManager() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
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

    // Mobile View Toggle
    const [showMobileCart, setShowMobileCart] = useState(false);

    // Generic Modal State
    const [modalConfig, setModalConfig] = useState<ModalState>({
        isOpen: false,
        type: 'success',
        title: '',
        message: ''
    });

    const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

    const showModal = (type: 'success' | 'error', title: string, message?: string, content?: React.ReactNode) => {
        setModalConfig({
            isOpen: true,
            type,
            title,
            message,
            content
        });
    };

    useEffect(() => {
        fetchProducts();
        fetchCategories();
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

    const fetchCategories = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "categories"));
            const cats = querySnapshot.docs.map(doc => doc.data().name);
            setCategories(["Todas", ...cats]);
        } catch (error) {
            console.error("Error fetching categories:", error);
        }
    };

    const confirmWeight = () => {
        if (!pendingProduct || !weightInput) return;
        const qty = parseFloat(weightInput);
        if (isNaN(qty) || qty <= 0) return;

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
            showModal('error', 'Stock Insuficiente', `Solo hay ${maxStock}kg disponibles (intentas llevar ${(currentQty + qty).toFixed(3)}kg).`);
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
        // Stock Check
        let maxStock = 0;
        if (variantName && product.variants) {
            const v = product.variants.find((v: any) => v.name === variantName);
            maxStock = v ? (v.stockQuantity || 0) : 0;
        } else {
            maxStock = product.stockQuantity || 0;
        }

        if (maxStock <= 0) {
            showModal('error', 'Sin Stock', 'No hay stock disponible de este producto.');
            return;
        }

        // Weight Logic
        if (product.unitType === 'weight') {
            setPendingProduct({ product, variant: variantName });
            setWeightInput("");
            setWeightModalOpen(true);
            // We don't use confirmWeight here directly, we open the modal.
            // The modal will call confirmWeight.
            return;
        }

        setCart(prev => {
            const existing = prev.find(item => item.id === product.id && item.selectedVariant === variantName);
            if (existing) {
                if (existing.quantity >= maxStock) {
                    showModal('error', 'Stock Insuficiente', 'No hay más unidades disponibles de este producto.');
                    return prev;
                }
                return prev.map(item =>
                    (item.id === product.id && item.selectedVariant === variantName)
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, { ...product, quantity: 1, selectedVariant: variantName }];
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
                        showModal('error', 'Límite Alcanzado', 'No puedes agregar más unidades de las que hay en stock.');
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

    const handleCheckout = async () => {
        if (cart.length === 0) return;
        setProcessing(true);

        try {
            await runTransaction(db, async (transaction) => {
                // 1. Read all product docs involved
                const productRefs = cart.map(item => ({
                    ref: doc(db, "products", item.id),
                    item
                }));

                // Deduplicate refs if multiple variants of same product
                const uniqueRefs = Array.from(new Set(productRefs.map(p => p.item.id)))
                    .map(id => productRefs.find(p => p.item.id === id)!);

                const productDocs = await Promise.all(uniqueRefs.map(p => transaction.get(p.ref)));
                const productMap = new Map();
                productDocs.forEach((docSnap, index) => {
                    if (!docSnap.exists()) throw "Product does not exist";
                    productMap.set(uniqueRefs[index].item.id, docSnap.data());
                });

                // 2. Prepare Updates
                for (const item of cart) {
                    const data = productMap.get(item.id);

                    if (item.selectedVariant) {
                        const variants = [...data.variants];
                        const variantIdx = variants.findIndex((v: any) => v.name === item.selectedVariant);
                        if (variantIdx >= 0) {
                            const newStock = Math.max(0, (variants[variantIdx].stockQuantity || 0) - item.quantity);
                            variants[variantIdx].stockQuantity = newStock;
                            variants[variantIdx].stock = newStock > 0;
                            transaction.update(doc(db, "products", item.id), { variants });
                        }
                    } else {
                        const newStock = Math.max(0, (data.stockQuantity || 0) - item.quantity);
                        transaction.update(doc(db, "products", item.id), {
                            stockQuantity: newStock,
                            stock: newStock > 0
                        });
                    }
                }

                // 3. Create Order
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
                    source: "pos"
                };

                const orderRef = doc(collection(db, "orders"));
                transaction.set(orderRef, orderData);

                // 4. Log Stock Movements within transaction?
                // Firestore transactions require reads before writes. Logging relies on creating new docs.
                // We can do writes to new docs in transaction without reading them.

                // For each item, create a movement log
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
            });

            // Show Success Modal
            showModal(
                'success',
                '¡Venta Registrada!',
                undefined,
                <p className="pos-modal-total">Total: ${total}</p>
            );

            setCart([]);
            setShowMobileCart(false); // Return to products after sale on mobile
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
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="pos-container">
            {/* Products Section */}
            <div className={`pos-products-section ${showMobileCart ? 'mobile-hidden' : ''}`}>
                <div className="pos-search-bar">
                    <input
                        placeholder="Buscar productos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
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
                                    <img src={product.img} alt={product.nombre} className="pos-product-img" />
                                    <div className="pos-product-info">
                                        <div className="pos-product-name">{product.nombre} ({v.name})</div>
                                        <div className="pos-product-price">${product.precio}</div>
                                        <div className={`pos-product-stock ${v.stockQuantity && v.stockQuantity < 5 ? 'low' : ''}`}>
                                            Stock: {v.stockQuantity ?? 0}
                                        </div>
                                    </div>
                                </div>
                            ));
                        }

                        return (
                            <div key={product.id} className="pos-product-card" onClick={() => addToCart(product)}>
                                <img src={product.img} alt={product.nombre} className="pos-product-img" />
                                <div className="pos-product-info">
                                    <div className="pos-product-name">{product.nombre}</div>
                                    <div className="pos-product-price">${product.precio}</div>
                                    <div className={`pos-product-stock ${product.stockQuantity && product.stockQuantity < 5 ? 'low' : ''}`}>
                                        Stock: {product.stockQuantity ?? 0}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>


                {/* Mobile Footer Summary (Only visible on mobile when viewing products) */}
                <div className="pos-mobile-footer-summary" onClick={() => setShowMobileCart(true)}>
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

            {/* Cart Section */}
            <div className={`pos-cart-section ${!showMobileCart ? 'mobile-hidden' : ''}`}>
                <div className="pos-cart-header">
                    {showMobileCart && (
                        <button className="pos-back-btn" onClick={() => setShowMobileCart(false)}>
                            <FaArrowLeft /> Volver
                        </button>
                    )}
                    <h3>Ticket de Venta</h3>
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
                                        onChange={(e) => setWeightInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') confirmWeight(); }}
                                        placeholder="0.000"
                                        step="0.005"
                                        min="0"
                                        style={{ fontSize: '2rem', width: '150px', padding: '10px', textAlign: 'center', borderRadius: '10px', border: '1px solid #ddd' }}
                                    />
                                    <span style={{ fontSize: '1.2rem', color: '#666' }}>Kg</span>
                                </div>

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
        </div >
    );
}
