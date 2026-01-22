
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
    status: "pendiente" | "preparando" | "enviado" | "entregado" | "cancelado";
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

            setOrders(ordersData);
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

            setOrders(prev => [...prev, ...newOrders]);
            setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
            setHasMore(snapshot.docs.length === 50);
            setLoadingMore(false);
        } catch (err) {
            console.error("Error loading more orders:", err);
            setLoadingMore(false);
        }
    };

    const updateStatus = async (id: string, status: string) => {
        try {
            const orderToCancel = orders.find(o => o.id === id);

            // 1. Si el nuevo estado es Cancelado, devolver stock
            if (status === 'cancelado') {
                if (orderToCancel && orderToCancel.status !== 'cancelado') {
                    // Iterar sobre los productos y devolver stock
                    for (const item of orderToCancel.items) {
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

                                        // Restaurar Padre
                                        await updateDoc(parentRef, { stockQuantity: newParentStock });

                                        // Movimiento de Stock (ENTRADA)
                                        await addDoc(collection(db, "stock_movements"), {
                                            productId: parentId,
                                            productName: parentData.nombre,
                                            type: 'IN',
                                            quantity: qtyToRestore,
                                            reason: 'Pedido Cancelado',
                                            observation: `Cancelación Pedido derivado: ${item.name}`,
                                            date: new Date()
                                        });

                                        // Sincronizar hijos
                                        await syncChildProducts(parentId, newParentStock);
                                    }
                                }
                                // --- Fin Lógica Derivados ---
                                else {
                                    // Lógica Normal
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
                                        // Producto Simple
                                        const currentStock = data.stockQuantity || 0;
                                        const newStock = currentStock + (item.quantity || 1);

                                        await updateDoc(itemRef, { stockQuantity: newStock });

                                        // Sincronizar si es padre
                                        await syncChildProducts(baseId, newStock);
                                    }

                                    // Movimiento de Stock (ENTRADA)
                                    await addDoc(collection(db, "stock_movements"), {
                                        productId: baseId,
                                        productName: item.name,
                                        type: 'IN',
                                        quantity: item.quantity || 1,
                                        reason: 'Pedido Cancelado',
                                        observation: `Cancelación Pedido #${id.slice(-4)}`,
                                        date: new Date()
                                    });
                                }
                            }
                        } catch (err) {
                            console.error(`Error restaurando stock para ${item.name}:`, err);
                        }
                    }
                }
            }

            // 2. Si el pedido estaba Cancelado y pasa a otro estado (Reactivación), descontar stock nuevamente
            else if (orderToCancel && orderToCancel.status === 'cancelado' && status !== 'cancelado') {
                for (const item of orderToCancel.items) {
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
                                const qtyToDeduct = (item.quantity || 1) * unitsToDeduct;

                                const parentRef = doc(db, "products", parentId);
                                const parentSnap = await getDoc(parentRef);

                                if (parentSnap.exists()) {
                                    const parentData = parentSnap.data();
                                    const currentParentStock = parentData.stockQuantity || 0;
                                    const newParentStock = Math.max(0, currentParentStock - qtyToDeduct);

                                    // Actualizar Padre
                                    await updateDoc(parentRef, { stockQuantity: newParentStock });

                                    // Movimiento de Stock (SALIDA)
                                    await addDoc(collection(db, "stock_movements"), {
                                        productId: parentId,
                                        productName: parentData.nombre,
                                        type: 'OUT',
                                        quantity: qtyToDeduct,
                                        reason: 'Pedido Reactivado',
                                        observation: `Reactivación Pedido derivado: ${item.name}`,
                                        date: new Date()
                                    });

                                    // Sincronizar hijos
                                    await syncChildProducts(parentId, newParentStock);
                                }
                            }
                            // --- Fin Lógica Derivados ---
                            else {
                                // Lógica Normal
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
                                    // Producto Simple
                                    const currentStock = data.stockQuantity || 0;
                                    const newStock = Math.max(0, currentStock - (item.quantity || 1));

                                    await updateDoc(itemRef, { stockQuantity: newStock });

                                    // Sincronizar si es padre
                                    await syncChildProducts(baseId, newStock);
                                }

                                // Movimiento de Stock (SALIDA)
                                await addDoc(collection(db, "stock_movements"), {
                                    productId: baseId,
                                    productName: item.name,
                                    type: 'OUT',
                                    quantity: item.quantity || 1,
                                    reason: 'Pedido Reactivado',
                                    observation: `Reactivación Pedido #${id.slice(-4)}`,
                                    date: new Date()
                                });
                            }
                        }
                    } catch (err) {
                        console.error(`Error descontando stock al reactivar ${item.name}:`, err);
                    }
                }
            }

            await updateDoc(doc(db, "orders", id), { status });
            // Actualizar estado localmente para reflejar cambio inmediato
            setOrders(prev => prev.map(o => o.id === id ? { ...o, status: status as any } : o));
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Error al actualizar el estado");
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
                    <h2>Gestión de Pedidos</h2>
                    <p>Administra y actualiza el estado de los pedidos recibidos.</p>
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
                        {orders.map((order) => {
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
                                                <div style={{
                                                    fontSize: '0.8rem',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    background: order.source === 'pos_wholesale' ? '#8b5cf6' : order.source === 'pos_public' || order.source === 'pos' ? '#10b981' : '#f59e0b',
                                                    color: 'white',
                                                    marginLeft: '10px'
                                                }}>
                                                    {order.source === 'pos_wholesale' ? 'Despensa' : (order.source === 'pos_public' || order.source === 'pos') ? 'Local' : 'Web'}
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
                                                        {prod.variants ? (
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

                </div>
            )}
        </div>
    );
}
