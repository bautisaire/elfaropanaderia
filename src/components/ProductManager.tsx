import React, { useEffect, useState, useRef } from "react";
import { db, storage } from "../firebase/firebaseConfig";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressImage } from "../utils/imageUtils";
import { FaEdit, FaTrash, FaSync, FaTimes, FaCamera } from 'react-icons/fa';
import "./ProductManager.css";

// Interface matching Firestore data structure
export interface FirestoreProduct {
    id?: string;
    nombre: string;
    precio: number;
    categoria: string;
    descripcion: string;
    img: string;
    images?: string[];
    stock: boolean;
    stockQuantity?: number;
    discount?: number;
    variants?: {
        name: string;
        stock: boolean;
    }[];
}

const INITIAL_STATE: FirestoreProduct = {
    nombre: "",
    precio: 0,
    categoria: "General",
    descripcion: "",
    img: "https://via.placeholder.com/150",
    images: [],
    stock: true,
    discount: 0,
    variants: []
};

export default function ProductManager() {
    const [products, setProducts] = useState<FirestoreProduct[]>([]);
    const [categories, setCategories] = useState<string[]>([]); // New state for categories
    const [formData, setFormData] = useState<FirestoreProduct>(INITIAL_STATE);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const formRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        reloadProducts();
        fetchCategories(); // Fetch categories on mount
    }, []);

    const fetchCategories = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "categories"));
            const catsData = querySnapshot.docs.map(doc => ({
                name: doc.data().name,
                order: doc.data().order ?? 9999
            }));

            // Sort by order, then alphabetically
            catsData.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));

            setCategories(catsData.map(c => c.name));
        } catch (error) {
            console.error("Error loading categories:", error);
        }
    };

    const reloadProducts = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "products"));
            const prods: FirestoreProduct[] = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    discount: data.discount || 0,
                    images: data.images || (data.img ? [data.img] : [])
                } as FirestoreProduct;
            });
            setProducts(prods);
        } catch (error) {
            console.error("Error loading products:", error);
            setMessage("Error al cargar productos");
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? Number(value) : value
        }));
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: checked
        }));
    };

    // --- Image Handling ---
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const newImageUrls: string[] = [];
            const prodId = formData.id || "temp_" + Date.now(); // Use temp ID if creating new

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const compressedBlob = await compressImage(file);
                const storageRef = ref(storage, `products/${prodId}/${Date.now()}_${file.name.split('.')[0]}.webp`);
                await uploadBytes(storageRef, compressedBlob);
                const downloadURL = await getDownloadURL(storageRef);
                newImageUrls.push(downloadURL);
            }

            setFormData(prev => {
                const updatedImages = [...(prev.images || []), ...newImageUrls];
                return {
                    ...prev,
                    images: updatedImages,
                    img: updatedImages[0] || prev.img
                };
            });
            setMessage("Imágenes subidas correctamente");
        } catch (error) {
            console.error("Error uploading image:", error);
            setMessage("Error al subir imagen");
        } finally {
            setUploading(false);
        }
    };

    const removeImage = (imageUrl: string) => {
        setFormData(prev => {
            const updatedImages = prev.images?.filter(img => img !== imageUrl) || [];
            return {
                ...prev,
                images: updatedImages,
                img: updatedImages.length > 0 ? updatedImages[0] : ""
            };
        });
    };

    // --- Variants Handling ---
    const handleVariantChange = (idx: number, field: 'name' | 'stock', value: string | boolean) => {
        setFormData(prev => {
            const newVariants = [...(prev.variants || [])];
            // @ts-ignore
            newVariants[idx][field] = value;
            return { ...prev, variants: newVariants };
        });
    };

    const addVariant = () => {
        setFormData(prev => ({
            ...prev,
            variants: [...(prev.variants || []), { name: "", stock: true }]
        }));
    };

    const removeVariant = (idx: number) => {
        setFormData(prev => ({
            ...prev,
            variants: prev.variants?.filter((_, i) => i !== idx)
        }));
    };

    // --- Submit / Reset ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.nombre) return setMessage("El nombre es obligatorio");

        try {
            if (isEditing && formData.id) {
                // Update
                const { id, ...dataToUpdate } = formData;
                await updateDoc(doc(db, "products", id), dataToUpdate);
                setMessage("Producto actualizado");
            } else {
                // Create
                await addDoc(collection(db, "products"), formData);
                setMessage("Producto creado");
            }
            reloadProducts();
            handleReset();
        } catch (error) {
            console.error("Error saving product:", error);
            setMessage("Error al guardar");
        }
    };

    const handleReset = () => {
        setFormData(INITIAL_STATE);
        setIsEditing(false);
        setMessage(null);
    };

    const handleEditClick = (product: FirestoreProduct) => {
        setFormData(product);
        setIsEditing(true);
        // Scroll to form
        formRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Seguro que deseas eliminar este producto?")) return;
        try {
            await deleteDoc(doc(db, "products", id));
            reloadProducts();
            // If we were editing this product, reset form
            if (formData.id === id) {
                handleReset();
            }
            setMessage("Producto eliminado");
        } catch (error) {
            console.error("Error deleting:", error);
            setMessage("Error al eliminar");
        }
    };

    return (
        <div className="product-manager-container">
            {/* --- FORMULARIO DE EDICIÓN COMPACTO --- */}
            <div className="product-editor-form" ref={formRef}>
                <h3>{isEditing ? `Editar: ${formData.nombre}` : "Nuevo Producto"}</h3>

                {message && <div style={{ color: '#0b74ff', marginBottom: '10px', fontWeight: 'bold' }}>{message}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        {/* Fila 1: Nombre (2), Categoria (1), Precio (1) - Total 4 */}
                        <div className="form-group col-span-2">
                            <label>Nombre</label>
                            <input name="nombre" value={formData.nombre} onChange={handleInputChange} placeholder="Ej. Pan Casero" required />
                        </div>

                        <div className="form-group col-span-1">
                            <label>Categoría</label>
                            <select name="categoria" value={formData.categoria} onChange={handleInputChange}>
                                <option value="" disabled>Seleccionar...</option>
                                <option value="General">General</option>
                                {categories.filter(c => c !== "General").map((cat, index) => (
                                    <option key={index} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group col-span-1">
                            <label>Precio ($)</label>
                            <input type="number" name="precio" value={formData.precio} onChange={handleInputChange} min="0" />
                        </div>

                        {/* Fila 2: Descripcion (3), Metadata (1) */}
                        <div className="form-group col-span-3">
                            <label>Descripción</label>
                            <textarea name="descripcion" value={formData.descripcion} onChange={handleInputChange} placeholder="Detalles del producto..." />
                        </div>

                        <div className="form-group col-span-1" style={{ justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label>Descuento (%)</label>
                                <input type="number" name="discount" value={formData.discount || 0} onChange={handleInputChange} min="0" max="100" />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px' }}>
                                <input type="checkbox" name="stock" checked={formData.stock} onChange={handleCheckboxChange} style={{ width: 'auto', height: 'auto' }} />
                                <label style={{ margin: 0 }}>En Stock</label>
                            </div>
                        </div>

                        {/* Fila 3: Imagenes (2) y Variantes (2) */}
                        <div className="form-group col-span-2">
                            <label>Imágenes</label>
                            <div className="image-preview-area">
                                <label className="btn-add-img">
                                    {uploading ? "..." : <><FaCamera /> Fotos</>}
                                    <input type="file" hidden accept="image/*" multiple onChange={handleImageUpload} disabled={uploading} />
                                </label>

                                {formData.images?.map((img, idx) => (
                                    <div key={idx} className="img-thumbnail-wrapper">
                                        <img src={img} alt="preview" className="img-thumbnail" />
                                        <button type="button" className="btn-remove-img" onClick={() => removeImage(img)}><FaTimes /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="form-group col-span-2 variants-container">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label>Variantes</label>
                                <button type="button" className="btn-plain" onClick={addVariant} style={{ padding: '2px 5px', fontSize: '0.75rem', height: 'auto' }}>+ Agregar</button>
                            </div>
                            <div className="variants-list">
                                {formData.variants?.map((v, idx) => (
                                    <div key={idx} className="variant-item">
                                        <input
                                            placeholder="Nombre"
                                            value={v.name}
                                            onChange={(e) => handleVariantChange(idx, 'name', e.target.value)}
                                        />
                                        <input
                                            type="checkbox"
                                            checked={v.stock}
                                            onChange={(e) => handleVariantChange(idx, 'stock', e.target.checked)}
                                            style={{ width: 'auto', height: 'auto' }}
                                        />
                                        <button type="button" className="btn-remove-img" style={{ position: 'static', width: '16px', height: '16px', background: '#ff4444', borderRadius: '50%', fontSize: '10px', opacity: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => removeVariant(idx)}><FaTimes size={10} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn-plain" onClick={handleReset}>Limpiar</button>
                        <button type="submit" className="btn-primary" disabled={loading || uploading}>
                            {isEditing ? "Guardar" : "Crear"}
                        </button>
                    </div>
                </form>
            </div>

            {/* --- LISTA DE INVENTARIO --- */}
            <div className="inventory-section">
                <div className="inventory-header">
                    <h3>Inventario ({products.length})</h3>
                    <button className="btn-plain" onClick={reloadProducts} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><FaSync /> Actualizar</button>
                </div>

                {loading ? <p>Cargando inventario...</p> : (
                    <div className="inventory-grid">
                        {products.map(product => (
                            <div key={product.id} className="admin-product-card">
                                <div className="admin-card-img-container">
                                    <img src={product.img || product.images?.[0]} alt={product.nombre} className="admin-card-img" />
                                </div>
                                <div className="admin-card-body">
                                    <h4 className="admin-card-title">{product.nombre}</h4>
                                    <div className="admin-card-price">${product.precio}</div>
                                    <div className="admin-card-stock">
                                        <span className={`stock-badge ${product.stock ? 'in-stock' : 'out-stock'}`}>
                                            {product.stock ? 'Activo' : 'Inactivo'}
                                        </span>
                                        <span style={{ marginLeft: '10px', fontWeight: 'bold', color: '#333' }}>
                                            Stock: {product.stockQuantity || 0}
                                        </span>
                                        {product.variants && product.variants.length > 0 && (
                                            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#888' }}>
                                                {product.variants.length} var.
                                            </span>
                                        )}
                                    </div>
                                    <div className="admin-card-actions">
                                        <button className="btn-edit-card" onClick={() => handleEditClick(product)}>
                                            <FaEdit /> Editar
                                        </button>
                                        <button className="btn-delete-card" onClick={() => product.id && handleDelete(product.id)} title="Eliminar">
                                            <FaTrash />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
