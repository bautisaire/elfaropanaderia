import { useEffect, useState, ChangeEvent, FormEvent } from 'react';
import { db, storage } from '../firebase/firebaseConfig';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage } from '../utils/imageUtils';
import { FaEdit, FaTrash, FaPlus, FaSave, FaSync, FaCamera, FaLink } from 'react-icons/fa';
import './HeroManager.css';

interface HeroSlide {
    id: string;
    title: string;
    subtitle: string;
    imageUrl: string;
    showButton: boolean;
    buttonText: string;
    buttonLink: string;
    animation: "zoom-in" | "zoom-out";
}

const INITIAL_STATE = {
    title: "",
    subtitle: "",
    imageUrl: "",
    showButton: true,
    buttonText: "Ver Productos",
    buttonLink: "",
    animation: "zoom-in" as "zoom-in" | "zoom-out"
};

export default function HeroManager() {
    const [slides, setSlides] = useState<HeroSlide[]>([]);
    const [formData, setFormData] = useState(INITIAL_STATE);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);

    useEffect(() => {
        fetchSlides();
    }, []);

    const fetchSlides = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "hero_slides"));
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as HeroSlide[];
            setSlides(data);
        } catch (error) {
            console.error(error);
            setMsg("Error cargando slides. Revisa la consola.");
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        // @ts-ignore
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, showButton: e.target.checked }));
    };

    const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setImageFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!formData.title) return setMsg("El título es obligatorio");
        if (!editingId && !imageFile && !formData.imageUrl) return setMsg("La imagen es obligatoria");

        setLoading(true);
        try {
            let url = formData.imageUrl;

            if (imageFile) {
                setUploading(true);
                const compressed = await compressImage(imageFile);
                const storageRef = ref(storage, `hero_slides/${Date.now()}_${imageFile.name}.webp`);
                await uploadBytes(storageRef, compressed);
                url = await getDownloadURL(storageRef);
                setUploading(false);
            }

            const dataToSave = {
                ...formData,
                imageUrl: url
            };

            if (editingId) {
                await updateDoc(doc(db, "hero_slides", editingId), dataToSave);
                setMsg("Slide actualizado correctamente");
            } else {
                await addDoc(collection(db, "hero_slides"), dataToSave);
                setMsg("Slide creado exitosamente");
            }

            resetForm();
            fetchSlides();
        } catch (error) {
            console.error(error);
            setMsg("Error al guardar. Inténtalo de nuevo.");
        } finally {
            setLoading(false);
            setUploading(false);
        }
    };

    const handleDelete = async (slide: HeroSlide) => {
        if (!confirm("¿Eliminar este slide? Esta acción no se puede deshacer.")) return;
        try {
            await deleteDoc(doc(db, "hero_slides", slide.id));
            setMsg("Slide eliminado");
            fetchSlides();
        } catch (error) {
            console.error(error);
            setMsg("Error al eliminar");
        }
    };

    const startEdit = (slide: HeroSlide) => {
        setEditingId(slide.id);
        setFormData({
            title: slide.title,
            subtitle: slide.subtitle,
            imageUrl: slide.imageUrl,
            showButton: slide.showButton,
            buttonText: slide.buttonText || "Ver Productos",
            buttonLink: slide.buttonLink || "",
            animation: slide.animation
        });
        setImageFile(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const resetForm = () => {
        setFormData(INITIAL_STATE);
        setEditingId(null);
        setImageFile(null);
        setMsg(null);
    };

    return (
        <div className="product-manager-container"> {/* Reusing Main Container */}
            <div className="pm-header">
                <div>
                    <h2>Gestor de Portada (Hero)</h2>
                    <p>Configura los slides principales que aparecen en el inicio.</p>
                </div>
            </div>

            {msg && <div className="pm-alert">{msg}</div>}

            {/* FORM CARD */}
            <div className="pm-card form-section">
                <div className="pm-card-header">
                    <h3>{editingId ? "Editar Slide" : "Nuevo Slide"}</h3>
                    {editingId && <button className="btn-secondary btn-sm" onClick={resetForm}><FaPlus /> Nuevo</button>}
                </div>

                <form onSubmit={handleSubmit} className="pm-form">
                    <div className="pm-grid">
                        {/* LEFT COLUMN: Main Info */}
                        <div className="pm-col-main">
                            <div className="form-group">
                                <label>Título Principal</label>
                                <input
                                    name="title"
                                    value={formData.title}
                                    onChange={handleInputChange}
                                    placeholder="Ej. Bienvenidos a El Faro"
                                    className="input-lg"
                                />
                            </div>
                            <div className="form-group">
                                <label>Subtítulo</label>
                                <input
                                    name="subtitle"
                                    value={formData.subtitle}
                                    onChange={handleInputChange}
                                    placeholder="Ej. Panadería Artesanal"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group half">
                                    <label>Animación</label>
                                    <select name="animation" value={formData.animation} onChange={handleInputChange}>
                                        <option value="zoom-in">Zoom In (Acercar)</option>
                                        <option value="zoom-out">Zoom Out (Alejar)</option>
                                    </select>
                                </div>
                                <div className="form-group half checkbox-group-styled">
                                    <label>
                                        <input type="checkbox" checked={formData.showButton} onChange={handleCheckboxChange} />
                                        Mostrar Botón de Acción
                                    </label>
                                </div>
                            </div>

                            {formData.showButton && (
                                <div className="form-group" style={{ background: '#f9fafb', padding: '15px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}><FaLink /> Configuración del Botón</label>
                                    <div className="form-row">
                                        <div className="form-group half" style={{ marginBottom: 0 }}>
                                            <input name="buttonText" value={formData.buttonText} onChange={handleInputChange} placeholder="Texto (ej. Ver Menú)" />
                                        </div>
                                        <div className="form-group half" style={{ marginBottom: 0 }}>
                                            <input name="buttonLink" value={formData.buttonLink} onChange={handleInputChange} placeholder="Enlace (ej. #Productos)" />
                                        </div>
                                    </div>
                                    <small style={{ color: '#6b7280', marginTop: '8px', display: 'block' }}>
                                        Usa <b>#Categoria</b> para secciones internas o URLs completas.
                                    </small>
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: Image */}
                        <div className="pm-col-sidebar">
                            <div className="form-group">
                                <label>Imagen de Fondo</label>
                                <div className="image-upload-area">
                                    <label className="btn-upload">
                                        {uploading ? <FaSync className="spin" /> : <FaCamera />}
                                        <span>{uploading ? "Subiendo..." : "Seleccionar Imagen"}</span>
                                        <input type="file" hidden accept="image/*" onChange={handleImageChange} disabled={uploading} />
                                    </label>

                                    {/* Preview Logic */}
                                    {(imageFile || formData.imageUrl) && (
                                        <div className="hero-preview-container">
                                            {imageFile ? (
                                                // Preview local file
                                                <img src={URL.createObjectURL(imageFile)} alt="preview" />
                                            ) : (
                                                // Preview existing URL
                                                <img src={formData.imageUrl} alt="current" />
                                            )}
                                            {imageFile && <span className="preview-label">Nueva Imagen</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pm-card-footer">
                        <button type="button" className="btn-secondary" onClick={resetForm}>Cancelar</button>
                        <button type="submit" className="btn-primary" disabled={loading || uploading}>
                            {loading ? <FaSync className="spin" /> : <FaSave />}
                            {editingId ? "Actualizar Slide" : "Crear Slide"}
                        </button>
                    </div>
                </form>
            </div>

            {/* LIST SECTION */}
            <div className="hero-list-section">
                <div className="inventory-header" style={{ marginBottom: '20px' }}>
                    <h3>Slides Activos ({slides.length})</h3>
                    <button className="btn-secondary btn-sm" onClick={fetchSlides}><FaSync /> Actualizar Lista</button>
                </div>

                {loading && slides.length === 0 ? (
                    <p>Cargando slides...</p>
                ) : (
                    <div className="hero-grid-list">
                        {slides.map(slide => (
                            <div key={slide.id} className="hero-admin-card">
                                <div className="hero-card-img">
                                    <img src={slide.imageUrl} alt="slide" />
                                    <span className="hero-anim-badge">{slide.animation}</span>
                                </div>
                                <div className="hero-card-body">
                                    <h4>{slide.title}</h4>
                                    <p>{slide.subtitle}</p>
                                    {slide.showButton && (
                                        <span className="hero-btn-preview">{slide.buttonText} &rarr; {slide.buttonLink}</span>
                                    )}
                                </div>
                                <div className="hero-card-actions">
                                    <button onClick={() => startEdit(slide)} className="btn-action edit" title="Editar"><FaEdit /></button>
                                    <button onClick={() => handleDelete(slide)} className="btn-action delete" title="Eliminar"><FaTrash /></button>
                                </div>
                            </div>
                        ))}
                        {slides.length === 0 && !loading && <div className="empty-state">No hay slides creados.</div>}
                    </div>
                )}
            </div>
        </div>
    );
}
