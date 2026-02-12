import React from 'react';
import { FaUser, FaMapMarkerAlt, FaPhone, FaCreditCard, FaEdit, FaCopy, FaTimes } from 'react-icons/fa';
import { generateOrderMessage } from "../utils/telegram";

interface OrderDetailsExpandedProps {
    order: any;
    onEdit: (order: any) => void;
    onSourceChange: (id: string, source: string) => void;
    onClose: () => void;
}

const OrderDetailsExpanded: React.FC<OrderDetailsExpandedProps> = ({ order, onEdit, onSourceChange, onClose }) => {
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
                            <h4>Ticket #{order.id.slice(-6)}</h4>
                            <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); onEdit(order); }}>
                                <FaEdit /> Editar Pedido
                            </button>
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
                                </a>
                            </div>
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
                                        alert("Mensaje copiado");
                                    }}
                                    title="Copiar mensaje"
                                    className="copy-btn-inline"
                                >
                                    <FaCopy />
                                </button>
                            </div>
                            <div className="info-row"><FaCreditCard className="icon-muted" /> {order.cliente.metodoPago}</div>
                            {order.cliente.indicaciones && (
                                <div className="order-note-expanded">"{order.cliente.indicaciones}"</div>
                            )}

                            {order.source && (
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
                            )}
                        </div>

                        {/* Items */}
                        <div className="expanded-section items-section-expanded">
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
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderDetailsExpanded;
