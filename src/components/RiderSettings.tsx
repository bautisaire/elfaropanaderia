import { useState } from 'react';
import { FaTimes, FaCog } from 'react-icons/fa';
import './RiderDashboard.css';

export default function RiderSettings() {
    const [quickReplies, setQuickReplies] = useState<string[]>(() => {
        const saved = localStorage.getItem('riderQuickReplies');
        return saved ? JSON.parse(saved) : [];
    });
    const [newReply, setNewReply] = useState('');

    const handleSaveReply = () => {
        if (newReply.trim() && quickReplies.length < 5) {
            const updated = [...quickReplies, newReply.trim()];
            setQuickReplies(updated);
            localStorage.setItem('riderQuickReplies', JSON.stringify(updated));
            setNewReply('');
        }
    };

    const handleDeleteReply = (index: number) => {
        const updated = quickReplies.filter((_, i) => i !== index);
        setQuickReplies(updated);
        localStorage.setItem('riderQuickReplies', JSON.stringify(updated));
    };

    return (
        <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <FaCog size={24} color="#64748b" />
                <h2 style={{ margin: 0, color: '#1e293b' }}>Configurar Respuestas</h2>
            </div>
            
            <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <p style={{ color: '#64748b', fontSize: '0.95rem', marginTop: 0, marginBottom: '20px' }}>
                    Agrega hasta 5 mensajes predeterminados para copiar rápidamente y enviar a los clientes desde el panel de pedidos activos.
                </p>
                
                <div className="rider-quick-replies-list">
                    {quickReplies.length === 0 && (
                        <div style={{ color: '#94a3b8', fontStyle: 'italic', marginBottom: '15px' }}>
                            No has agregado ningún mensaje.
                        </div>
                    )}
                    {quickReplies.map((reply, i) => (
                        <div key={i} className="rider-quick-reply-edit-item">
                            <span>{reply}</span>
                            <button onClick={() => handleDeleteReply(i)} title="Eliminar"><FaTimes /></button>
                        </div>
                    ))}
                </div>

                {quickReplies.length < 5 && (
                    <div className="rider-quick-reply-input" style={{ marginTop: '20px' }}>
                        <input 
                            type="text" 
                            placeholder="Ej: Estoy afuera del domicilio" 
                            value={newReply} 
                            onChange={(e) => setNewReply(e.target.value)}
                        />
                        <button onClick={handleSaveReply}>Guardar</button>
                    </div>
                )}
                {quickReplies.length >= 5 && (
                    <div style={{ marginTop: '15px', color: '#f59e0b', fontSize: '0.9rem', fontWeight: 'bold' }}>
                        Has alcanzado el límite de 5 mensajes.
                    </div>
                )}
            </div>
        </div>
    );
}
