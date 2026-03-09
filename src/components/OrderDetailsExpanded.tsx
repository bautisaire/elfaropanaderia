import { useState, useEffect } from 'react';
import { FaUser, FaMapMarkerAlt, FaPhone, FaCreditCard, FaEdit, FaCopy, FaTimes, FaCheck, FaSave } from 'react-icons/fa';
import { generateOrderMessage, generateOrderMessageShort } from "../utils/telegram";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";

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
}

export default function OrderDetailsExpanded({ order, onClose, onEdit, onSourceChange, onPaymentMethodChange, onStatusChange, onDelete, isSuperAdmin }: OrderDetailsExpandedProps) {
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 2000);
    };

    // --- Customer Notes Logic ---
    const customerId = order?.cliente?.deviceId || order?.cliente?.telefono?.replace(/\D/g, '') || "unknown";
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
                                <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); onEdit(order); }}>
                                    <FaEdit /> Editar Pedido
                                </button>
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
                                <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.cliente.direccion + ", Senillosa, Neuquen, Argentina")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ color: 'inherit', textDecoration: 'underline' }}
                                >
                                    {order.cliente.direccion}
                                </a >
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
                                {onPaymentMethodChange ? (
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
                                                {statusOptions.map(opt => (
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
                        </div >

                        {/* Items */}
                        < div className="expanded-section items-section-expanded" >
                            <h5>Detalle de Productos</h5>
                            <ul className="order-items-list-expanded">
                                {order.items.map((item: any, index: number) => (
                                    <li key={index} className="order-item-expanded">
                                        <div className="order-item-detail">
                                            <span className="item-qty">{Number(item.quantity).toFixed(2).replace(/\.?0+$/, "")}x</span>
                                            <span className="item-name">{item.name} {item.variant ? `(${item.variant})` : ''}</span>
                                        </div>
                                        <span className="item-price">${Math.ceil(item.price * (item.quantity || 1))}</span>
                                    </li>
                                ))}
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
        </div >
    );
}
