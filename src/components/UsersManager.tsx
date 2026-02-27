import { useState, useEffect } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';
import { FaUser, FaChevronDown } from 'react-icons/fa';
import './StoreEditor.css';

export default function UsersManager() {
    const [usersList, setUsersList] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'users'), (snap) => {
            const usersData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUsersList(usersData);
        });
        return () => unsubscribe();
    }, []);

    const filteredUsers = usersList.filter(u =>
        (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.phone || '').includes(searchQuery)
    );

    return (
        <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginBottom: '15px', color: '#333' }}>Usuarios Registrados ({filteredUsers.length})</h3>

            <input
                type="text"
                placeholder="Buscar por email o número de celular..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #ccc',
                    marginBottom: '20px',
                    fontSize: '1rem',
                    outline: 'none'
                }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {filteredUsers.map(user => (
                    <UserCard key={user.id} user={user} />
                ))}
                {filteredUsers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                        No se encontraron usuarios.
                    </div>
                )}
            </div>
        </div>
    );
}

const UserCard = ({ user }: { user: any }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div style={{ border: `1px solid ${expanded ? '#e65c00' : '#ddd'}`, borderRadius: '8px', padding: '15px', backgroundColor: '#fff', cursor: 'pointer', transition: 'border-color 0.3s' }} onClick={() => setExpanded(!expanded)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ background: '#e65c00', color: '#fff', padding: '12px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FaUser size={18} />
                    </div>
                    <div>
                        <h4 style={{ margin: '0', color: '#333', fontSize: '1.05rem' }}>{user.email || 'Email no disponible'}</h4>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.9rem', color: '#666' }}>
                            Cel: {user.phone ? `+54 ${user.phone}` : 'No ingresado'}
                        </p>
                    </div>
                </div>
                <div style={{ transition: 'transform 0.3s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                    <FaChevronDown color="#999" />
                </div>
            </div>

            {expanded && (
                <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #eee', cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <h5 style={{ margin: '0 0 10px 0', color: '#444' }}>Direcciones Guardadas:</h5>
                    {(!user.addresses || user.addresses.length === 0) ? (
                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#888', fontStyle: 'italic' }}>
                            Oops, este usuario aún no completó direcciones.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {user.addresses.map((a: any, i: number) => (
                                <div key={i} style={{ background: '#f9f9f9', padding: '12px', borderRadius: '6px', fontSize: '0.9rem', border: '1px solid #f0f0f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                        <strong style={{ color: '#222' }}>{a.alias || 'Dirección'}</strong>
                                        {a.isMain && <span style={{ color: '#fff', background: '#e65c00', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>Principal</span>}
                                    </div>
                                    <div style={{ color: '#555' }}>
                                        {a.calle} {a.numero} {a.piso ? ` - Piso: ${a.piso}` : ''} {a.depto ? ` - Depto: ${a.depto}` : ''}
                                    </div>
                                    <div style={{ color: '#777', fontSize: '0.85rem', marginTop: '3px' }}>
                                        {a.ciudad}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
