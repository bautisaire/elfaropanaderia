import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { FaTrash, FaUserPlus, FaChevronDown, FaChevronUp, FaMoneyBillWave } from 'react-icons/fa';
import { useCart } from '../context/CartContext';

interface AdminRole {
  email: string;
  dashboard: boolean;
  orders: boolean;
  orders_can_cancel: boolean;
  orders_can_modify: boolean;
  orders_can_change_payment: boolean;
  orders_can_assign_deliveries: boolean;
  pos_sales: boolean;
  store_editor: boolean;
  costs: boolean;
  stock: boolean;
  settings: boolean;
  employees: boolean;
  raffle: boolean;
  is_rider: boolean;
}

const PERMISSIONS_MAP = [
  { key: 'dashboard', label: 'Dashboard (Gráficos y Resumen)' },
  { key: 'orders', label: 'Ventas (Deliveries)' },
  { key: 'orders_can_cancel', label: '↳ Permitir cancelar pedidos' },
  { key: 'orders_can_modify', label: '↳ Permitir modificar pedidos' },
  { key: 'orders_can_change_payment', label: '↳ Permitir cambiar método de pago' },
  { key: 'orders_can_assign_deliveries', label: '↳ Permitir asignar deliveries a riders' },
  { key: 'pos_sales', label: 'Ventas POS (Punto de Venta Local)' },
  { key: 'store_editor', label: 'Editor de Tienda (Banners, etc.)' },
  { key: 'costs', label: 'Productos, Costos y Recetas' },
  { key: 'stock', label: 'Gestión de Stock' },
  { key: 'employees', label: 'Personal (Empleados, Horarios, Anticipos)' },
  { key: 'raffle', label: 'Sorteos' },
  { key: 'settings', label: 'Configuración (Delivery, etc.)' },
  { key: 'is_rider', label: 'Rol: Repartidor (Rider)' }
];

export default function AdminRolesManager() {
  const { isSuperAdmin } = useCart();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [extraModalData, setExtraModalData] = useState<{email: string} | null>(null);
  const [extraAmount, setExtraAmount] = useState<string>('');
  const [extraDate, setExtraDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [extraDescription, setExtraDescription] = useState<string>('');

  useEffect(() => {
    if (!isSuperAdmin) return;
    
    const unsub = onSnapshot(collection(db, 'admin_roles'), (snap) => {
      const data: AdminRole[] = [];
      snap.forEach((d) => {
        data.push({ email: d.id, ...(d.data() as Omit<AdminRole, 'email'>) });
      });
      setRoles(data);
      setLoading(false);
    });

    return () => unsub();
  }, [isSuperAdmin]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes('@')) {
      alert("Ingrese un email válido.");
      return;
    }

    const emailKey = newEmail.trim().toLowerCase();
    
    if (emailKey === 'sairebautista@gmail.com') {
       alert("No puedes modificar los permisos del superadministrador.");
       return;
    }

    try {
      await setDoc(doc(db, 'admin_roles', emailKey), {
        dashboard: false,
        orders: false,
        orders_can_cancel: false,
        orders_can_modify: false,
        orders_can_change_payment: false,
        orders_can_assign_deliveries: false,
        pos_sales: false,
        store_editor: false,
        costs: false,
        stock: false,
        settings: false,
        employees: false,
        raffle: false,
        is_rider: false
      });
      setNewEmail('');
      alert(`Administrador ${emailKey} agregado. Configura sus permisos.`);
      setExpandedEmail(emailKey);
    } catch (err) {
      console.error(err);
      alert("Error al agregar administrador.");
    }
  };

  const handleDeleteAdmin = async (email: string) => {
    if (window.confirm(`¿Estás seguro de quitar acceso a ${email}?`)) {
      try {
        await deleteDoc(doc(db, 'admin_roles', email));
        if (expandedEmail === email) setExpandedEmail(null);
      } catch (err) {
        console.error(err);
        alert("Error al eliminar administrador.");
      }
    }
  };

  const handleTogglePermission = async (email: string, key: string, currentValue: boolean) => {
    try {
      await updateDoc(doc(db, 'admin_roles', email), {
        [key]: !currentValue
      });
    } catch (err) {
      console.error('Error toggling permission:', err);
      alert('Error al actualizar permisos');
    }
  };

  const handleAddExtra = async () => {
    if (!extraModalData || !extraAmount) return;
    try {
      await addDoc(collection(db, 'rider_extras'), {
        riderEmail: extraModalData.email,
        amount: Number(extraAmount),
        date: extraDate,
        description: extraDescription,
        createdAt: new Date()
      });
      alert('Bono/Extra asignado correctamente.');
      setExtraModalData(null);
      setExtraAmount('');
      setExtraDescription('');
    } catch (error) {
      console.error('Error adding extra:', error);
      alert('Error al asignar el extra.');
    }
  };

  if (!isSuperAdmin) return null;
  if (loading) return <div>Cargando roles...</div>;

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
      <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
        Control de Acceso (RBAC)
      </h3>
      <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '20px' }}>
        Administra los correos electrónicos que tienen acceso al panel de control y configura las secciones que pueden visualizar. El superadministrador (sairebautista@gmail.com) tiene acceso total por defecto.
      </p>

      <form onSubmit={handleAddAdmin} style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
        <input 
          type="email"
          placeholder="nuevo.admin@gmail.com"
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          style={{ flexGrow: 1, padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
        />
        <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          <FaUserPlus /> Agregar
        </button>
      </form>

      {loading ? (
        <p>Cargando administradores...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {roles.length === 0 && <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No hay otros administradores configurados.</p>}
          
          {roles.map(role => (
            <div key={role.email} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              
              {/* Header */}
              <div 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: expandedEmail === role.email ? '#f8fafc' : '#fff', cursor: 'pointer', transition: 'background 0.2s' }}
                onClick={() => setExpandedEmail(expandedEmail === role.email ? null : role.email)}
              >
                <div style={{ fontWeight: 'bold', color: '#334155' }}>
                  {role.email}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  {role.is_rider && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setExtraModalData({ email: role.email }); }}
                      style={{ background: '#dcfce7', border: '1px solid #22c55e', color: '#16a34a', cursor: 'pointer', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                      title="Asignar Bono o Extra al Repartidor"
                    >
                      <FaMoneyBillWave /> Asignar Extra
                    </button>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteAdmin(role.email); }}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '5px' }}
                    title="Eliminar Administrador"
                  >
                    <FaTrash />
                  </button>
                  <span style={{ color: '#64748b' }}>
                    {expandedEmail === role.email ? <FaChevronUp /> : <FaChevronDown />}
                  </span>
                </div>
              </div>

              {/* Body (Permissions Toggles) */}
              {expandedEmail === role.email && (
                <div style={{ padding: '20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 15px 0', color: '#475569', fontSize: '0.95rem' }}>Permisos Habilitados</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
                    {PERMISSIONS_MAP.map(perm => {
                      // @ts-ignore
                      const isEnabled = role[perm.key] === true;
                      return (
                        <div key={perm.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                          <span style={{ fontSize: '0.9rem', color: '#334155' }}>{perm.label}</span>
                          
                          {/* Toggle Switch */}
                          <div 
                            onClick={() => handleTogglePermission(role.email, perm.key, isEnabled)}
                            style={{
                              width: '44px',
                              height: '24px',
                              background: isEnabled ? '#10b981' : '#cbd5e1',
                              borderRadius: '12px',
                              position: 'relative',
                              cursor: 'pointer',
                              transition: 'background 0.3s'
                            }}
                          >
                            <div style={{
                              width: '20px',
                              height: '20px',
                              background: '#fff',
                              borderRadius: '50%',
                              position: 'absolute',
                              top: '2px',
                              left: isEnabled ? '22px' : '2px',
                              transition: 'left 0.3s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          ))}
        </div>
      )}

      {/* Rider Extra Modal */}
      {extraModalData && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, color: '#334155' }}>Asignar Bono / Extra</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b' }}>Repartidor: {extraModalData.email}</p>
            
            <div style={{ marginTop: '15px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: '#475569' }}>Monto ($)</label>
              <input type="number" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} placeholder="Ej: 5000" />
            </div>

            <div style={{ marginTop: '15px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: '#475569' }}>Fecha</label>
              <input type="date" value={extraDate} onChange={(e) => setExtraDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>

            <div style={{ marginTop: '15px', marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: '#475569' }}>Descripción (Opcional)</label>
              <input type="text" value={extraDescription} onChange={(e) => setExtraDescription(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} placeholder="Ej: Propina local, lluvia..." />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setExtraModalData(null)} style={{ padding: '10px 15px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancelar</button>
              <button onClick={handleAddExtra} disabled={!extraAmount} style={{ padding: '10px 15px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: extraAmount ? 'pointer' : 'not-allowed', fontWeight: 'bold', opacity: extraAmount ? 1 : 0.5 }}>Asignar Extra</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}