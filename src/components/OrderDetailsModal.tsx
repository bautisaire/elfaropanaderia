
import React from 'react';
import { FaCalendarAlt, FaUser, FaMapMarkerAlt, FaPhone, FaCreditCard, FaEdit, FaCopy, FaTimes } from 'react-icons/fa';
import { generateOrderMessage } from "../utils/telegram";

interface OrderDetailsModalProps {
    order: any;
    onClose: () => void;
    onEdit: (order: any) => void;
    onStatusChange: (id: string, status: string) => void;
    onSourceChange: (id: string, source: string) => void;
    statusOptions: any[];
}

const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ order, onClose, onEdit, onStatusChange, onSourceChange, statusOptions }) => {
    if (!order) return null;

    const currentStatus = statusOptions.find(s => s.value === order.status) || statusOptions[0];
    const dateStr = order.date?.seconds
        ? new Date(order.date.seconds * 1000).toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        })
        : "Fecha desc.";

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="edit-order-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Detalle del Pedido #{order.id.slice(-6)}</h3>
                    <button className="close-modal-btn" onClick={onClose}><FaTimes /></button>
                </div>

                <div className="edit-modal-body">
                    {/* Header Info */}
                    <div className="edit-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span className="order-date"><FaCalendarAlt /> {dateStr}</span>
                            <div className="status-selector-wrapper" style={{ borderColor: currentStatus.color }}>
                                <span className="status-icon" style={{ color: currentStatus.color }}>{currentStatus.icon}</span>
                                <select
                                    value={order.status}
                                    onChange={(e) => onStatusChange(order.id, e.target.value)}
                                    className="status-dropdown"
                                    style={{ color: currentStatus.color }}
                                >
                                    {statusOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {order.source && (
                            <div className="source-selector-wrapper">
                                <select
                                    value={
                                        order.source === 'pos_wholesale' ? 'pos_wholesale' :
                                            (order.source === 'pos_public' || order.source === 'pos') ? 'pos_public' :
                                                'delivery'
                                    }
                                    onChange={(e) => onSourceChange(order.id, e.target.value)}
                                    style={{
                                        fontSize: '0.9rem',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: '1px solid #e5e7eb',
                                        width: '100%'
                                    }}
                                >
                                    <option value="pos_public">Local</option>
                                    <option value="delivery">Delivery</option>
                                    <option value="pos_wholesale">Despensa</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Client Info */}
                    <div className="edit-section">
                        <h4><FaUser /> Cliente</h4>
                        <div className="info-row"><strong>{order.cliente.nombre}</strong></div>
                        <div className="info-row">
                            <FaMapMarkerAlt className="icon-muted" />
                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.cliente.direccion + ", Senillosa, Neuquen, Argentina")}`}
                                target="_blank"
                                rel="noopener noreferrer"
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
                                style={{ color: 'inherit', textDecoration: 'underline' }}
                            >
                                {order.cliente.telefono}
                            </a>
                            <button
                                onClick={() => {
                                    const msg = generateOrderMessage(order);
                                    navigator.clipboard.writeText(msg);
                                    alert("Mensaje copiado"); // Using alert temporarily, should be toast
                                }}
                                title="Copiar mensaje"
                                style={{ marginLeft: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
                            >
                                <FaCopy />
                            </button>
                        </div>
                        <div className="info-row"><FaCreditCard className="icon-muted" /> {order.cliente.metodoPago}</div>
                        {order.cliente.indicaciones && (
                            <div className="order-note">"{order.cliente.indicaciones}"</div>
                        )}
                    </div>

                    {/* Items */}
                    <div className="edit-section">
                        <h4>Detalle de Productos</h4>
                        <ul className="order-items-list">
                            {order.items.map((item: any, index: number) => (
                                <li key={index} className="order-item">
                                    <div className="order-item-detail">
                                        <span className="item-qty">{Number(item.quantity).toFixed(3).replace(/\.?0+$/, "")}x</span>
                                        <span className="item-name">{item.name} {item.variant ? `(${item.variant})` : ''}</span>
                                    </div>
                                    <span className="item-price">${Math.ceil(item.price * (item.quantity || 1))}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="order-total-row">
                            <span>Total a cobrar:</span>
                            <span className="total-amount">${Math.ceil(order.total)}</span>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn-secondary" onClick={() => onEdit(order)}><FaEdit /> Editar Pedido</button>
                    <button className="btn-primary" onClick={onClose}>Cerrar</button>
                </div>
            </div>
        </div>
    );
};

export default OrderDetailsModal;
