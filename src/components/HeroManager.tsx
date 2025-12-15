import { useEffect, useState, ChangeEvent, FormEvent } from 'react';
import { db, storage } from '../firebase/firebaseConfig';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage } from '../utils/imageUtils';
import { FaEdit, FaTrash } from 'react-icons/fa';
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
            setMsg("Error cargando slides");
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
                setMsg("Slide actualizado");
            } else {
                await addDoc(collection(db, "hero_slides"), dataToSave);
                setMsg("Slide creado");
            }

            resetForm();
            fetchSlides();
        } catch (error) {
            console.error(error);
            setMsg("Error al guardar");
        } finally {
            setLoading(false);
            setUploading(false);
        }
    };

    const handleDelete = async (slide: HeroSlide) => {
        if (!confirm("¿Eliminar este slide?")) return;
        try {
            await deleteDoc(doc(db, "hero_slides", slide.id));
            if (slide.imageUrl) {
                // Try delete image from storage if possible, optional but good practice
                // Not strictly checking error here to avoid blocking
            }
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
    };

    const resetForm = () => {
        setFormData(INITIAL_STATE);
        setEditingId(null);
        setImageFile(null);
        setMsg(null);
    };

    return (
        <div className="hero-manager">
            <h2>Gestor de Hero (Portada)</h2>
            {msg && <div className="msg-banner">{msg}</div>}

            <div className="hero-form-section">
                <h3>{editingId ? "Editar Slide" : "Nuevo Slide"}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Título</label>
                        <input name="title" value={formData.title} onChange={handleInputChange} placeholder="Título principal" />
                    </div>
                    <div className="form-group">
                        <label>Subtítulo</label>
                        <input name="subtitle" value={formData.subtitle} onChange={handleInputChange} placeholder="Texto secundario" />
                    </div>

                    <div className="form-group">
                        <label>Imagen</label>
                        <input type="file" accept="image/*" onChange={handleImageChange} />
                        {formData.imageUrl && !imageFile && (
                            <div className="current-img-preview">
                                <img src={formData.imageUrl} alt="current" style={{ height: '60px', marginTop: '5px' }} />
                                <small>Imagen actual</small>
                            </div>
                        )}
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Animación</label>
                            <select name="animation" value={formData.animation} onChange={handleInputChange}>
                                <option value="zoom-in">Zoom In</option>
                                <option value="zoom-out">Zoom Out</option>
                            </select>
                        </div>
                        <div className="form-group checkbox-group">
                            <label>
                                <input type="checkbox" checked={formData.showButton} onChange={handleCheckboxChange} />
                                Mostrar Botón
                            </label>
                        </div>
                    </div>

                    {formData.showButton && (
                        <>
                            <div className="form-group">
                                <label>Texto del Botón</label>
                                <input name="buttonText" value={formData.buttonText} onChange={handleInputChange} />
                            </div>
                            <div className="form-group">
                                <label>Enlace del Botón (Link)</label>
                                <input name="buttonLink" value={formData.buttonLink} onChange={handleInputChange} placeholder="Ej: #Bebidas o https://google.com" />
                                <small style={{ color: '#666', marginTop: '5px' }}>
                                    Usa <b>#Categoria</b> para ir a una sección, o una URL completa para sitios externos.
                                </small>
                            </div>
                        </>
                    )}

                    <div className="form-actions">
                        <button type="button" className="btn-plain" onClick={resetForm}>Cancelar</button>
                        <button type="submit" className="btn-primary" disabled={loading || uploading}>
                            {uploading ? "Subiendo..." : (editingId ? "Actualizar" : "Crear")}
                        </button>
                    </div>
                </form>
            </div>

            <div className="hero-list">
                <h3>Slides Activos</h3>
                {slides.map(slide => (
                    <div key={slide.id} className="hero-list-item">
                        <img src={slide.imageUrl} alt="thumb" className="hero-thumb" />
                        <div className="hero-info">
                            <h4>{slide.title}</h4>
                            <p>{slide.subtitle}</p>
                            <small>{slide.animation}</small>
                        </div>
                        <div className="hero-actions">
                            <button onClick={() => startEdit(slide)} className="btn-edit"><FaEdit /></button>
                            <button onClick={() => handleDelete(slide)} className="btn-delete"><FaTrash /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
