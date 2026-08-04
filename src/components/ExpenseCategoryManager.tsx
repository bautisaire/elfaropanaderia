import { useState } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { FaEdit, FaLock, FaPlus, FaSave, FaTimes, FaTrash } from 'react-icons/fa';
import { ExpenseCategory, FALLBACK_CATEGORY_KEY, slugifyCategoryKey, useExpenseCategories } from '../hooks/useExpenseCategories';
import './ExpenseCategoryManager.css';

interface ExpenseCategoryManagerProps {
    onClose: () => void;
}

export default function ExpenseCategoryManager({ onClose }: ExpenseCategoryManagerProps) {
    const { categories } = useExpenseCategories();

    const [newLabel, setNewLabel] = useState('');
    const [newIcon, setNewIcon] = useState('🏷️');
    const [saving, setSaving] = useState(false);

    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [editIcon, setEditIcon] = useState('');

    const [deletingKey, setDeletingKey] = useState<string | null>(null);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const label = newLabel.trim();
        if (!label) return;

        setSaving(true);
        try {
            const key = slugifyCategoryKey(label, categories.map(c => c.key));
            await setDoc(doc(db, 'expense_categories', key), {
                label,
                icon: newIcon.trim() || '🏷️',
                locked: false,
                order: categories.length
            });
            setNewLabel('');
            setNewIcon('🏷️');
        } catch (error) {
            console.error('Error creando categoría:', error);
            alert('Ocurrió un error al crear la categoría.');
        } finally {
            setSaving(false);
        }
    };

    const startEditing = (cat: ExpenseCategory) => {
        setEditingKey(cat.key);
        setEditLabel(cat.label);
        setEditIcon(cat.icon);
    };

    const handleSaveEdit = async (key: string) => {
        const label = editLabel.trim();
        if (!label) return;

        setSaving(true);
        try {
            // La key (id del doc, y valor guardado en expenses.type) no cambia: al renombrar
            // solo se actualiza el label/icon, por lo que todos los gastos que ya tenían esta
            // categoría muestran automáticamente el nombre nuevo sin tocar sus documentos.
            await updateDoc(doc(db, 'expense_categories', key), {
                label,
                icon: editIcon.trim() || '🏷️'
            });
            setEditingKey(null);
        } catch (error) {
            console.error('Error actualizando categoría:', error);
            alert('Ocurrió un error al actualizar la categoría.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (cat: ExpenseCategory) => {
        if (cat.locked) return;
        if (!window.confirm(`¿Eliminar la categoría "${cat.label}"? Los gastos que ya la tenían pasarán a "Otro".`)) return;

        setDeletingKey(cat.key);
        try {
            // Reasignar los gastos existentes con esta categoría al fallback antes de borrarla,
            // para que ningún registro quede con un type huérfano.
            const q = query(collection(db, 'expenses'), where('type', '==', cat.key));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const batch = writeBatch(db);
                snap.docs.forEach(d => batch.update(d.ref, { type: FALLBACK_CATEGORY_KEY }));
                await batch.commit();
            }
            await deleteDoc(doc(db, 'expense_categories', cat.key));
        } catch (error) {
            console.error('Error eliminando categoría:', error);
            alert('Ocurrió un error al eliminar la categoría.');
        } finally {
            setDeletingKey(null);
        }
    };

    return (
        <div className="ecm-overlay" onClick={onClose}>
            <div className="ecm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ecm-header">
                    <h3>Categorías de Gastos</h3>
                    <button className="ecm-close-btn" onClick={onClose}><FaTimes /></button>
                </div>

                <ul className="ecm-list">
                    {categories.map(cat => (
                        <li key={cat.key} className="ecm-row">
                            {editingKey === cat.key ? (
                                <>
                                    <input
                                        className="ecm-icon-input"
                                        value={editIcon}
                                        onChange={e => setEditIcon(e.target.value)}
                                        maxLength={4}
                                    />
                                    <input
                                        className="ecm-label-input"
                                        value={editLabel}
                                        onChange={e => setEditLabel(e.target.value)}
                                        autoFocus
                                        onKeyDown={e => e.key === 'Enter' && handleSaveEdit(cat.key)}
                                    />
                                    <button className="ecm-icon-btn save" disabled={saving} onClick={() => handleSaveEdit(cat.key)} title="Guardar"><FaSave /></button>
                                    <button className="ecm-icon-btn cancel" onClick={() => setEditingKey(null)} title="Cancelar"><FaTimes /></button>
                                </>
                            ) : (
                                <>
                                    <span className="ecm-icon">{cat.icon}</span>
                                    <span className="ecm-label">{cat.label}</span>
                                    {cat.locked && <FaLock className="ecm-lock" title="Categoría protegida por el sistema" />}
                                    <button className="ecm-icon-btn edit" onClick={() => startEditing(cat)} title="Editar"><FaEdit /></button>
                                    <button
                                        className="ecm-icon-btn delete"
                                        onClick={() => handleDelete(cat)}
                                        disabled={cat.locked || deletingKey === cat.key}
                                        title={cat.locked ? 'No se puede eliminar' : 'Eliminar'}
                                    >
                                        <FaTrash />
                                    </button>
                                </>
                            )}
                        </li>
                    ))}
                </ul>

                <form className="ecm-add-form" onSubmit={handleAdd}>
                    <input
                        className="ecm-icon-input"
                        value={newIcon}
                        onChange={e => setNewIcon(e.target.value)}
                        maxLength={4}
                        title="Ícono (emoji, opcional)"
                    />
                    <input
                        className="ecm-label-input"
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        placeholder="Nueva categoría (ej. Alquiler)"
                    />
                    <button type="submit" className="ecm-btn-add" disabled={saving || !newLabel.trim()}>
                        <FaPlus /> Añadir
                    </button>
                </form>
            </div>
        </div>
    );
}
