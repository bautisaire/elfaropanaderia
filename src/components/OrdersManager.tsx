
import { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, updateDoc, doc, orderBy, query, getDoc, addDoc, limit, startAfter, getDocs } from "firebase/firestore";
import { FaCalendarAlt, FaUser, FaMapMarkerAlt, FaPhone, FaCreditCard, FaSync, FaCheckCircle, FaClock, FaTruck, FaTimesCircle, FaBoxOpen, FaEdit, FaPlus, FaMinus, FaTrash, FaSave } from 'react-icons/fa';
import ProductSearch from "./ProductSearch";
import { syncChildProducts } from "../utils/stockUtils";
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
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastVisible, setLastVisible] = useState<any>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    // Edit Modal State
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editSearchTerm, setEditSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);

    // Cancel Modal State
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [orderToCancelId, setOrderToCancelId] = useState<string | null>(null);

    // New Tab State
    const [activeTab, setActiveTab] = useState<'pos' | 'web'>('pos');

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, "orders"), orderBy("date", "desc"), limit(50));
            const snapshot = await getDocs(q);

            const ordersData = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                status: doc.data().status || "pendiente"
            })) as Order[];

            // Filter out pending_payment orders (waiting for MP)
            const confirmedOrders = ordersData.filter(o => o.status !== 'pending_payment');

            setOrders(confirmedOrders);
            setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
            setHasMore(snapshot.docs.length === 50);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching orders:", err);
            setError("Error al cargar pedidos.");
            setLoading(false);
        }
    };

    const loadMoreOrders = async () => {
        if (!lastVisible) return;
        setLoadingMore(true);
        try {
            const q = query(
                collection(db, "orders"),
                orderBy("date", "desc"),
                startAfter(lastVisible),
                limit(50)
            );
            const snapshot = await getDocs(q);

            const newOrders = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                status: doc.data().status || "pendiente"
            })) as Order[];

            // Filter out pending_payment
            const confirmedNewOrders = newOrders.filter(o => o.status !== 'pending_payment');

            setOrders(prev => [...prev, ...confirmedNewOrders]);
            setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
            setHasMore(snapshot.docs.length === 50);
            setLoadingMore(false);
        } catch (err) {
            console.error("Error loading more orders:", err);
            setLoadingMore(false);
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
            await deductOrderStock(orderToCancel, `Reactivación Pedido #${id.slice(-4)}`);
        }

        await updateDoc(doc(db, "orders", id), { status });
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status: status as any } : o));
    };

    // Helper: Restore Stock Logic (Refactored from original updateStatus)
    const restoreOrderStock = async (order: Order) => {
        for (const item of order.items) {
            try {
                const isVariant = String(item.id).includes('-');
                const baseId = isVariant ? String(item.id).split('-')[0] : String(item.id);
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
                        let variantName = "";
                        if (isVariant && data.variants) {
                            const match = item.name.match(/\(([^)]+)\)$/);
                            if (match) variantName = match[1];

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

                        await addDoc(collection(db, "stock_movements"), {
                            productId: baseId,
                            productName: item.name,
                            type: 'IN',
                            quantity: item.quantity || 1,
                            reason: 'Pedido Cancelado',
                            observation: `Cancelación Pedido #${order.id.slice(-4)}`,
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
            // We can reuse adjustStock logic actually, but let's keep it explicit as it was originally intertwined
            // Or even better, let's allow adjustStock to be used if suitable. 
            // For now, to minimize risk, I'll paste the logic that was already there for "Reactivation"
            try {
                const isVariant = String(item.id).includes('-');
                const baseId = isVariant ? String(item.id).split('-')[0] : String(item.id);
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
                        let variantName = "";
                        if (isVariant && data.variants) {
                            const match = item.name.match(/\(([^)]+)\)$/);
                            if (match) variantName = match[1];

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
        const newTotal = newItems.reduce((sum, i) => sum + (Number(i.price) * Number(i.quantity)), 0);
        setEditingOrder({ ...editingOrder, items: newItems, total: newTotal });
    };

    const handleAddItem = (product: any, variant: any = null) => {
        if (!editingOrder) return;
        const newItems = [...editingOrder.items];

        const price = variant ? Number(variant.price) : Number(product.precio);
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

        const newTotal = newItems.reduce((sum, i) => sum + (Number(i.price) * Number(i.quantity)), 0);
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
                        await adjustStock(item, 'IN', `Edición Pedido (Reversión) #${editingOrder.id.slice(-4)}`);
                    } catch (e) {
                        console.error("Error reverting item stock", item, e);
                    }
                }
            }

            // 2. Deduct Stock of NEW Order Items (OUT)
            for (const item of editingOrder.items) {
                try {
                    await adjustStock(item, 'OUT', `Edición Pedido (Actualización) #${editingOrder.id.slice(-4)}`);
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
        const isVariant = String(item.id).includes('-');
        const baseId = isVariant ? String(item.id).split('-')[0] : String(item.id);
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
            <div className="pm-header">
                <div>
                    <h2>Gestión de Ventas</h2>
                    <p>Administra tus ventas locales y pedidos web.</p>
                </div>
            </div>

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

                    <div className="orders-grid">
                        {/* Tab Selector */}
                        <div className="orders-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                            <button
                                className={`tab-btn ${activeTab === 'pos' ? 'active' : ''}`}
                                onClick={() => setActiveTab('pos')}
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
                                onClick={() => setActiveTab('web')}
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
                        </div>

                        {orders.filter(order => {
                            const isPos = order.source === 'pos' || order.source === 'pos_public' || order.source === 'pos_wholesale';
                            return activeTab === 'pos' ? isPos : !isPos;
                        }).map((order) => {
                            const currentStatus = statusOptions.find(s => s.value === order.status) || statusOptions[0];
                            const dateStr = order.date?.seconds
                                ? new Date(order.date.seconds * 1000).toLocaleString('es-AR', {
                                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                                })
                                : "Fecha desc.";

                            return (
                                <div key={order.id} className={`pm-card order-card order-status-${order.status}`}>
                                    {/* Card Header */}
                                    <div className="order-card-header">
                                        <div className="order-header-info">
                                            <div className="order-id-badge">#{order.id.slice(-6)}</div>
                                            <div className="order-date"><FaCalendarAlt /> {dateStr}</div>
                                            {order.source && (
                                                <div className="source-selector-wrapper" style={{ marginLeft: '10px' }}>
                                                    <select
                                                        value={
                                                            order.source === 'pos_wholesale' ? 'pos_wholesale' :
                                                                (order.source === 'pos_public' || order.source === 'pos') ? 'pos_public' :
                                                                    'delivery'
                                                        }
                                                        onChange={(e) => updateSource(order.id, e.target.value)}
                                                        style={{
                                                            fontSize: '0.8rem',
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            background: order.source === 'pos_wholesale' ? '#8b5cf6' :
                                                                (order.source === 'pos_public' || order.source === 'pos') ? '#10b981' :
                                                                    '#f59e0b',
                                                            color: 'white',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            fontWeight: '500'
                                                        }}
                                                    >
                                                        <option value="pos_public" style={{ color: '#333' }}>Local</option>
                                                        <option value="delivery" style={{ color: '#333' }}>Delivery</option>
                                                        <option value="pos_wholesale" style={{ color: '#333' }}>Despensa</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                        <div className="status-selector-wrapper" style={{ borderColor: currentStatus.color }}>
                                            <span className="status-icon" style={{ color: currentStatus.color }}>{currentStatus.icon}</span>
                                            <select
                                                value={order.status}
                                                onChange={(e) => updateStatus(order.id, e.target.value)}
                                                className="status-dropdown"
                                                style={{ color: currentStatus.color }}
                                            >
                                                {statusOptions.map(opt => (
                                                    <option key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <button
                                            className="edit-order-btn"
                                            onClick={() => handleOpenEditModal(order)}
                                            title="Editar Pedido"
                                        >
                                            <FaEdit />
                                        </button>
                                    </div>

                                    {/* Card Body */}
                                    <div className="order-card-body">
                                        {/* Client Info */}
                                        {/* Client Info - Conditional */}
                                        {activeTab === 'web' ? (
                                            <div className="order-section client-section">
                                                <h5><FaUser /> Datos del Cliente</h5>
                                                <div className="info-row">
                                                    <strong>{order.cliente.nombre}</strong>
                                                </div>
                                                <div className="info-row">
                                                    <FaMapMarkerAlt className="icon-muted" /> {order.cliente.direccion}
                                                </div>
                                                <div className="info-row">
                                                    <FaPhone className="icon-muted" /> {order.cliente.telefono}
                                                </div>
                                                <div className="info-row">
                                                    <FaCreditCard className="icon-muted" /> {order.cliente.metodoPago}
                                                </div>
                                                {order.cliente.indicaciones && (
                                                    <div className="order-note">
                                                        "{order.cliente.indicaciones}"
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="order-section client-section" style={{ paddingBottom: '0' }}>
                                                <div className="info-row">
                                                    <FaCreditCard className="icon-muted" /> <strong>{order.cliente.metodoPago}</strong>
                                                </div>
                                            </div>
                                        )}

                                        {/* Items Info */}
                                        <div className="order-section items-section">
                                            <h5>Detalle del Pedido</h5>
                                            <ul className="order-items-list">
                                                {order.items.map((item, index) => (
                                                    <li key={index} className="order-item">
                                                        <div className="order-item-detail">
                                                            <span className="item-qty">
                                                                {Number(item.quantity).toFixed(3).replace(/\.?0+$/, "")}x
                                                            </span>
                                                            <span className="item-name">{item.name} {item.variant ? `(${item.variant})` : ''}</span>
                                                        </div>
                                                        <span className="item-price">${Math.floor(item.price)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <div className="order-total-row">
                                                <span>Total a cobrar:</span>
                                                <span className="total-amount">${order.total}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {orders.length === 0 && (
                            <div className="empty-state">
                                <p>No hay pedidos registrados.</p>
                            </div>
                        )}
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
                                <h3>Editar Pedido #{editingOrder.id.slice(-6)}</h3>

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
                                                                        {v.name} (${v.price})
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

                </div>
            )}
        </div>
    );
}
