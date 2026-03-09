import React, { useEffect, useState } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch, query, where } from 'firebase/firestore';
import { FaEdit, FaTrash, FaSave, FaTimes, FaPlus, FaGripVertical, FaEye, FaEyeSlash } from 'react-icons/fa';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './CategoryManager.css';

interface Category {
    id: string;
    name: string;
    order?: number;
    isVisible?: boolean;
}

// Subcomponente para cada fila arrastrable
function SortableItem(props: { category: Category; editingId: string | null; editName: string; setEditName: (s: string) => void; saveEdit: () => void; cancelEdit: () => void; startEdit: (c: Category) => void; handleDelete: (id: string) => void; toggleVisibility: (c: Category) => void }) {
    const { category, editingId, editName, setEditName, saveEdit, cancelEdit, startEdit, handleDelete, toggleVisibility } = props;

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 5 : 1,
        position: 'relative' as 'relative',
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="cat-item">
            {/* Handle para arrastrar */}
            <div className="cat-drag-handle" {...attributes} {...listeners}>
                <FaGripVertical color="#ccc" />
            </div>

            {editingId === category.id ? (
                <div className="cat-edit-mode">
                    <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                    />
                    <button onClick={saveEdit} className="btn-save" title="Guardar"><FaSave /></button>
                    <button onClick={cancelEdit} className="btn-cancel" title="Cancelar"><FaTimes /></button>
                </div>
            ) : (
                <div className="cat-view-mode">
                    <span style={{ textDecoration: category.isVisible === false ? 'line-through' : 'none', color: category.isVisible === false ? '#999' : 'inherit' }}>{category.name}</span>
                    <div className="cat-actions">
                        <button onClick={() => toggleVisibility(category)} className="btn-edit" style={{ background: 'transparent', color: '#666' }} title={category.isVisible !== false ? "Ocultar en Home" : "Mostrar en Home"}>
                            {category.isVisible !== false ? <FaEye /> : <FaEyeSlash color="#999" />}
                        </button>
                        <button onClick={() => startEdit(category)} className="btn-edit" title="Editar"><FaEdit /></button>
                        <button onClick={() => handleDelete(category.id)} className="btn-delete" title="Eliminar"><FaTrash /></button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CategoryManager() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [newCatName, setNewCatName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "categories"));
            let cats = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name,
                order: doc.data().order ?? 9999,
                isVisible: doc.data().isVisible !== false
            })) as Category[];

            // Ordenar por campo 'order', luego alfabéticamente
            cats.sort((a, b) => {
                if ((a.order ?? 0) !== (b.order ?? 0)) {
                    return (a.order ?? 0) - (b.order ?? 0);
                }
                return a.name.localeCompare(b.name);
            });

            setCategories(cats);
        } catch (error) {
            console.error(error);
            setMsg("Error al cargar categorías");
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCatName.trim()) return;
        try {
            // Nuevo orden es el final de la lista actual
            const newOrder = categories.length;
            await addDoc(collection(db, "categories"), {
                name: newCatName.trim(),
                order: newOrder
            });
            setNewCatName("");
            setMsg("Categoría agregada");
            fetchCategories();
        } catch (error) {
            console.error(error);
            setMsg("Error al agregar");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Eliminar esta categoría?")) return;
        try {
            await deleteDoc(doc(db, "categories", id));
            setMsg("Categoría eliminada");
            // Remove locally too before fetching to feel snappier
            setCategories(prev => prev.filter(c => c.id !== id));
            fetchCategories();
        } catch (error) {
            console.error(error);
            setMsg("Error al eliminar");
        }
    };

    const startEdit = (cat: Category) => {
        setEditingId(cat.id);
        setEditName(cat.name);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditName("");
    };

    const saveEdit = async () => {
        if (!editingId || !editName.trim()) return;

        const cat = categories.find(c => c.id === editingId);
        if (!cat) return;

        const oldName = cat.name;
        const newName = editName.trim();

        if (oldName === newName) {
            cancelEdit();
            return;
        }

        try {
            await updateDoc(doc(db, "categories", editingId), { name: newName });

            // Actualización en cascada a todos los productos con esta categoría
            const productsRef = collection(db, "products");
            const q = query(productsRef, where("categoria", "==", oldName));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const batch = writeBatch(db);
                querySnapshot.forEach((docSnap) => {
                    batch.update(docSnap.ref, { categoria: newName });
                });
                await batch.commit();
            }

            setEditingId(null);
            setMsg("Categoría y productos actualizados");

            setCategories(prev => prev.map(c => c.id === editingId ? { ...c, name: newName } : c));
        } catch (error) {
            console.error(error);
            setMsg("Error al actualizar");
        }
    };

    const toggleVisibility = async (cat: Category) => {
        const newVis = cat.isVisible === false ? true : false;
        try {
            await updateDoc(doc(db, "categories", cat.id), { isVisible: newVis });
            setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, isVisible: newVis } : c));
            setMsg(newVis ? "Categoría visible" : "Categoría oculta");
        } catch (error) {
            console.error("Error al cambiar visibilidad:", error);
            setMsg("Error al cambiar visibilidad");
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setCategories((items) => {
            const oldIndex = items.findIndex((i) => i.id === active.id);
            const newIndex = items.findIndex((i) => i.id === over.id);
            const newItems = arrayMove(items, oldIndex, newIndex);

            // Persistir nuevo orden en Firestore
            updateOrderInFirestore(newItems);

            return newItems;
        });
    };

    const updateOrderInFirestore = async (items: Category[]) => {
        try {
            const batch = writeBatch(db);
            items.forEach((item, index) => {
                const ref = doc(db, "categories", item.id);
                // Solo escribimos si el orden real cambió
                if (item.order !== index) {
                    batch.update(ref, { order: index });
                }
            });
            await batch.commit();
            // console.log("Orden actualizado");
        } catch (error) {
            console.error("Error guardando orden:", error);
            setMsg("Error al guardar el nuevo orden");
        }
    };

    return (
        <div className="category-manager">
            <h2>Gestor de Categorías</h2>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '15px' }}>Arrastra las filas para reordenar las categorías.</p>

            {msg && <div className="msg-banner">{msg}</div>}

            <div className="cat-form-section">
                <form onSubmit={handleAdd} className="add-cat-form">
                    <input
                        type="text"
                        placeholder="Nueva Categoría..."
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                    />
                    <button type="submit" className="btn-primary" disabled={!newCatName.trim()} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <FaPlus /> Agregar
                    </button>
                </form>
            </div>

            <div className="cat-list-section">
                {loading && categories.length === 0 ? <p>Cargando...</p> : (
                    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={categories} strategy={verticalListSortingStrategy}>
                            <div className="cat-list">
                                {categories.map(cat => (
                                    <SortableItem
                                        key={cat.id}
                                        category={cat}
                                        editingId={editingId}
                                        editName={editName}
                                        setEditName={setEditName}
                                        saveEdit={saveEdit}
                                        cancelEdit={cancelEdit}
                                        startEdit={startEdit}
                                        handleDelete={handleDelete}
                                        toggleVisibility={toggleVisibility}
                                    />
                                ))}
                                {categories.length === 0 && <p className="empty-msg">No hay categorías. Crea una.</p>}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>
        </div>
    );
}
