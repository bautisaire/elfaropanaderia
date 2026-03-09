import { useState } from 'react';
import { FaUser, FaMapMarkerAlt, FaPhone, FaCreditCard, FaEdit, FaCopy, FaTimes, FaCheck } from 'react-icons/fa';
import { generateOrderMessage, generateOrderMessageShort } from "../utils/telegram";

interface OrderDetailsExpandedProps {
    order: any;
    onEdit: (order: any) => void;
    onSourceChange: (id: string, source: string) => void;
    onPaymentMethodChange?: (id: string, newMethod: string) => void;
    onClose: () => void;
    onDelete?: (id: string, restoreStock: boolean) => void;
    isSuperAdmin?: boolean;
}

export default function OrderDetailsExpanded({ order, onClose, onEdit, onSourceChange, onPaymentMethodChange, onDelete, isSuperAdmin }: OrderDetailsExpandedProps) {
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 2000);
    };


    if (!order) return null;

    return (
        <div className="order-details-wrapper" onClick={onClose} style={{ cursor: 'pointer' }}>
            <div className="order-details-expanded" onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                {/* Mobile Close Button */}
                <button className="mobile-close-btn" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                    <FaTimes />
                </button>

                <div className="expanded-content">
                    {/* Header Info - Simplified since table has some already */}
                    <div className="expanded-section">
                        <div className="expanded-header-row">
                            <h4>Ticket #{/^\d+$/.test(order.id) ? order.id : order.id.slice(-6)}</h4>
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
