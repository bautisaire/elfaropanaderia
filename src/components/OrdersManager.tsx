
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, auth } from "../firebase/firebaseConfig";
import { collection, updateDoc, doc, orderBy, query, getDoc, addDoc, limit, getDocs, where, Timestamp, onSnapshot, deleteDoc } from "firebase/firestore";
import { FaPhone, FaSync, FaCheckCircle, FaClock, FaTruck, FaTimesCircle, FaBoxOpen, FaPlus, FaMinus, FaTrash, FaSave } from 'react-icons/fa';
import ProductSearch from "./ProductSearch";
import { syncChildProducts } from "../utils/stockUtils";
import OrderDetailsExpanded from "./OrderDetailsExpanded";
import "./OrdersManager.css";

interface Order {
    id: string;
    items: any[];
    total: number;
    cliente: {
        nombre: string;
        direccion: string;
        telefono: string;
        indicaciones?: string;
        metodoPago: string;
    };
    date: any;
    status: "pendiente" | "preparando" | "enviado" | "entregado" | "cancelado" | "pending_payment";
    source?: string;
}

const statusOptions = [
    { value: "pendiente", label: "Pendiente", color: "#f59e0b", icon: <FaClock /> },
    { value: "preparando", label: "Preparando", color: "#3b82f6", icon: <FaBoxOpen /> },
    { value: "enviado", label: "Enviado", color: "#8b5cf6", icon: <FaTruck /> },
    { value: "entregado", label: "Entregado", color: "#10b981", icon: <FaCheckCircle /> },
    { value: "cancelado", label: "Cancelado", color: "#ef4444", icon: <FaTimesCircle /> },
];

export default function OrdersManager() {
    const { "*": tab } = useParams(); // Capture the wildcard part
    const navigate = useNavigate();

    // Derived state from URL, defaulting to 'pos'
    const cleanTab = tab ? tab.replace(/^\//, '') : 'pos';
    const activeTab = (cleanTab === 'web' || cleanTab === 'pos' || cleanTab === 'expenses') ? cleanTab : 'pos';

    const isSuperAdmin = auth.currentUser?.email === 'sairebautista@gmail.com';

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [orderToDeleteParams, setOrderToDeleteParams] = useState<{ id: string, restoreStock: boolean } | null>(null);
    const [deleteSuccessModalOpen, setDeleteSuccessModalOpen] = useState(false);

    const handleDeleteOrder = (id: string, restoreStock: boolean) => {
        setOrderToDeleteParams({ id, restoreStock });
        setDeleteModalOpen(true);
    };

    const confirmDeleteOrder = async () => {
        if (!orderToDeleteParams) return;
        const { id, restoreStock } = orderToDeleteParams;

        try {
            if (restoreStock) {
                const orderToDeleteObj = orders.find(o => o.id === id);
                if (orderToDeleteObj && orderToDeleteObj.status !== 'cancelado') {
                    // Solo devolver el stock si no estaba cancelado antes (porque si lo estaba ya se devolvió)
                    await restoreOrderStock(orderToDeleteObj);
                }
            }
            await deleteDoc(doc(db, "orders", id));
            setOrders(prev => prev.filter(o => o.id !== id));
            setExpandedOrderId(null);

            setDeleteModalOpen(false);
            setOrderToDeleteParams(null);
            setDeleteSuccessModalOpen(true);
        } catch (error) {
            console.error("Error deleting order:", error);
            alert("Error al eliminar el pedido. Revisa los permisos.");
            setDeleteModalOpen(false);
            setOrderToDeleteParams(null);
        }
    };

    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [orderLimit, setOrderLimit] = useState(50);
    const [isHistorical, setIsHistorical] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    // Expenses State
    const [expenses, setExpenses] = useState<any[]>([]);
    const [loadingExpenses, setLoadingExpenses] = useState(false);

    // Edit Modal State
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editSearchTerm, setEditSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);

    // Cancel Modal State
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [orderToCancelId, setOrderToCancelId] = useState<string | null>(null);

    // Expanded Order State
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

    // Expenses fetch
    useEffect(() => {
        if (activeTab !== 'expenses') return;
        setLoadingExpenses(true);
        const q = query(collection(db, "expenses"), orderBy("date", "desc"), limit(100));
        const unsub = onSnapshot(q, (snap) => {
            setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoadingExpenses(false);
        }, () => setLoadingExpenses(false));
        return () => unsub();
    }, [activeTab]);

    useEffect(() => {
        setLoading(true);
        let q;

        if (!isHistorical) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = Timestamp.fromDate(today);

            q = query(
                collection(db, "orders"),
                where("date", ">=", todayTimestamp),
                orderBy("date", "desc"),
                limit(orderLimit)
            );
        } else {
            q = query(
                collection(db, "orders"),
                orderBy("date", "desc"),
                limit(orderLimit)
            );
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersData = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                status: doc.data().status || "pendiente"
            })) as Order[];

            const confirmedOrders = ordersData.filter(o => o.status !== 'pending_payment');
            setOrders(confirmedOrders);

            // Check if we can load more
            setHasMore(snapshot.docs.length >= orderLimit);
            setLoading(false);
            setLoadingMore(false);
        }, (err) => {
            console.error("Error listening to orders:", err);
            setError("Error al cargar pedidos.");
            setLoading(false);
            setLoadingMore(false);
        });

        return () => unsubscribe();
    }, [orderLimit, isHistorical]);

    const loadMoreOrders = () => {
        setLoadingMore(true);
        if (!isHistorical && !hasMore) {
            // We ran out of "today's" orders, switch to historical with initial chunk + next chunk
            setIsHistorical(true);
            setOrderLimit(prev => prev + 50);
        } else {
            // Just load more from the current context
            setOrderLimit(prev => prev + 50);
        }
    };


    const updateStatus = async (id: string, status: string) => {
        // Intercept Cancellation
        if (status === 'cancelado') {
            setOrderToCancelId(id);
            setCancelModalOpen(true);
            return;
        }

        // Normal Flow for other statuses
        try {
            await applyStatusChange(id, status);
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Error al actualizar el estado");
        }
    };

    const updateSource = async (id: string, source: string) => {
        try {
            await updateDoc(doc(db, "orders", id), { source });
            setOrders(prev => prev.map(o => o.id === id ? { ...o, source } : o));
        } catch (err) {
            console.error("Error updating source:", err);
            alert("Error al actualizar el origen");
        }
    };

    const updatePaymentMethod = async (id: string, newMethod: string) => {
        try {
            await updateDoc(doc(db, "orders", id), { "cliente.metodoPago": newMethod });
            setOrders(prev => prev.map(o => o.id === id ? {
                ...o, cliente: {
                    ...o.cliente,
                    metodoPago: newMethod
                }
            } : o));
        } catch (err) {
            console.error("Error updating payment method:", err);
            alert("Error al actualizar el método de pago");
        }
    };

    const handleConfirmCancellation = async (restoreStock: boolean) => {
        if (!orderToCancelId) return;

        try {
            if (restoreStock) {
                // Execute Logic to Restore Stock
                const orderToCancel = orders.find(o => o.id === orderToCancelId);
                if (orderToCancel && orderToCancel.status !== 'cancelado') {
                    await restoreOrderStock(orderToCancel);
                }
            }

            // Update Status in DB
            await updateDoc(doc(db, "orders", orderToCancelId), { status: 'cancelado' });

            // Update Local
            setOrders(prev => prev.map(o => o.id === orderToCancelId ? { ...o, status: 'cancelado' } : o));

            setCancelModalOpen(false);
            setOrderToCancelId(null);
            // alert("Pedido cancelado correctamente.");
        } catch (error) {
            console.error("Error cancelling order:", error);
            alert("Error al cancelar el pedido.");
        }
    };

    // Refactored Logic: Apply Status Change (Generic)
    const applyStatusChange = async (id: string, status: string) => {
        const orderToCancel = orders.find(o => o.id === id);

        // Si el pedido estaba Cancelado y pasa a otro estado (Reactivación), descontar stock nuevamente
        if (orderToCancel && orderToCancel.status === 'cancelado' && status !== 'cancelado') {
            const idDisplay = /^\d+$/.test(id) ? id : id.slice(-4);
            await deductOrderStock(orderToCancel, `Reactivación Pedido #${idDisplay}`);
        }

        await updateDoc(doc(db, "orders", id), { status });
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status: status as any } : o));
    };

    // Helper to correctly extract Base ID
    const getBaseId = (item: any) => {
        if (item.productId) return String(item.productId);

        let variantName = item.variant;
        if (!variantName) {
            const match = item.name ? item.name.match(/\(([^)]+)\)$/) : null;
            if (match) variantName = match[1];
        }

        if (variantName) {
            const suffix = `-${variantName}`;
            if (String(item.id).endsWith(suffix)) {
                return String(item.id).substring(0, String(item.id).length - suffix.length);
            }
        }

        // Fallback: If no variant pattern detected, assume ID is the base ID
        // Evita romper IDs como 'torta-frita'
        // Si originalmente el ID tenía guiones y lo guardamos con '-Variante', 
        // lo mejor es buscar siempre la variante. Si todo falla, intentamos remover la variante del final.
        const parts = String(item.id).split('-');
        if (parts.length > 1 && variantName && parts[parts.length - 1] === variantName) {
            return parts.slice(0, -1).join('-');
        }

        return String(item.id);
    };

    // Helper: Restore Stock Logic (Refactored from original updateStatus)
    const restoreOrderStock = async (order: Order) => {
        for (const item of order.items) {
            try {
                const baseId = getBaseId(item);
                const isVariant = item.variant || (item.name && item.name.includes('('));
                const itemRef = doc(db, "products", baseId);
                const itemSnap = await getDoc(itemRef);

                if (itemSnap.exists()) {
                    const data = itemSnap.data();

                    // --- Lógica Derivados (Packs) ---
                    if (data.stockDependency && data.stockDependency.productId) {
                        const parentId = data.stockDependency.productId;
                        const unitsToDeduct = data.stockDependency.unitsToDeduct || 1;
                        const qtyToRestore = (item.quantity || 1) * unitsToDeduct;

                        const parentRef = doc(db, "products", parentId);
                        const parentSnap = await getDoc(parentRef);

                        if (parentSnap.exists()) {
                            const parentData = parentSnap.data();
                            const currentParentStock = parentData.stockQuantity || 0;
                            const newParentStock = currentParentStock + qtyToRestore;

                            await updateDoc(parentRef, { stockQuantity: newParentStock });

                            await addDoc(collection(db, "stock_movements"), {
                                productId: parentId,
                                productName: parentData.nombre,
                                type: 'IN',
                                quantity: qtyToRestore,
                                reason: 'Pedido Cancelado',
                                observation: `Cancelación Pedido derivado: ${item.name}`,
                                date: new Date()
                            });

                            await syncChildProducts(parentId, newParentStock);
                        }
                    }
                    // --- Fin Lógica Derivados ---
                    else {
                        let variantName = item.variant || "";
                        if (isVariant && data.variants) {
                            if (!variantName) {
                                // Fallback para pedidos viejos que no guardaban item.variant
                                const match = item.name.match(/\(([^)]+)\)$/);
                                if (match) variantName = match[1];
                            }

                            if (variantName) {
                                const variants = [...data.variants];
                                const variantIdx = variants.findIndex((v: any) => v.name === variantName);

                                if (variantIdx >= 0) {
                                    const currentStock = variants[variantIdx].stockQuantity || 0;
                                    const newStock = currentStock + (item.quantity || 1);
                                    variants[variantIdx].stockQuantity = newStock;
                                    variants[variantIdx].stock = newStock > 0;
                                    await updateDoc(itemRef, { variants });
                                }
                            }
                        } else {
                            const currentStock = data.stockQuantity || 0;
                            const newStock = currentStock + (item.quantity || 1);
                            await updateDoc(itemRef, { stockQuantity: newStock });
                            await syncChildProducts(baseId, newStock);
                        }

                        // Guardar el movimiento de stock en cualquiera de los dos casos (variante o base)
                        await addDoc(collection(db, "stock_movements"), {
                            productId: baseId,
                            productName: item.name,
                            type: 'IN',
                            quantity: item.quantity || 1,
                            reason: 'Pedido Cancelado',
                            observation: `Cancelación Pedido #${/^\d+$/.test(order.id) ? order.id : order.id.slice(-4)}`,
                            date: new Date()
                        });
                    }
                }
            } catch (err) {
                console.error(`Error restaurando stock para ${item.name}:`, err);
            }
        }
    };

    // Helper: Deduct Stock Logic (Refactored from original updateStatus)
    const deductOrderStock = async (order: Order, reasonObs: string) => {
        for (const item of order.items) {
            try {
                const baseId = getBaseId(item);
                const isVariant = item.variant || (item.name && item.name.includes('('));
                const itemRef = doc(db, "products", baseId);
                const itemSnap = await getDoc(itemRef);

                if (itemSnap.exists()) {
                    const data = itemSnap.data();

                    if (data.stockDependency && data.stockDependency.productId) {
                        const parentId = data.stockDependency.productId;
                        const unitsToDeduct = data.stockDependency.unitsToDeduct || 1;
                        const qtyToDeduct = (item.quantity || 1) * unitsToDeduct;

                        const parentRef = doc(db, "products", parentId);
                        const parentSnap = await getDoc(parentRef);

                        if (parentSnap.exists()) {
                            const parentData = parentSnap.data();
                            const currentParentStock = parentData.stockQuantity || 0;
                            const newParentStock = Math.max(0, currentParentStock - qtyToDeduct);

                            await updateDoc(parentRef, { stockQuantity: newParentStock });

                            await addDoc(collection(db, "stock_movements"), {
                                productId: parentId,
                                productName: parentData.nombre,
                                type: 'OUT',
                                quantity: qtyToDeduct,
                                reason: 'Pedido Reactivado',
                                observation: `Reactivación Pedido derivado: ${item.name}`,
                                date: new Date()
                            });
                            await syncChildProducts(parentId, newParentStock);
                        }
                    } else {
                        let variantName = item.variant || "";
                        if (isVariant && data.variants) {
                            if (!variantName) {
                                const match = item.name.match(/\(([^)]+)\)$/);
                                if (match) variantName = match[1];
                            }

                            if (variantName) {
                                const variants = [...data.variants];
                                const variantIdx = variants.findIndex((v: any) => v.name === variantName);
                                if (variantIdx >= 0) {
                                    const currentStock = variants[variantIdx].stockQuantity || 0;
                                    const newStock = Math.max(0, currentStock - (item.quantity || 1));
                                    variants[variantIdx].stockQuantity = newStock;
                                    variants[variantIdx].stock = newStock > 0;
                                    await updateDoc(itemRef, { variants });
                                }
                            }
                        } else {
                            const currentStock = data.stockQuantity || 0;
                            const newStock = Math.max(0, currentStock - (item.quantity || 1));
                            await updateDoc(itemRef, { stockQuantity: newStock });
                            await syncChildProducts(baseId, newStock);
                        }

                        await addDoc(collection(db, "stock_movements"), {
                            productId: baseId,
                            productName: item.name,
                            type: 'OUT',
                            quantity: item.quantity || 1,
                            reason: 'Pedido Reactivado',
                            observation: reasonObs,
                            date: new Date()
                        });
                    }
                }
            } catch (err) {
                console.error(`Error descontando stock al reactivar ${item.name}:`, err);
            }
        }
    };

    // --- Search Logic for Valid Products in Edit Modal ---
    useEffect(() => {
        if (editSearchTerm.length > 2) {
            const searchProducts = async () => {
                const productsRef = collection(db, "products");
                const q = query(productsRef); // Optimizable
                const snapshot = await getDocs(q);
                const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const lowerTerm = editSearchTerm.toLowerCase();
                const filtered = allProducts.filter((p: any) =>
                    p.nombre.toLowerCase().includes(lowerTerm) ||
                    (p.variants && p.variants.some((v: any) => v.name.toLowerCase().includes(lowerTerm)))
                );
                setSearchResults(filtered);
            };
            searchProducts();
        } else {
            setSearchResults([]);
        }
    }, [editSearchTerm]);

    const handleOpenEditModal = (order: Order) => {
        setEditingOrder(JSON.parse(JSON.stringify(order))); // Deep copy
        setIsEditModalOpen(true);
    };

    const handleCloseEditModal = () => {
        setIsEditModalOpen(false);
        setEditingOrder(null);
        setEditSearchTerm("");
    };

    // Edit Modal Actions
    const updateItemQuantity = (index: number, delta: number) => {
        if (!editingOrder) return;
        const newItems = [...editingOrder.items];
        const item = newItems[index];
        const newQty = (Number(item.quantity) || 0) + delta;

        if (newQty <= 0) {
            newItems.splice(index, 1);
        } else {
            item.quantity = newQty;
        }

        // Recalculate total
        const newTotal = Math.round(newItems.reduce((sum, i) => sum + (Number(i.price) * Number(i.quantity)), 0) * 100) / 100;
        setEditingOrder({ ...editingOrder, items: newItems, total: newTotal });
    };

    const handleAddItem = (product: any, variant: any = null) => {
        if (!editingOrder) return;
        const newItems = [...editingOrder.items];

        const price = (variant && variant.price !== undefined) ? Number(variant.price) : Number(product.precio);
        const name = product.nombre;
        const variantName = variant ? variant.name : null;
        const id = variant ? `${product.id}-${variant.name}` : product.id;

        // Check if exists
        const existingIdx = newItems.findIndex(i => {
            return i.id === id || (i.name === name && i.variant === variantName);
        });

        if (existingIdx >= 0) {
            newItems[existingIdx].quantity += 1;
        } else {
            newItems.push({
                id,
                name,
                variant: variantName,
                quantity: 1,
                price
            });
        }

        const newTotal = Math.round(newItems.reduce((sum, i) => sum + (Number(i.price) * Number(i.quantity)), 0) * 100) / 100;
        setEditingOrder({ ...editingOrder, items: newItems, total: newTotal });
        setEditSearchTerm("");
    };

    const handleSaveOrder = async () => {
        if (!editingOrder) return;

        try {
            // 1. Revert Stock of OLD Order Items (IN)
            const originalOrder = orders.find(o => o.id === editingOrder.id);
            if (originalOrder) {
                for (const item of originalOrder.items) {
                    try {
                        const idDisplay = /^\d+$/.test(editingOrder.id) ? editingOrder.id : editingOrder.id.slice(-4);
                        await adjustStock(item, 'IN', `Edición Pedido (Reversión) #${idDisplay}`);
                    } catch (e) {
                        console.error("Error reverting item stock", item, e);
                    }
                }
            }

            // 2. Deduct Stock of NEW Order Items (OUT)
            for (const item of editingOrder.items) {
                try {
                    const idDisplay = /^\d+$/.test(editingOrder.id) ? editingOrder.id : editingOrder.id.slice(-4);
                    await adjustStock(item, 'OUT', `Edición Pedido (Actualización) #${idDisplay}`);
                } catch (e) {
                    console.error("Error deducting item stock", item, e);
                }
            }

            // 3. Update Order Document
            const orderRef = doc(db, "orders", editingOrder.id);
            await updateDoc(orderRef, {
                items: editingOrder.items,
                total: editingOrder.total
            });

            // 4. Update Local State
            setOrders(prev => prev.map(o => o.id === editingOrder.id ? editingOrder : o));
            handleCloseEditModal();
            alert("Pedido actualizado correctamente.");

        } catch (error) {
            console.error("Error updating order:", error);
            alert("Error al guardar el pedido.");
        }
    };

    // Helper for Stock Adjustment
    const adjustStock = async (item: any, type: 'IN' | 'OUT', reasonObs: string) => {
        const baseId = getBaseId(item);
        const isVariant = item.variant || (item.name && item.name.includes('('));
        const itemRef = doc(db, "products", baseId);
        const itemSnap = await getDoc(itemRef);

        if (itemSnap.exists()) {
            const data = itemSnap.data();
            const qty = Number(item.quantity) || 1;

            // Dependency Logic
            if (data.stockDependency && data.stockDependency.productId) {
                const parentId = data.stockDependency.productId;
                const unitsToDeduct = data.stockDependency.unitsToDeduct || 1;
                const totalQty = qty * unitsToDeduct;

                const parentRef = doc(db, "products", parentId);
                const parentSnap = await getDoc(parentRef);

                if (parentSnap.exists()) {
                    const parentData = parentSnap.data();
                    let newParentStock = parentData.stockQuantity || 0;
                    if (type === 'IN') newParentStock += totalQty;
                    else newParentStock = Math.max(0, newParentStock - totalQty);

                    await updateDoc(parentRef, { stockQuantity: newParentStock });
                    await addDoc(collection(db, "stock_movements"), {
                        productId: parentId,
                        productName: parentData.nombre,
                        type: type,
                        quantity: totalQty,
                        reason: type === 'IN' ? 'Edición Pedido (Devolución)' : 'Edición Pedido (Salida)',
                        observation: reasonObs,
                        date: new Date()
                    });
                    await syncChildProducts(parentId, newParentStock);
                }
            } else {
                // Standard Logic
                let updated = false;
                let newStock = 0;

                if (isVariant && data.variants) {
                    const match = item.name.match(/\(([^)]+)\)$/);
                    const vName = item.variant || (match ? match[1] : "");

                    const variants = [...data.variants];
                    const vIdx = variants.findIndex((v: any) => v.name === vName);
                    if (vIdx >= 0) {
                        const curr = variants[vIdx].stockQuantity || 0;
                        if (type === 'IN') newStock = curr + qty;
                        else newStock = Math.max(0, curr - qty);

                        variants[vIdx].stockQuantity = newStock;
                        variants[vIdx].stock = newStock > 0;
                        await updateDoc(itemRef, { variants });
                        updated = true;
                    }
                }

                if (!updated) {
                    // Simple Product or Fallback
                    const curr = data.stockQuantity || 0;
                    if (type === 'IN') newStock = curr + qty;
                    else newStock = Math.max(0, curr - qty);

                    await updateDoc(itemRef, { stockQuantity: newStock });
                    updated = true;
                }

                if (updated) {
                    await addDoc(collection(db, "stock_movements"), {
                        productId: baseId,
                        productName: item.name,
                        type: type,
                        quantity: qty,
                        reason: type === 'IN' ? 'Edición Pedido (Devolución)' : 'Edición Pedido (Salida)',
                        observation: reasonObs,
                        date: new Date()
                    });
                    await syncChildProducts(baseId, newStock);
                }
            }
        }
    };

    return (
        <div className="product-manager-container">


            {error && <div className="pm-alert error">{error}</div>}

            {loading ? (
                <div className="loading-state">
                    <FaSync className="spin" size={30} />
                    <p>Cargando pedidos...</p>
                </div>
            ) : (
                <div className="orders-list-container">
                    <div className="orders-summary-bar">
                        <span className="summary-pill">Cargados: <strong>{orders.length}</strong></span>
                        <span className="summary-pill pending">Pendientes: <strong>{orders.filter(o => o.status === 'pendiente').length}</strong></span>
                    </div>

                    <div className="orders-content">
                        {/* Tab Selector */}
                        <div className="orders-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                            <button
                                className={`tab-btn ${activeTab === 'pos' ? 'active' : ''}`}
                                onClick={() => navigate('/editor/orders/pos')}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: activeTab === 'pos' ? '#10b981' : '#f3f4f6',
                                    color: activeTab === 'pos' ? 'white' : '#4b5563',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                Ventas POS
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'web' ? 'active' : ''}`}
                                onClick={() => navigate('/editor/orders/web')}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: activeTab === 'web' ? '#3b82f6' : '#f3f4f6',
                                    color: activeTab === 'web' ? 'white' : '#4b5563',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                Pedidos Web
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
                                onClick={() => navigate('/editor/orders/expenses')}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: activeTab === 'expenses' ? '#f59e0b' : '#f3f4f6',
                                    color: activeTab === 'expenses' ? 'white' : '#4b5563',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                💸 Gastos
                            </button>
                        </div>

                        {/* Expenses Table */}
                        {activeTab === 'expenses' && (
                            <div className="orders-table-container">
                                {loadingExpenses ? (
                                    <div className="loading-state"><FaSync className="spin" size={24} /><p>Cargando gastos...</p></div>
                                ) : expenses.length === 0 ? (
                                    <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>No hay gastos registrados.</p>
                                ) : (
                                    <table className="orders-table">
                                        <thead>
                                            <tr>
                                                <th className="col-fecha">Fecha</th>
                                                <th>Tipo</th>
                                                <th>Descripción</th>
                                                <th style={{ textAlign: 'right' }}>Monto</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {expenses.map((exp) => {
                                                const typeLabels: Record<string, string> = {
                                                    materia_prima: '🛒 Materia Prima',
                                                    servicio: '💡 Servicio',
                                                    otro: '📦 Otro'
                                                };
                                                const typeLabel = typeLabels[exp.type] || exp.type;
                                                const dateObj = exp.date?.seconds ? new Date(exp.date.seconds * 1000) : null;
                                                return (
                                                    <tr key={exp.id}>
                                                        <td className="col-fecha">
                                                            <div className="order-cell-time-large">
                                                                {dateObj ? dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                                            </div>
                                                            <div className="order-cell-date-small">
                                                                {dateObj ? dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span style={{
                                                                background: exp.type === 'materia_prima' ? '#d1fae5' : exp.type === 'servicio' ? '#dbeafe' : '#fef3c7',
                                                                color: exp.type === 'materia_prima' ? '#065f46' : exp.type === 'servicio' ? '#1e40af' : '#92400e',
                                                                padding: '3px 10px',
                                                                borderRadius: '12px',
                                                                fontSize: '0.82rem',
                                                                fontWeight: 600,
                                                                whiteSpace: 'nowrap'
                                                            }}>{typeLabel}</span>
                                                        </td>
                                                        <td style={{ fontSize: '0.9rem', color: '#374151' }}>
                                                            {exp.description || (exp.items?.length > 0 ? exp.items.map((i: any) => i.name).join(', ') : '—')}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <div className="order-cell-total" style={{ color: '#ef4444' }}>
                                                                -${Number(exp.totalAmount || 0).toLocaleString('es-AR')}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold', padding: '10px 16px', color: '#374151' }}>Total Gastos:</td>
                                                <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '10px 16px', color: '#ef4444', fontSize: '1.1rem' }}>
                                                    -${expenses.reduce((sum, e) => sum + (Number(e.totalAmount) || 0), 0).toLocaleString('es-AR')}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                )}
                            </div>
                        )}

                        {/* Orders Table */}
                        {activeTab !== 'expenses' && (<div className="orders-table-container">
                            <table className="orders-table">
                                <thead>
                                    <tr>
                                        <th className="col-fecha">Fecha</th>
                                        <th>Cliente</th>
                                        <th>Total</th>
                                        <th className="col-pago">Pago</th>
                                        <th className="col-estado">Estado</th>
                                        <th className="col-notas">Notas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.filter(order => {
                                        const isPos = order.source === 'pos' || order.source === 'pos_public' || order.source === 'pos_wholesale';
                                        return activeTab === 'pos' ? isPos : !isPos;
                                    }).map((order) => {
                                        const currentStatus = statusOptions.find(s => s.value === order.status) || statusOptions[0];

                                        return (
                                            <React.Fragment key={order.id}>
                                                <tr
                                                    className={`order-row-status-${order.status} ${expandedOrderId === order.id ? 'expanded-row-parent' : ''}`}
                                                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <td className="col-fecha">
                                                        <div className="order-cell-time-large">
                                                            {order.date?.seconds
                                                                ? new Date(order.date.seconds * 1000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                                                                : "N/A"}
                                                        </div>
                                                        <div className="order-cell-date-small">
                                                            {order.date?.seconds
                                                                ? new Date(order.date.seconds * 1000).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                                                                : ""}
                                                        </div>
                                                    </td>
                                                    <td className="col-cliente">
                                                        <div className="order-cell-client">
                                                            <strong>{order.cliente.nombre}</strong>
                                                            {activeTab === 'web' && (
                                                                <div className="client-contact-icons">
                                                                    {order.cliente.telefono && <FaPhone size={12} title={order.cliente.telefono} />}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="order-cell-total" style={{ color: '#10b981' }}>${Math.ceil(order.total)}</div>
                                                        <div className="order-cell-items-count" style={{ fontSize: '0.95rem' }}>
                                                            {order.items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0).toFixed(2).replace(/\.?0+$/, "")} u.
                                                        </div>
                                                    </td>
                                                    <td className="col-pago">
                                                        <div className={`payment-badge payment-${order.cliente.metodoPago.toLowerCase().replace(/\s/g, '-')}`}>
                                                            {order.cliente.metodoPago}
                                                        </div>
                                                    </td>
                                                    <td className="col-estado">
                                                        <div className="status-selector-wrapper-table" style={{ borderColor: currentStatus.color, color: currentStatus.color }}>
                                                            <span className="status-icon-table">{currentStatus.icon}</span>
                                                            <select
                                                                value={order.status}
                                                                onChange={(e) => updateStatus(order.id, e.target.value)}
                                                                className="status-dropdown-table"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {statusOptions.map(opt => (
                                                                    <option key={opt.value} value={opt.value}>
                                                                        {opt.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </td>
                                                    <td className="col-notas order-cell-notes" title={order.cliente.indicaciones || ''}>
                                                        {order.cliente.indicaciones ? (
                                                            <span>{order.cliente.indicaciones.length > 30 ? order.cliente.indicaciones.substring(0, 30) + '...' : order.cliente.indicaciones}</span>
                                                        ) : (
                                                            <span style={{ color: '#d1d5db', fontStyle: 'italic', fontSize: '0.8rem' }}>Sin notas</span>
                                                        )}
                                                    </td>
                                                </tr>
                                                {expandedOrderId === order.id && (
                                                    <tr className="order-details-row">
                                                        <td colSpan={6}>
                                                            <OrderDetailsExpanded
                                                                order={order}
                                                                onEdit={(order) => {
                                                                    handleOpenEditModal(order);
                                                                }}
                                                                onSourceChange={updateSource}
                                                                onPaymentMethodChange={updatePaymentMethod}
                                                                onStatusChange={updateStatus}
                                                                onClose={() => setExpandedOrderId(null)}
                                                                onDelete={handleDeleteOrder}
                                                                isSuperAdmin={isSuperAdmin}
                                                            />
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {orders.length === 0 && (
                                <div className="empty-state">
                                    <p>No hay pedidos registrados.</p>
                                </div>
                            )}
                        </div>)}
                    </div>

                    {/* Load More Button */}
                    {hasMore && (
                        <div className="load-more-container">
                            <button
                                className="load-more-btn"
                                onClick={loadMoreOrders}
                                disabled={loadingMore}
                            >
                                {loadingMore ? <><FaSync className="spin" /> Cargando...</> : 'Cargar más pedidos'}
                            </button>
                        </div>
                    )}

                    {/* Edit Modal */}
                    {isEditModalOpen && editingOrder && (
                        <div className="pm-modal-overlay">
                            <div className="pm-modal-content edit-order-modal">
                                <h3>Editar Pedido #{/^\d+$/.test(editingOrder.id) ? editingOrder.id : editingOrder.id.slice(-6)}</h3>

                                <div className="edit-modal-body">
                                    {/* Current Items */}
                                    <div className="edit-section">
                                        <h4>Ítems del Pedido</h4>
                                        <ul className="edit-items-list">
                                            {editingOrder.items.map((item, idx) => (
                                                <li key={idx} className="edit-item-row">
                                                    <div className="item-info">
                                                        <span>{item.name} {item.variant ? `(${item.variant})` : ''}</span>
                                                        <small>${item.price}</small>
                                                    </div>
                                                    <div className="item-controls">
                                                        <button onClick={() => updateItemQuantity(idx, -1)}><FaMinus /></button>
                                                        <span>{item.quantity}</span>
                                                        <button onClick={() => updateItemQuantity(idx, 1)}><FaPlus /></button>
                                                        <button className="remove-btn" onClick={() => updateItemQuantity(idx, -9999)}><FaTrash /></button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="edit-total">
                                            <strong>Total: ${editingOrder.total}</strong>
                                        </div>
                                    </div>

                                    {/* Add Product */}
                                    <div className="edit-section">
                                        <h4>Agregar Producto</h4>
                                        <ProductSearch
                                            value={editSearchTerm}
                                            onChange={setEditSearchTerm}
                                            placeholder="Buscar para agregar..."
                                        />
                                        {searchResults.length > 0 && (
                                            <ul className="edit-search-results">
                                                {searchResults.map(prod => (
                                                    <li key={prod.id} className="search-result-item">
                                                        <span>{prod.nombre}</span>
                                                        {prod.variants && prod.variants.length > 0 ? (
                                                            <div className="variant-tags">
                                                                {prod.variants.map((v: any) => (
                                                                    <button key={v.name} onClick={() => handleAddItem(prod, v)} className="variant-tag">
                                                                        {v.name} (${v.price !== undefined ? v.price : prod.precio})
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <button onClick={() => handleAddItem(prod)} className="add-simple-btn">
                                                                Agregar (${prod.precio})
                                                            </button>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>

                                <div className="pm-modal-actions">
                                    <button className="cancel-btn" onClick={handleCloseEditModal}>Cancelar</button>
                                    <button className="save-btn" onClick={handleSaveOrder}><FaSave /> Guardar Cambios</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Cancel Decision Modal */}
                    {cancelModalOpen && (
                        <div className="pm-modal-overlay">
                            <div className="pm-modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
                                <div style={{ marginBottom: '20px', color: '#b91c1c' }}>
                                    <FaTimesCircle size={40} />
                                </div>
                                <h3>Confirmar Cancelación</h3>
                                <p style={{ margin: '15px 0', color: '#4b5563' }}>
                                    Vas a cancelar el pedido <strong>#{orderToCancelId?.slice(-6)}</strong>.<br />
                                    ¿Deseas devolver los productos al stock?
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <button
                                        className="save-btn"
                                        onClick={() => handleConfirmCancellation(true)}
                                        style={{
                                            width: '100%',
                                            height: '60px',
                                            padding: '0 15px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                                            <FaSync />
                                            <span>Sí, Cancelar y Reponer</span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.9, background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                                            Recomendado
                                        </span>
                                    </button>

                                    <button
                                        className="cancel-btn"
                                        onClick={() => handleConfirmCancellation(false)}
                                        style={{
                                            width: '100%',
                                            height: '60px',
                                            borderColor: '#fca5a5',
                                            color: '#b91c1c',
                                            background: '#fef2f2',
                                            padding: '0 15px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                                            <FaTimesCircle />
                                            <span>Solo Cancelar (Sin Stock)</span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.8, background: 'rgba(220, 38, 38, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                            Errores/Duplicados
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => { setCancelModalOpen(false); setOrderToCancelId(null); }}
                                        style={{
                                            width: '100%',
                                            height: '50px',
                                            border: '1px solid #d1d5db',
                                            background: 'white',
                                            color: '#4b5563',
                                            borderRadius: '6px',
                                            fontSize: '0.9rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginTop: '5px'
                                        }}
                                    >
                                        Volver / No cancelar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Details Modal */}

                    {/* Delete Confirmation Modal */}
                    {deleteModalOpen && orderToDeleteParams && (
                        <div className="pm-modal-overlay">
                            <div className="pm-modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
                                <div style={{ marginBottom: '20px', color: '#dc2626' }}>
                                    <FaTrash size={40} />
                                </div>
                                <h3>Eliminar Pedido</h3>
                                <p style={{ margin: '15px 0', color: '#4b5563' }}>
                                    Estás a punto de <strong>eliminar permanentemente</strong> el pedido #{orderToDeleteParams.id.slice(-6)}.<br />
                                    Esta acción no se puede deshacer.
                                </p>
                                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                    <button
                                        className="cancel-btn"
                                        style={{ flex: 1 }}
                                        onClick={() => {
                                            setDeleteModalOpen(false);
                                            setOrderToDeleteParams(null);
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        className="save-btn"
                                        style={{ flex: 1, backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                                        onClick={confirmDeleteOrder}
                                    >
                                        Sí, Eliminar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Delete Success Modal */}
                    {deleteSuccessModalOpen && (
                        <div className="pm-modal-overlay">
                            <div className="pm-modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
                                <div style={{ marginBottom: '20px', color: '#10b981' }}>
                                    <FaCheckCircle size={50} />
                                </div>
                                <h3>Pedido Eliminado</h3>
                                <p style={{ margin: '15px 0', color: '#4b5563' }}>
                                    El pedido se ha borrado correctamente de la base de datos.
                                </p>
                                <button
                                    className="save-btn"
                                    style={{ width: '100%', marginTop: '10px', backgroundColor: '#10b981', borderColor: '#10b981' }}
                                    onClick={() => setDeleteSuccessModalOpen(false)}
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
