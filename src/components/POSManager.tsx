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
    shortId?: string;
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
        shortId?: string;
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

    // Quantity Modal for Short ID (Unit products)
    const [quantityModalOpen, setQuantityModalOpen] = useState(false);
    const [quantityInput, setQuantityInput] = useState("");

    // Cart Visibility (Mobile: Toggle View, Desktop: Slider)
    const [isCartOpen, setIsCartOpen] = useState(false);

    // Generic Modal State
    const [modalConfig, setModalConfig] = useState<ModalState>({
        isOpen: false,
        type: 'success',
        title: ''
    });

    // Stock Adjustment Modal in POS
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [stockModalProduct, setStockModalProduct] = useState<Product | null>(null);
    const [stockModalVariant, setStockModalVariant] = useState<string | undefined>(undefined);
    const [stockModalInitialValue, setStockModalInitialValue] = useState<number | undefined>(undefined);
    const [pendingRetry, setPendingRetry] = useState<{ type: 'unit' | 'weight', productId: string, variant?: string, quantity?: number, priceToUse?: number } | null>(null);

    // Short ID Input Buffer
    // Short ID Input Buffer
    const [inputBuffer, setInputBuffer] = useState("");
    const [showBuffer, setShowBuffer] = useState(false);
    const inputTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const quantityInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const weightInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            // Handle Weight Modal Toggle (Arrows)
            if (weightModalOpen && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                setInputMode(prev => prev === 'weight' ? 'price' : 'weight');
                return;
            }

            // Handle Escape ALWAYS (Priority handling)
            if (e.key === 'Escape') {
                // 1. Close Quantity Modal
                if (quantityModalOpen) {
                    setQuantityModalOpen(false);
                    setPendingProduct(null);
                    return;
                }

                if (weightModalOpen) {
                    setWeightModalOpen(false);
                    setPendingProduct(null);
                    setWeightInput("");
                    return;
                }

                // 2. Close Stock Modal
                if (isStockModalOpen) {
                    setIsStockModalOpen(false);
                    return;
                }

                // 3. Close Generic Modal
                if (modalConfig.isOpen) {
                    closeModal();
                    return;
                }

                // 4. Close Cart
                if (isCartOpen) {
                    setIsCartOpen(false);
                    return;
                }

                // 5. Blur Search Input
                if (document.activeElement === searchInputRef.current) {
                    searchInputRef.current?.blur();
                    return;
                }

                // 6. Clear Short ID Buffer
                if (inputBuffer.length > 0) {
                    setInputBuffer("");
                    setShowBuffer(false);
                    return;
                }

                return;
            }

            // Handle Enter for Modals (Priority)
            if (e.key === 'Enter') {
                // If Success Modal is open, Enter closes it (New Sale)
                if (modalConfig.isOpen && modalConfig.type === 'success') {
                    closeModal();
                    return;
                }

                // Generic Modal Confirm
                if (modalConfig.isOpen && modalConfig.onConfirm) {
                    e.preventDefault();
                    modalConfig.onConfirm();
                    return;
                }
            }

            // Handle Cart Navigation (If Cart is Open)
            if (isCartOpen) {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    setPaymentMethod((prev) => {
                        const methods: ("Efectivo" | "Tarjeta" | "Transferencia")[] = ['Efectivo', 'Tarjeta', 'Transferencia'];
                        const currentIndex = methods.indexOf(prev);
                        let newIndex = e.key === 'ArrowRight' ? currentIndex + 1 : currentIndex - 1;
                        if (newIndex >= methods.length) newIndex = 0;
                        if (newIndex < 0) newIndex = methods.length - 1;
                        return methods[newIndex];
                    });
                    return;
                }

                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (cart.length > 0 && !processing) {
                        handleCheckout();
                    }
                    return;
                }
            }

            // Ignorar si el foco ya está en un input (para otras teclas)
            const tag = document.activeElement?.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            // Ignorar si hay modales abiertos
            if (isStockModalOpen || modalConfig.isOpen || quantityModalOpen) return;

            // Note: weightModalOpen handled above in priority section now? No, let's look at where we are.
            // Oh, I need to add it to the TOP priority section.
            // Wait, I am editing the logic below the early returns. 
            // I should actually add the specific handler in the top block of handleGlobalKeyDown.

            /* 
               Mistake in my plan: I need to edit the TOP of the function, 
               but this replace_file_content call was targeting lines around 168 which is the "Ignorar si hay modales abiertos" section.
               Actually, I should check the earlier part for the Escape handler.
               Let's do two edits.
            */

            // Handle Numeric Input for Short ID
            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                setInputBuffer(prev => prev + e.key);
                setShowBuffer(true);

                // Reset inactivity timer
                if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
                inputTimeoutRef.current = setTimeout(() => {
                    setShowBuffer(false);
                    // Optional: Clear buffer on timeout? Or keep until enter?
                    // User said "001 and enter". So keep it. Just hide overlay maybe?
                    // Let's keep overlay visible while typing.
                }, 3000);
                return;
            }

            // Handle Backspace (Buffer OR Cart)
            if (e.key === 'Backspace') {
                if (inputBuffer.length > 0) {
                    setInputBuffer(prev => prev.slice(0, -1));
                    if (inputBuffer.length <= 1) setShowBuffer(false);
                } else if (isCartOpen) {
                    if (cart.length > 0) {
                        // Remove last item or decrement quantity
                        setCart(prev => {
                            const newCart = [...prev];
                            const lastItem = newCart[newCart.length - 1];
                            if (lastItem.quantity > 1) {
                                // Decrement
                                newCart[newCart.length - 1] = { ...lastItem, quantity: lastItem.quantity - 1 };
                            } else {
                                // Remove
                                newCart.pop();
                            }
                            return newCart;
                        });
                    } else {
                        // If cart is empty, close it (User Request)
                        setIsCartOpen(false);
                    }
                }
                return;
            }

            // Handle Enter (Submit Code OR Open Cart OR Close Success Modal)
            if (e.key === 'Enter') {
                // Modal logic moved to top

                if (inputBuffer.length > 0) {
                    processShortId(inputBuffer);
                    setInputBuffer("");
                    setShowBuffer(false);
                } else {
                    // Open Cart if idle
                    setIsCartOpen(true);
                    searchInputRef.current?.blur();
                }
                return;
            }

            // Detectar letras (para búsqueda normal) - ignorar teclas especiales
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && !/^[0-9]$/.test(e.key)) {
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [weightModalOpen, isStockModalOpen, modalConfig, quantityModalOpen, inputBuffer, products, isCartOpen, cart, processing]);

    // Force focus on weight input when switching back to weight mode
    useEffect(() => {
        if (weightModalOpen && inputMode === 'weight' && weightInputRef.current) {
            weightInputRef.current.focus();
        }
    }, [inputMode, weightModalOpen]);

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

    const handleStockError = (product: Product, message: string, missingAmount?: number, retryAction?: any) => {
        const handleFix = () => {
            closeModal();
            setStockModalProduct(product);
            setStockModalInitialValue(missingAmount);
            if (retryAction) setPendingRetry(retryAction);
            setIsStockModalOpen(true);
        };

        showModal(
            'error',
            'Stock Insuficiente',
            undefined,
            handleFix,
            <div style={{ textAlign: 'center' }}>
                <p style={{ marginBottom: '15px' }}>{message}</p>
                <button
                    className="btn-save-stock"
                    onClick={handleFix}
                    style={{ background: '#f59e0b', width: '100%', padding: '10px', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <FaBoxOpen style={{ marginRight: '8px' }} />
                    Corregir / Agregar Stock
                </button>
            </div>
        );
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    const processShortId = (code: string) => {
        // 1. Check for Top Level Product
        let product = products.find(p => p.shortId === code);
        let variantName: string | undefined = undefined;

        // 2. If not found, check inside variants
        if (!product) {
            for (const p of products) {
                if (p.variants) {
                    const foundVariant = p.variants.find(v => v.shortId === code);
                    if (foundVariant) {
                        product = p;
                        variantName = foundVariant.name;
                        break;
                    }
                }
            }
        }

        if (product) {
            // If variant found, we must handle it specifically first (SKIP regular logic if variant found)
            if (variantName) {
                // If found a variant directly, add it to cart immediately
                // However, check stock of variant first
                const targetVariant = product.variants?.find(v => v.name === variantName);
                const currentStock = targetVariant?.stockQuantity || 0;

                if (currentStock <= 0) {
                    setStockModalProduct(product);
                    // We should ideally set the variant too for context, but current modal logic might need tweak
                    setStockModalVariant(variantName);
                    setIsStockModalOpen(true);
                    return;
                }

                // If weight type, open weight modal for that variant
                if (product.unitType === 'weight') {
                    // Need to open weight modal with variant pre-selected
                    // addToCart handles logic if we pass variantName
                    addToCart(product, variantName);
                    return;
                }

                // If unit type, open Quantity Modal with variant
                setPendingProduct({ product, variant: variantName });
                setQuantityInput("");
                setQuantityModalOpen(true);
                setTimeout(() => {
                    if (quantityInputRef.current) quantityInputRef.current.focus();
                }, 100);
                return;
            }

            // Check availability - logic mirror from addToCart
            const currentStock = product.stockQuantity || 0;

            if (currentStock <= 0) {
                setStockModalProduct(product);
                setIsStockModalOpen(true);
                // Optional warn user? User requested direct open.
                return;
            }

            // If unit type is weight, addToCart handles it (opens weight modal)
            if (product.unitType === 'weight') {
                addToCart(product);
                return;
            }

            // If unit type is 'unit', open Quantity Modal
            setPendingProduct({ product });
            setQuantityInput(""); // Start empty or "1"? User said "put a number". Empty might be better to type "12" directly without deleting "1".
            setQuantityModalOpen(true);
            setTimeout(() => {
                if (quantityInputRef.current) quantityInputRef.current.focus();
            }, 100);

        } else {
            showModal('error', 'Código no encontrado', `No existe producto con código "${code}"`);
        }
    };

    const confirmQuantity = () => {
        if (!pendingProduct || !quantityInput) return;
        const qty = parseInt(quantityInput);
        if (isNaN(qty) || qty <= 0) return;

        const { product, variant } = pendingProduct;

        setCart(prev => {
            // Re-check stock just in case specifically for the variant or product
            let maxStock = 0;
            if (variant && product.variants) {
                const v = product.variants.find((v: any) => v.name === variant);
                maxStock = v ? (v.stockQuantity || 0) : 0;
            } else {
                maxStock = product.stockQuantity || 0;
            }

            const existing = prev.find(item => item.id === product.id && item.selectedVariant === variant);

            const currentQty = existing ? existing.quantity : 0;

            if (currentQty + qty > maxStock) {
                handleStockError(product, `No hay suficiente stock. Solicitado: ${currentQty + qty}, Disponible: ${maxStock}`);
                return prev;
            }

            const priceToUse = priceMode === 'wholesale'
                ? (product.wholesalePrice || product.precio)
                : product.precio;

            if (existing) {
                return prev.map(item =>
                    item.id === product.id && item.selectedVariant === variant
                        ? { ...item, quantity: item.quantity + qty }
                        : item
                );
            }
            return [...prev, { ...product, quantity: qty, selectedVariant: variant, precio: priceToUse }];
        });

        setQuantityModalOpen(false);
        setPendingProduct(null);
        setQuantityInput("");
    };

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "products"));
            const prods: Product[] = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Product));
            setProducts(prods);
            return prods;
        } catch (error) {
            console.error("Error fetching products:", error);
            return [];
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

    const addWeightToCart = (product: Product, variant: string | undefined, qty: number, checkStock = true) => {
        // Determine Price to use (if not passed, calculate it)
        const priceToUse = priceMode === 'wholesale'
            ? (product.wholesalePrice || product.precio)
            : product.precio;

        if (checkStock) {
            let maxStock = 0;
            if (variant && product.variants) {
                const v = product.variants.find((v: any) => v.name === variant);
                maxStock = v ? (v.stockQuantity || 0) : 0;
            } else {
                maxStock = product.stockQuantity || 0;
            }

            const existing = cart.find(item => item.id === product.id && item.selectedVariant === variant);
            const currentQty = existing ? existing.quantity : 0;

            if (currentQty + qty > maxStock) {
                const deficit = (currentQty + qty) - maxStock + 0.005; // Add buffer to avoid rounding issues
                handleStockError(product, `Solo hay ${maxStock}kg disponibles (intentas llevar ${(currentQty + qty).toFixed(3)}kg).`, deficit, { type: 'weight', productId: product.id, variant, quantity: qty });
                return false;
            }
        }

        setCart(prev => {
            const existing = prev.find(item => item.id === product.id && item.selectedVariant === variant);
            if (existing) {
                return prev.map(item =>
                    (item.id === product.id && item.selectedVariant === variant)
                        ? { ...item, quantity: item.quantity + qty }
                        : item
                );
            }
            return [...prev, { ...product, quantity: qty, selectedVariant: variant, precio: priceToUse }];
        });
        return true;
    };

    const confirmWeight = () => {
        if (!pendingProduct || !weightInput) return;
        let qty = parseFloat(weightInput);
        if (isNaN(qty) || qty <= 0) return;

        // Enforce max 3 decimals
        qty = Math.round(qty * 1000) / 1000;

        const { product, variant } = pendingProduct;

        addWeightToCart(product, variant, qty);

        // Always close weight modal. 
        // If success: added to cart.
        // If fail: stock error modal is shown (and retry will handle addition).
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
            handleStockError(product, "No hay stock disponible de este producto.", 1, { type: 'unit', productId: product.id, variant: variantName });
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
                    handleStockError(product, "No hay más unidades disponibles de este producto.", 1, { type: 'unit', productId: product.id, variant: variantName });
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
                        handleStockError(item, "No puedes agregar más unidades de las que hay en stock.", 1, { type: 'unit', productId: item.id, variant: variantName });
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
                            const currentStock = parentDoc.stockQuantity || 0;

                            // STRICT VALIDATION
                            if (currentStock < totalDeduct) {
                                throw new Error(`Stock insuficiente para ${item.nombre} (Pack). Quedan: ${Math.floor(currentStock / unitsToDeduct)} unidades.`);
                            }

                            parentDoc.stockQuantity = currentStock - totalDeduct;
                            parentDoc.stock = parentDoc.stockQuantity > 0;

                            productsToUpdate.add(parentId);
                        }
                    }
                    // CASE B: Standard Product (or Variant) -> Deduct from Self
                    else {
                        const variantName = item.selectedVariant;

                        if (variantName && itemDoc.variants) {
                            const vIdx = itemDoc.variants.findIndex((v: any) => v.name === item.selectedVariant);
                            if (vIdx >= 0) {
                                const variant = itemDoc.variants[vIdx];
                                const currentStock = variant.stockQuantity || 0;

                                // STRICT VALIDATION
                                if (currentStock < item.quantity) {
                                    throw new Error(`Stock insuficiente para ${item.nombre} (${variant.name}). Quedan: ${currentStock}`);
                                }

                                variant.stockQuantity = currentStock - item.quantity;
                                variant.stock = variant.stockQuantity > 0;
                                productsToUpdate.add(item.id);
                            } else {
                                throw new Error(`Variante no encontrada: ${variantName}`);
                            }
                        } else {
                            const currentStock = itemDoc.stockQuantity || 0;

                            // STRICT VALIDATION
                            if (currentStock < item.quantity) {
                                throw new Error(`Stock insuficiente para ${item.nombre}. Quedan: ${currentStock}`);
                            }

                            itemDoc.stockQuantity = currentStock - item.quantity;
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
            const errMsg = error instanceof Error ? error.message : 'Error desconocido';

            if (errMsg.includes("Stock insuficiente")) {
                showModal('error', 'Stock Insuficiente', errMsg);
            } else {
                showModal('error', 'Error en la Venta', 'Ocurrió un error al procesar la venta. Por favor verifique la conexión.');
            }
        } finally {
            setProcessing(false);
        }
    };

    const filteredItems = useMemo(() => {
        const items: { type: 'product' | 'variant', data: Product, variant?: any }[] = [];

        products.forEach(p => {
            const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = selectedCategory === "Todas" || p.categoria === selectedCategory;
            const visibleInPos = !p.isHiddenInPOS;

            if (matchesCategory && visibleInPos) {
                // If has variants, check them
                // NOTE: If variants exist, we ONLY show variants, not the parent "container" as a product
                if (p.variants && p.variants.length > 0) {
                    p.variants.forEach(v => {
                        // For variants, we usually check if parent matches search OR variant name matches
                        // Simplified: check parent name + variant name
                        const fullName = `${p.nombre} ${v.name}`.toLowerCase();
                        if (fullName.includes(searchTerm.toLowerCase())) {
                            items.push({ type: 'variant', data: p, variant: v });
                        }
                    });
                } else {
                    // No variants, Standard Product
                    if (matchesSearch) {
                        items.push({ type: 'product', data: p });
                    }
                }
            }
        });

        return items.sort((a, b) => {
            // 1. Sort by Short ID
            const codeA = a.type === 'variant' ? (a.variant.shortId || "") : (a.data.shortId || "");
            const codeB = b.type === 'variant' ? (b.variant.shortId || "") : (b.data.shortId || "");

            if (codeA && codeB) {
                const numA = parseInt(codeA);
                const numB = parseInt(codeB);
                if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
                    return numA - numB;
                }
                return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
            }
            if (codeA) return -1;
            if (codeB) return 1;

            // 2. Sort by Name (Fallback)
            const nameA = a.type === 'variant' ? `${a.data.nombre} ${a.variant.name}` : a.data.nombre;
            const nameB = b.type === 'variant' ? `${b.data.nombre} ${b.variant.name}` : b.data.nombre;
            return nameA.localeCompare(nameB);
        });
    }, [products, searchTerm, selectedCategory]);

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
                    ) : filteredItems.map((item, index) => {
                        if (item.type === 'variant') {
                            const product = item.data;
                            const v = item.variant;
                            return (
                                <div key={`${product.id}-${v.name}-${index}`} className="pos-product-card" onClick={() => addToCart(product, v.name)}>
                                    <img src={v.image || product.img} alt={product.nombre} className="pos-product-img" />
                                    {v.shortId && (
                                        <span style={{
                                            position: 'absolute',
                                            top: '5px',
                                            left: '5px',
                                            backgroundColor: 'rgba(0,0,0,0.6)',
                                            color: '#fff',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold',
                                            zIndex: 10,
                                            pointerEvents: 'none'
                                        }}>
                                            {v.shortId}
                                        </span>
                                    )}
                                    <div className="pos-product-info">
                                        <div className="pos-product-name">{product.nombre} ({v.name})</div>
                                        <div className="pos-product-price">
                                            ${product.precio}
                                        </div>
                                        <div className={`pos-product-stock ${(v.stockQuantity || 0) < 5 ? "low" : ""}`}>
                                            Stock: {v.stockQuantity}
                                            {/* Boton de edicion rapida de stock */}
                                            <button
                                                className="btn-quick-stock-edit"
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Evitar agregar al carrito
                                                    setStockModalProduct(product);
                                                    setStockModalVariant(v.name);
                                                    setIsStockModalOpen(true);
                                                }}
                                            >
                                                <FaEdit />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        } else {
                            const product = item.data;
                            return (
                                <div key={`${product.id}-${index}`} className="pos-product-card" onClick={() => addToCart(product)}>
                                    <img src={product.img} alt={product.nombre} className="pos-product-img" />
                                    {product.shortId && (
                                        <span style={{
                                            position: 'absolute',
                                            top: '5px',
                                            left: '5px',
                                            backgroundColor: 'rgba(0,0,0,0.6)',
                                            color: '#fff',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold',
                                            zIndex: 10,
                                            pointerEvents: 'none'
                                        }}>
                                            {product.shortId}
                                        </span>
                                    )}
                                    <div className="pos-product-info">
                                        <div className="pos-product-name">{product.nombre}</div>
                                        <div className="pos-product-price">
                                            ${product.precio}
                                        </div>
                                        <div className={`pos-product-stock ${(product.stockQuantity || 0) < 5 ? "low" : ""}`}>
                                            Stock: {product.stockQuantity}
                                            {/* Boton de edicion rapida de stock */}
                                            <button
                                                className="btn-quick-stock-edit"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setStockModalProduct(product);
                                                    setIsStockModalOpen(true);
                                                }}
                                            >
                                                <FaEdit />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
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

            {/* Short ID visual feedback */}
            {showBuffer && (
                <div style={{
                    position: 'fixed',
                    bottom: '100px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    color: 'white',
                    padding: '20px 40px',
                    borderRadius: '12px',
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    zIndex: 9999,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    pointerEvents: 'none'
                }}>
                    <span style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.7, marginBottom: '5px' }}>Código Rápido</span>
                    <span>{inputBuffer}</span>
                </div>
            )}

            {/*      */}
            {
                quantityModalOpen && (
                    <div className="pos-modal-overlay">
                        <div className="pos-modal">

                            {pendingProduct && <h3 style={{ color: '#4b5563', margin: '0 0 10px 0', fontWeight: 'normal' }}>{pendingProduct.product.nombre} <span style={{ fontSize: '0.7em', color: (pendingProduct.product.stockQuantity || 0) > 5 ? '#059669' : '#dc2626' }}>(Stock: {pendingProduct.product.stockQuantity ?? 0})</span></h3>}
                            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                <input
                                    ref={quantityInputRef}
                                    type="number"
                                    placeholder="Cantidad"
                                    value={quantityInput}
                                    className="pos-input"
                                    style={{ fontSize: '1.2rem', textAlign: 'center', width: '200px' }}
                                    onChange={(e) => setQuantityInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') confirmQuantity();
                                        if (e.key === 'Escape') {
                                            setQuantityModalOpen(false);
                                            setPendingProduct(null);
                                        }
                                    }}
                                />
                                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                    <button className="btn-confirm" onClick={confirmQuantity}>Confirmar</button>
                                    <button className="btn-cancel" onClick={() => { setQuantityModalOpen(false); setPendingProduct(null); }}>Cancelar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Weight Input Modal */}
            {
                weightModalOpen && (
                    <div className="pos-modal-overlay">
                        <div className="pos-modal">
                            {pendingProduct && (
                                <h3 style={{ color: '#4b5563', margin: '0 0 10px 0', fontWeight: 'normal', textAlign: 'center' }}>
                                    {pendingProduct.product.nombre}
                                    <span style={{ fontSize: '0.8em', color: '#6b7280', display: 'block', marginTop: '5px' }}>
                                        (Stock Actual: {(() => {
                                            const { product, variant } = pendingProduct;
                                            if (variant && product.variants) {
                                                const v = product.variants.find((v: any) => v.name === variant);
                                                return v ? (v.stockQuantity || 0) : 0;
                                            }
                                            return product.stockQuantity || 0;
                                        })()}kg)
                                    </span>
                                </h3>
                            )}
                            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <input
                                        ref={weightInputRef}
                                        type="number"
                                        autoFocus
                                        value={weightInput}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (inputMode === 'price') return;

                                            if (!smartInputUsed && val.length === 1 && /^[1-9]$/.test(val)) {
                                                setWeightInput("0." + val);
                                                setSmartInputUsed(true);
                                            } else {
                                                setWeightInput(val);
                                                setSmartInputUsed(true);
                                            }
                                        }}
                                        onFocus={() => setInputMode('weight')}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') confirmWeight();
                                            if (e.key === 'Tab') {
                                                e.preventDefault();
                                                setInputMode('price');
                                                // We rely on the price input rendering when mode is price
                                                // Since we change state, re-render happens. 
                                                // Ideally we want to focus the price input.
                                                // But the price input is conditionally rendered.
                                                // We need to ensure it renders and gets focus.
                                                // The current structure switches a DIV to an INPUT. 
                                                // React will mount the new input. "autoFocus" on the price input handles it.
                                            }
                                        }}
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
                                {pendingProduct && (
                                    <div
                                        style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2ecc71', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                                        onClick={() => {
                                            if (inputMode === 'price') return;
                                            setInputMode('price');
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
                                                        setWeightInput(newWeight.toFixed(3));
                                                    }
                                                }}
                                                placeholder="0"
                                                step="1"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') confirmWeight();
                                                }}
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

                                        const currentWeight = parseFloat(weightInput) || 0;
                                        const percentage = maxStock > 0 ? Math.min(100, (currentWeight / maxStock) * 100) : 0;
                                        // remaining removed

                                        return (
                                            <div style={{ width: '100%', margin: '15px 0' }}>
                                                <div className="pos-stock-meter">
                                                    <div
                                                        className="pos-stock-fill"
                                                        style={{
                                                            width: `${percentage}%`,
                                                            backgroundColor: percentage > 90 ? '#ef4444' : percentage > 70 ? '#f59e0b' : '#10b981'
                                                        }}
                                                    ></div>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '0.8rem', marginTop: '5px' }}>
                                                    <span>0kg</span>
                                                    <span style={{ fontWeight: 'bold', color: '#374151' }}>{currentWeight.toFixed(3)}kg seleccionados</span>
                                                    <span>{maxStock.toFixed(2)}kg (Max)</span>
                                                </div>
                                            </div>
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
            {isStockModalOpen && (
                <StockAdjustmentModal
                    isOpen={isStockModalOpen}
                    onClose={() => { setIsStockModalOpen(false); setStockModalProduct(null); setStockModalInitialValue(undefined); }}
                    product={stockModalProduct}
                    onSuccess={async () => {
                        const newProds = await fetchProducts();
                        setIsStockModalOpen(false);
                        setStockModalInitialValue(undefined);
                        setStockModalProduct(null);
                        setStockModalVariant(undefined);

                        if (pendingRetry && newProds) {
                            const freshProduct = newProds.find(p => p.id === pendingRetry.productId);
                            if (freshProduct) {
                                if (pendingRetry.type === 'unit') {
                                    addToCart(freshProduct, pendingRetry.variant);
                                } else if (pendingRetry.type === 'weight' && pendingRetry.quantity) {
                                    addWeightToCart(freshProduct, pendingRetry.variant, pendingRetry.quantity);
                                }
                            }
                            setPendingRetry(null);
                        }
                    }}
                    initialVariantName={stockModalVariant}
                    initialValue={stockModalInitialValue}
                />
            )}
        </div >
    );
}
