import { useState, useEffect } from 'react';
import { FaUser, FaMapMarkerAlt, FaPhone, FaCreditCard, FaEdit, FaCopy, FaTimes, FaCheck, FaSave, FaPrint, FaMotorcycle } from 'react-icons/fa';
import { generateOrderMessage, generateOrderMessageShort } from "../utils/telegram";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { printTicket } from "../utils/printTicket";
import { useCart } from "../context/CartContext";
import PriceEditModal from "./PriceEditModal";
import TextEditModal from "./TextEditModal";
import MapLocationPickerModal from "./MapLocationPickerModal";

const statusOptions = [
    { value: "pendiente", label: "Pendiente", color: "#f59e0b" },
    { value: "preparando", label: "Preparando", color: "#3b82f6" },
    { value: "enviado", label: "Enviado", color: "#8b5cf6" },
    { value: "entregado", label: "Entregado", color: "#10b981" },
    { value: "cancelado", label: "Cancelado", color: "#ef4444" },
];

interface OrderDetailsExpandedProps {
    order: any;
    onEdit: (order: any) => void;
    onSourceChange: (id: string, source: string) => void;
    onPaymentMethodChange?: (id: string, newMethod: string) => void;
    onStatusChange?: (id: string, newStatus: string) => void;
    onClose: () => void;
    onDelete?: (id: string, restoreStock: boolean) => void;
    isSuperAdmin?: boolean;
    riders?: {email: string}[];
    onAssignRider?: (id: string, riderEmail: string) => void;
}

export default function OrderDetailsExpanded({ order, onClose, onEdit, onSourceChange, onPaymentMethodChange, onStatusChange, onDelete, isSuperAdmin, riders, onAssignRider }: OrderDetailsExpandedProps) {
    const { adminPermissions } = useCart();
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [priceEditModal, setPriceEditModal] = useState<{
        isOpen: boolean;
        item: any;
        currentPrice: number;
    }>({ isOpen: false, item: null, currentPrice: 0 });

    const [mapModalOpen, setMapModalOpen] = useState(false);
    const [editAddressModalOpen, setEditAddressModalOpen] = useState(false);
    const [editPhoneModalOpen, setEditPhoneModalOpen] = useState(false);
    const [editMapsLinkModalOpen, setEditMapsLinkModalOpen] = useState(false);

    const handleUpdateAddress = async (newAddress: string) => {
        try {
            const orderRef = doc(db, 'orders', order.id);
            await updateDoc(orderRef, {
                'cliente.direccion': newAddress
            });
        } catch (error) {
            console.error("Error updating address:", error);
            alert("Error al actualizar la dirección.");
        }
    };

    const handleUpdateMapsLink = async (newLink: string) => {
        try {
            const orderRef = doc(db, 'orders', order.id);
            await updateDoc(orderRef, {
                'cliente.mapsLink': newLink
            });
        } catch (error) {
            console.error("Error updating maps link:", error);
            alert("Error al actualizar el link de Maps.");
        }
    };

    const handleUpdatePhone = async (newPhone: string) => {
        try {
            const orderRef = doc(db, 'orders', order.id);
            await updateDoc(orderRef, {
                'cliente.telefono': newPhone
            });
        } catch (error) {
            console.error("Error updating phone:", error);
            alert("Error al actualizar el teléfono.");
        }
    };

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 2000);
    };

    // --- Customer Notes Logic ---
    // Priorizamos teléfono porque los pedidos creados manualmente por el admin comparten su deviceId.
    const customerId = order?.cliente?.telefono?.replace(/\D/g, '') && order?.cliente?.telefono?.replace(/\D/g, '').length > 0
        ? order?.cliente?.telefono?.replace(/\D/g, '')
        : order?.cliente?.deviceId || "unknown";
    const [notes, setNotes] = useState<{ adminNotes: string; correctedDireccion: string; correctedTelefono: string } | null>(null);
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [editingNotesData, setEditingNotesData] = useState({ adminNotes: "", correctedDireccion: "", correctedTelefono: "" });
    const [loadingNotes, setLoadingNotes] = useState(false);

    useEffect(() => {
        if (!order) return;
        const fetchNotes = async () => {
            setLoadingNotes(true);
            try {
                const docRef = doc(db, "customer_notes", customerId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setNotes(snap.data() as any);
                } else {
                    setNotes(null);
                }
            } catch (err) {
                console.error("Error fetching customer notes:", err);
            } finally {
                setLoadingNotes(false);
            }
        };
        fetchNotes();
    }, [customerId, order]);

    const handleSaveNotes = async () => {
        setLoadingNotes(true);
        try {
            const docRef = doc(db, "customer_notes", customerId);
            await setDoc(docRef, editingNotesData, { merge: true });
            setNotes(editingNotesData);
            setIsEditingNotes(false);
            showToast("Observaciones guardadas");
        } catch (err) {
            console.error("Error saving notes:", err);
            alert("Error al guardar las observaciones");
        } finally {
            setLoadingNotes(false);
        }
    };

    const startEditingNotes = () => {
        setEditingNotesData({
            adminNotes: notes?.adminNotes || "",
            correctedDireccion: notes?.correctedDireccion || "",
            correctedTelefono: notes?.correctedTelefono || ""
        });
        setIsEditingNotes(true);
    };



    if (!order) return null;

    return (
        <div className="order-details-wrapper" onClick={onClose} style={{ cursor: 'pointer' }}>
            <div className={`order-details-expanded status-border-${order.status}`} onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                <div className="expanded-content">
                    {/* Header Info - Simplified since table has some already */}
                    <div className="expanded-section">
                        <div className="expanded-header-row">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <h4>Ticket #{/^\d+$/.test(order.id) ? order.id : order.id.slice(-6)}</h4>
                                {/* Mobile Close Button */}
                                <button className="mobile-close-btn" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                                    <FaTimes />
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); printTicket(order); }}>
                                    <FaPrint /> Imprimir Ticket
                                </button>
                                {(adminPermissions?.orders_can_modify !== false || isSuperAdmin) && (
                                    <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); onEdit(order); }}>
                                        <FaEdit /> Editar Pedido
                                    </button>
                                )}
                                {isSuperAdmin && onDelete && (
                                    <button
                                        className="btn-secondary btn-sm"
                                        style={{ backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                                        onClick={(e) => { e.stopPropagation(); onDelete(order.id, order.status !== 'cancelado'); }}
                                    >
                                        <FaTimes /> Eliminar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="expanded-grid">
                        {/* Client Info */}
                        <div className="expanded-section client-section">
                            <h5>
                                <FaUser /> Cliente:
                                <span className="client-name-inline">{order.cliente.nombre}</span>
                            </h5>
                            <div className="info-row">
                                <FaMapMarkerAlt className="icon-muted" />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.cliente.direccion + ", Senillosa, Neuquen, Argentina")}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ color: 'inherit', textDecoration: 'underline' }}
                                        >
                                            {order.cliente.direccion}
                                        </a >
                                        {(isSuperAdmin || adminPermissions?.orders_can_assign_deliveries) && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditAddressModalOpen(true);
                                                }}
                                                style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0 }}
                                                title="Editar Dirección"
                                            >
                                                <FaEdit size={14} />
                                            </button>
                                        )}
                                    </div>
                                    {(isSuperAdmin || adminPermissions?.orders_can_assign_deliveries) && (
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setMapModalOpen(true);
                                                }}
                                                style={{
                                                    background: order.cliente.location ? '#dcfce7' : '#f1f5f9',
                                                    border: `1px solid ${order.cliente.location ? '#86efac' : '#cbd5e1'}`,
                                                    color: order.cliente.location ? '#166534' : '#475569',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    width: 'fit-content'
                                                }}
                                            >
                                                📍 {order.cliente.location ? 'Ubicación GPS (Editar)' : 'Fijar GPS en Mapa'}
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditMapsLinkModalOpen(true);
                                                }}
                                                style={{
                                                    background: order.cliente.mapsLink ? '#e0f2fe' : '#f1f5f9',
                                                    border: `1px solid ${order.cliente.mapsLink ? '#7dd3fc' : '#cbd5e1'}`,
                                                    color: order.cliente.mapsLink ? '#0369a1' : '#475569',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    width: 'fit-content'
                                                }}
                                            >
                                                🔗 {order.cliente.mapsLink ? 'Link de Maps (Editar)' : 'Pegar Link de Maps'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div >
                            <div className="info-row" style={{ alignItems: 'center' }}>
                                <FaPhone className="icon-muted" />
                                <a
                                    href={`https://wa.me/+549${order.cliente.telefono.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ color: 'inherit', textDecoration: 'underline' }}
                                >
                                    {order.cliente.telefono}
                                </a>
                                {(isSuperAdmin || adminPermissions?.orders_can_assign_deliveries) && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditPhoneModalOpen(true);
                                        }}
                                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0 }}
                                        title="Editar Teléfono"
                                    >
                                        <FaEdit size={14} />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const msg = generateOrderMessage(order);
                                        navigator.clipboard.writeText(msg);
                                        showToast("Mensaje copiado");
                                    }}
                                    title="Copiar resumen"
                                    className="copy-btn-inline"
                                >
                                    <FaCopy />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const msg = generateOrderMessageShort(order);
                                        navigator.clipboard.writeText(msg);
                                        showToast("Datos copiados al portapapeles");
                                    }}
                                    title="Copiar datos de transferencia"
                                    className="copy-btn-inline"
                                    style={{ color: '#25D366' }}
                                >
                                    <FaCopy />
                                </button>
                            </div>

                            <div className="info-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <FaCreditCard className="icon-muted" />
                                {(onPaymentMethodChange && (adminPermissions?.orders_can_change_payment !== false || isSuperAdmin)) ? (
                                    <div className="source-selector-wrapper-expanded" style={{ margin: 0 }}>
                                        <select
                                            value={order.cliente.metodoPago ? order.cliente.metodoPago.charAt(0).toUpperCase() + order.cliente.metodoPago.slice(1).toLowerCase() : ""}
                                            onChange={(e) => onPaymentMethodChange(order.id, e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="source-select-inline"
                                            style={{ padding: '2px 8px', fontSize: '0.9rem' }}
                                        >
                                            <option value="" disabled>— Cambiar método —</option>
                                            <option value="Efectivo">Efectivo</option>
                                            <option value="Transferencia">Transferencia</option>
                                            <option value="Débito">Débito</option>
                                            <option value="Tarjeta">Tarjeta</option>
                                        </select>
                                    </div>
                                ) : (
                                    <span>{order.cliente.metodoPago}</span>
                                )}
                            </div>

                            {/* Status Selector - visible on mobile in sidebar */}
                            {onStatusChange && (() => {
                                const currentStatus = statusOptions.find(s => s.value === order.status) || statusOptions[0];
                                return (
                                    <div className="info-row sidebar-status-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                        <div className="status-selector-wrapper-table sidebar-status-selector" style={{ borderColor: currentStatus.color, color: currentStatus.color }}>
                                            <select
                                                value={order.status}
                                                onChange={(e) => { e.stopPropagation(); onStatusChange(order.id, e.target.value); }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="status-dropdown-table"
                                            >
                                                {statusOptions.filter(opt => opt.value !== "cancelado" || adminPermissions?.orders_can_cancel !== false || isSuperAdmin).map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                );
                            })()}

                            {
                                order.cliente.indicaciones && (
                                    <div className="order-note-expanded">"{order.cliente.indicaciones}"</div>
                                )
                            }

                            {
                                order.source && (
                                    <div className="source-selector-wrapper-expanded">
                                        <label>Origen:</label>
                                        <select
                                            value={
                                                order.source === 'pos_wholesale' ? 'pos_wholesale' :
                                                    (order.source === 'pos_public' || order.source === 'pos') ? 'pos_public' :
                                                        'delivery'
                                            }
                                            onChange={(e) => onSourceChange(order.id, e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="source-select-inline"
                                        >
                                            <option value="pos_public">Local</option>
                                            <option value="delivery">Delivery</option>
                                            <option value="pos_wholesale">Despensa</option>
                                        </select>
                                    </div>
                                )
                            }
                            
                            {/* Rider Assignment (Available for all order sources) */}
                            {(isSuperAdmin || adminPermissions?.orders_can_assign_deliveries || (!adminPermissions?.is_rider && adminPermissions?.orders)) && onAssignRider && (
                                <div className="source-selector-wrapper-expanded" style={{ marginTop: '10px', background: '#f0fdf4', padding: '10px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                    <label style={{ color: '#166534', fontWeight: 'bold' }}><FaMotorcycle /> Asignar Repartidor:</label>
                                    <select
                                        value={order.assignedRider || ""}
                                        onChange={(e) => onAssignRider(order.id, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="source-select-inline"
                                        style={{ borderColor: '#86efac', background: '#fff' }}
                                    >
                                        <option value="">— Sin Asignar —</option>
                                        {riders?.map(r => (
                                            <option key={r.email} value={r.email}>{r.email}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div >

                        {/* Items */}
                        < div className="expanded-section items-section-expanded" >
                            <h5>Detalle de Productos</h5>
                            <ul className="order-items-list-expanded">
                                {order.items.map((item: any, index: number) => {
                                    const qty = Number(item.quantity);
                                    let qtyColor = '#3b82f6'; // default blue
                                    if (qty >= 4) qtyColor = '#ef4444'; // red
                                    else if (qty >= 3) qtyColor = '#ec4899'; // pink
                                    else if (qty >= 2) qtyColor = '#eab308'; // yellow

                                    return (
                                        <li key={index} className="order-item-expanded">
                                            <div className="order-item-detail">
                                                <span className="item-qty" style={{ color: qtyColor, fontWeight: 'bold' }}>{qty.toFixed(2).replace(/\.?0+$/, "")}x</span>
                                                <span className="item-name">
                                                    {item.name} {item.variant ? `(${item.variant})` : ''}
                                                    {item.selectedComboItems && item.selectedComboItems.length > 0 && (
                                                        <div style={{ fontSize: '0.85em', color: '#666', marginTop: '4px', fontWeight: 'normal' }}>
                                                            {item.selectedComboItems.map((combo: any, i: number) => (
                                                                <div key={i}>- {combo.quantity}x {combo.name}</div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </span>
                                            </div>
                                            <span className="item-price" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                ${Math.ceil(item.price * (item.quantity || 1))}
                                                {(isSuperAdmin || adminPermissions?.orders_can_edit_prices) && (
                                                    <button
                                                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0 }}
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            setPriceEditModal({
                                                                isOpen: true,
                                                                item: item,
                                                                currentPrice: item.price
                                                            });
                                                        }}
                                                        title="Editar Precio Unitario"
                                                    >
                                                        <FaEdit size={12} />
                                                    </button>
                                                )}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="order-total-row-expanded">
                                <span>Total</span>
                                <span className="total-amount-expanded">${Math.ceil(order.total)}</span>
                            </div>
                        </div >

                        {/* Admin Customer Notes Section */}
                        <div className="expanded-section admin-notes-section" style={{ marginTop: '15px', padding: '15px', backgroundColor: '#fdfbf7', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h5 style={{ margin: 0, color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FaEdit /> Observaciones Internas (Por Cliente)
                                </h5>
                                {!isEditingNotes && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); startEditingNotes(); }}
                                        className="btn-secondary btn-sm"
                                        style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                    >
                                        <FaEdit /> {notes && (notes.adminNotes || notes.correctedDireccion || notes.correctedTelefono) ? 'Editar' : 'Agregar'}
                                    </button>
                                )}
                            </div>

                            {loadingNotes ? (
                                <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Cargando...</p>
                            ) : isEditingNotes ? (
                                <div onClick={(e) => e.stopPropagation()}>
                                    <div className="form-group" style={{ marginBottom: '10px' }}>
                                        <label style={{ fontSize: '0.85rem', color: '#4b5563' }}>Dirección Corregida:</label>
                                        <input
                                            type="text"
                                            value={editingNotesData.correctedDireccion}
                                            onChange={(e) => setEditingNotesData({ ...editingNotesData, correctedDireccion: e.target.value })}
                                            placeholder="Ej: Misiones 342, Neuquén"
                                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '10px' }}>
                                        <label style={{ fontSize: '0.85rem', color: '#4b5563' }}>Teléfono Corregido:</label>
                                        <input
                                            type="text"
                                            value={editingNotesData.correctedTelefono}
                                            onChange={(e) => setEditingNotesData({ ...editingNotesData, correctedTelefono: e.target.value })}
                                            placeholder="Ej: 2995485619"
                                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '10px' }}>
                                        <label style={{ fontSize: '0.85rem', color: '#4b5563' }}>Observaciones del Admin (Texto Llano):</label>
                                        <textarea
                                            value={editingNotesData.adminNotes}
                                            onChange={(e) => setEditingNotesData({ ...editingNotesData, adminNotes: e.target.value })}
                                            placeholder="Ej: Cliente problemático, siempre pide a las 14hs..."
                                            rows={3}
                                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.9rem', resize: 'vertical' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                        <button
                                            onClick={handleSaveNotes}
                                            className="btn-primary btn-sm"
                                            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                                        >
                                            <FaSave /> Guardar
                                        </button>
                                        <button
                                            onClick={() => setIsEditingNotes(false)}
                                            className="btn-secondary btn-sm"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            ) : notes && (notes.adminNotes || notes.correctedDireccion || notes.correctedTelefono) ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {notes.correctedDireccion && (
                                        <div className="info-row" style={{ fontSize: '0.9rem', margin: 0 }}>
                                            <FaMapMarkerAlt style={{ color: '#b45309' }} />
                                            <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(notes.correctedDireccion + ", Senillosa, Neuquen, Argentina")}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ color: '#b45309', textDecoration: 'underline', fontWeight: 600 }}
                                            >
                                                {notes.correctedDireccion} (Corregida)
                                            </a>
                                        </div>
                                    )}
                                    {notes.correctedTelefono && (
                                        <div className="info-row" style={{ fontSize: '0.9rem', margin: 0 }}>
                                            <FaPhone style={{ color: '#b45309' }} />
                                            <a
                                                href={`https://wa.me/+549${notes.correctedTelefono.replace(/\D/g, '')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ color: '#b45309', textDecoration: 'underline', fontWeight: 600 }}
                                            >
                                                {notes.correctedTelefono} (Corregido)
                                            </a>
                                        </div>
                                    )}
                                    {notes.adminNotes && (
                                        <div style={{ marginTop: '5px', padding: '10px', background: '#fef3c7', borderRadius: '4px', fontSize: '0.9rem', color: '#92400e', whiteSpace: 'pre-wrap' }}>
                                            <strong>Nota Admin:</strong><br />
                                            {notes.adminNotes}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>No hay observaciones para este cliente.</p>
                            )}
                        </div>

                    </div >
                </div >
            </div >

            {toastMessage && (
                <div style={{
                    position: 'absolute',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#333',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    zIndex: 9999,
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    <FaCheck color="#4ade80" />
                    {toastMessage}
                </div>
            )}

            <PriceEditModal
                isOpen={priceEditModal.isOpen}
                onClose={() => setPriceEditModal(prev => ({ ...prev, isOpen: false }))}
                itemName={priceEditModal.item ? priceEditModal.item.name : ''}
                currentPrice={priceEditModal.currentPrice}
                onSave={async (newPrice) => {
                    if (priceEditModal.item) {
                        try {
                            const updatedItems = order.items.map((it: any) => 
                                (it.id === priceEditModal.item.id && it.variant === priceEditModal.item.variant) 
                                    ? { ...it, price: newPrice }
                                    : it
                            );
                            const newTotal = updatedItems.reduce((acc: number, it: any) => acc + (it.price * (it.quantity || 1)), 0);
                            
                            await updateDoc(doc(db, "orders", order.id), {
                                items: updatedItems,
                                total: newTotal
                            });
                            
                            showToast("Precio actualizado");
                        } catch (err) {
                            console.error("Error al editar precio", err);
                            showToast("Error al guardar");
                        }
                    }
                }}
            />

            {mapModalOpen && (
                <MapLocationPickerModal
                    isOpen={mapModalOpen}
                    onClose={() => setMapModalOpen(false)}
                    initialLocation={order.cliente.location}
                    onSave={async (location) => {
                        try {
                            const orderRef = doc(db, 'orders', order.id);
                            await updateDoc(orderRef, {
                                'cliente.location': location
                            });
                            setMapModalOpen(false);
                            showToast("Ubicación fijada exitosamente");
                        } catch (error) {
                            console.error("Error saving location:", error);
                            alert("Error al guardar la ubicación.");
                        }
                    }}
                />
            )}

            {editAddressModalOpen && (
                <TextEditModal
                    isOpen={editAddressModalOpen}
                    onClose={() => setEditAddressModalOpen(false)}
                    onSave={handleUpdateAddress}
                    title="Editar Dirección"
                    label="Nueva dirección del cliente:"
                    currentText={order.cliente.direccion || ''}
                />
            )}

            {editPhoneModalOpen && (
                <TextEditModal
                    isOpen={editPhoneModalOpen}
                    onClose={() => setEditPhoneModalOpen(false)}
                    onSave={handleUpdatePhone}
                    title="Editar Teléfono"
                    label="Nuevo teléfono del cliente:"
                    currentText={order.cliente.telefono || ''}
                />
            )}

            {editMapsLinkModalOpen && (
                <TextEditModal
                    isOpen={editMapsLinkModalOpen}
                    onClose={() => setEditMapsLinkModalOpen(false)}
                    onSave={handleUpdateMapsLink}
                    title="Link de Google Maps"
                    label="Pegá el link de Maps acá:"
                    currentText={order.cliente.mapsLink || ''}
                />
            )}
        </div >
    );
}
