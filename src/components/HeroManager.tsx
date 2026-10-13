import { useEffect, useState, ChangeEvent, FormEvent } from 'react';
import { db, storage } from '../firebase/firebaseConfig';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage } from '../utils/imageUtils';
import { FaEdit, FaTrash, FaPlus, FaSave, FaSync, FaCamera, FaLink, FaEye, FaEyeSlash, FaFont } from 'react-icons/fa';
import { HERO_PALETTE, HeroButton, HeroSlide, HeroTextKind, HeroTextLine, makeButton, makeText, normalizeSlide } from '../utils/heroSlides';
import './HeroManager.css';

const INITIAL_STATE = {
    imageUrl: "",
    texts: [makeText("title")] as HeroTextLine[],
    buttons: [] as HeroButton[],
    overlay: 40,
    animation: "zoom-in" as "zoom-in" | "zoom-out",
    active: true,
    order: 0,
};

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
    return (
        <div className="hero-color-picker">
            {HERO_PALETTE.map(c => (
                <button
                    key={c}
                    type="button"
                    className={`hero-swatch ${value.toLowerCase() === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => onChange(c)}
                    aria-label={c}
                />
            ))}
            <input type="color" value={value} onChange={e => onChange(e.target.value)} title="Color personalizado" />
        </div>
    );
}

export default function HeroManager() {
    const [slides, setSlides] = useState<HeroSlide[]>([]);
    const [formData, setFormData] = useState(INITIAL_STATE);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);

    // Drag and drop state
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);

    useEffect(() => {
        fetchSlides();
    }, []);

    const fetchSlides = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "hero_slides"));
            const data = querySnapshot.docs.map(d => normalizeSlide({ id: d.id, ...d.data() }));
            data.sort((a, b) => (a.order || 0) - (b.order || 0));
            setSlides(data);
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {
                console.log("Fetch aborted, ignoring.");
            } else {
                console.error(error);
                setMsg("Error cargando slides.");
            }
        } finally {
            setLoading(false);
        }
    };

    const updateText = (id: string, patch: Partial<HeroTextLine>) =>
        setFormData(prev => ({ ...prev, texts: prev.texts.map(t => t.id === id ? { ...t, ...patch } : t) }));
    const removeText = (id: string) =>
        setFormData(prev => ({ ...prev, texts: prev.texts.filter(t => t.id !== id) }));
    const addText = (kind: HeroTextKind) =>
        setFormData(prev => ({ ...prev, texts: [...prev.texts, makeText(kind)] }));

    const updateButton = (id: string, patch: Partial<HeroButton>) =>
        setFormData(prev => ({ ...prev, buttons: prev.buttons.map(b => b.id === id ? { ...b, ...patch } : b) }));
    const removeButton = (id: string) =>
        setFormData(prev => ({ ...prev, buttons: prev.buttons.filter(b => b.id !== id) }));
    const addButton = () =>
        setFormData(prev => ({ ...prev, buttons: [...prev.buttons, makeButton()] }));

    const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setImageFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!editingId && !imageFile && !formData.imageUrl) return setMsg("La imagen es obligatoria");

        setLoading(true);
        try {
            let url = formData.imageUrl;

            if (imageFile) {
                setUploading(true);
                const compressed = await compressImage(imageFile, 1920, 0.85);
                const storageRef = ref(storage, `hero_slides/${Date.now()}_${imageFile.name}.webp`);
                await uploadBytes(storageRef, compressed);
                url = await getDownloadURL(storageRef);
                setUploading(false);
            }

            const newOrder = editingId ? formData.order : slides.length;
            const texts = formData.texts.filter(t => t.text.trim());

            const dataToSave = {
                ...formData,
                texts,
                imageUrl: url,
                order: newOrder,
                title: texts.find(t => t.kind === 'title')?.text || '',
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

    const toggleVisibility = async (slide: HeroSlide) => {
        try {
            const newStatus = slide.active === false ? true : false;
            await updateDoc(doc(db, "hero_slides", slide.id), { active: newStatus });
            setSlides(prev => prev.map(s => s.id === slide.id ? { ...s, active: newStatus } : s));
        } catch (error) {
            console.error("Error toggle visibility:", error);
            alert("Error al cambiar visibilidad");
        }
    };

    // DRAG AND DROP HANDLERS
    const handleDragStart = (index: number) => setDraggedItemIndex(index);
    const handleDragEnter = (index: number) => setDragOverItemIndex(index);

    const handleDragEnd = async () => {
        if (draggedItemIndex === null || dragOverItemIndex === null || draggedItemIndex === dragOverItemIndex) {
            setDraggedItemIndex(null);
            setDragOverItemIndex(null);
            return;
        }

        const newSlides = [...slides];
        const draggedItem = newSlides[draggedItemIndex];
        newSlides.splice(draggedItemIndex, 1);
        newSlides.splice(dragOverItemIndex, 0, draggedItem);

        const updatedSlides = newSlides.map((s, index) => ({ ...s, order: index }));
        setSlides(updatedSlides);

        setDraggedItemIndex(null);
        setDragOverItemIndex(null);

        try {
            await Promise.all(updatedSlides.map(slide =>
                updateDoc(doc(db, "hero_slides", slide.id), { order: slide.order })
            ));
        } catch (error) {
            console.error("Error updating slide order:", error);
            setMsg("Error al guardar el nuevo orden.");
        }
    };

    const startEdit = (slide: HeroSlide) => {
        setEditingId(slide.id);
        setFormData({
            imageUrl: slide.imageUrl,
            texts: slide.texts.length ? slide.texts : [makeText("title")],
            buttons: slide.buttons,
            overlay: slide.overlay,
            animation: slide.animation,
            active: slide.active !== false,
            order: slide.order || 0,
        });
        setImageFile(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const resetForm = () => {
        setFormData({ ...INITIAL_STATE, texts: [makeText("title")] });
        setEditingId(null);
        setImageFile(null);
        setMsg(null);
    };

    const previewSrc = imageFile ? URL.createObjectURL(imageFile) : formData.imageUrl;

    return (
        <div className="product-manager-container">
            <div className="pm-header">
                <div>
                    <h2>Portada (Hero)</h2>
                    <p>Imagen de fondo con textos y botones. Las cartas flotantes se arman en la pestaña "Cartas".</p>
                </div>
            </div>

            {msg && <div className="pm-alert">{msg}</div>}

            <div className="pm-card form-section">
                <div className="pm-card-header">
                    <h3>{editingId ? "Editar Slide" : "Nuevo Slide"}</h3>
                    {editingId && <button className="btn-secondary btn-sm" onClick={resetForm}><FaPlus /> Nuevo</button>}
                </div>

                <form onSubmit={handleSubmit} className="pm-form">
                    <div className="pm-grid">
                        {/* LEFT COLUMN: textos y botones */}
                        <div className="pm-col-main">
                            <label className="hero-section-label"><FaFont /> Textos</label>
                            {formData.texts.map(t => (
                                <div className="hero-edit-row" key={t.id}>
                                    <div className="hero-edit-row-top">
                                        <select value={t.kind} onChange={e => updateText(t.id, { kind: e.target.value as HeroTextKind })}>
                                            <option value="eyebrow">Etiqueta (letras chicas)</option>
                                            <option value="title">Título</option>
                                            <option value="subtitle">Subtítulo / párrafo</option>
                                        </select>
                                        <button type="button" className="btn-action delete" onClick={() => removeText(t.id)} title="Quitar"><FaTrash /></button>
                                    </div>
                                    <input
                                        value={t.text}
                                        onChange={e => updateText(t.id, { text: e.target.value })}
                                        placeholder={t.kind === 'title' ? 'Ej. Pan fresco todos los días' : t.kind === 'eyebrow' ? 'Ej. Envíos gratis a Neuquén' : 'Ej. Pedí desde casa y recibilo en la puerta'}
                                    />
                                    <ColorPicker value={t.color} onChange={c => updateText(t.id, { color: c })} />
                                </div>
                            ))}
                            <div className="hero-add-row">
                                <button type="button" className="btn-secondary btn-sm" onClick={() => addText('eyebrow')}><FaPlus /> Etiqueta</button>
                                <button type="button" className="btn-secondary btn-sm" onClick={() => addText('title')}><FaPlus /> Título</button>
                                <button type="button" className="btn-secondary btn-sm" onClick={() => addText('subtitle')}><FaPlus /> Subtítulo</button>
                            </div>

                            <label className="hero-section-label" style={{ marginTop: 22 }}><FaLink /> Botones (opcionales)</label>
                            {formData.buttons.length === 0 && (
                                <small style={{ color: '#6b7280', display: 'block', marginBottom: 8 }}>Sin botones: la portada solo muestra los textos.</small>
                            )}
                            {formData.buttons.map(b => (
                                <div className="hero-edit-row" key={b.id}>
                                    <div className="hero-edit-row-top">
                                        <input value={b.text} onChange={e => updateButton(b.id, { text: e.target.value })} placeholder="Texto del botón" />
                                        <button type="button" className="btn-action delete" onClick={() => removeButton(b.id)} title="Quitar"><FaTrash /></button>
                                    </div>
                                    <label className="hero-inline-check">
                                        <input type="checkbox" checked={!!b.isRaffle} onChange={e => updateButton(b.id, { isRaffle: e.target.checked })} />
                                        Abrir Sorteo (en vez de link)
                                    </label>
                                    {!b.isRaffle && (
                                        <input value={b.link} onChange={e => updateButton(b.id, { link: e.target.value })} placeholder="Dirección (ej. #Productos o https://...)" />
                                    )}
                                    <div className="hero-color-pair">
                                        <span>Fondo</span>
                                        <ColorPicker value={b.bgColor} onChange={c => updateButton(b.id, { bgColor: c })} />
                                    </div>
                                    <div className="hero-color-pair">
                                        <span>Texto</span>
                                        <ColorPicker value={b.textColor} onChange={c => updateButton(b.id, { textColor: c })} />
                                    </div>
                                </div>
                            ))}
                            <div className="hero-add-row">
                                <button type="button" className="btn-secondary btn-sm" onClick={addButton}><FaPlus /> Agregar botón</button>
                            </div>
                            <small style={{ color: '#6b7280', marginTop: '8px', display: 'block' }}>
                                Usá <b>#Categoria</b> para secciones internas o URLs completas.
                            </small>
                        </div>

                        {/* RIGHT COLUMN: imagen */}
                        <div className="pm-col-sidebar">
                            <div className="form-group">
                                <label>Imagen de Fondo</label>
                                <div className="image-upload-area">
                                    <label className="btn-upload">
                                        {uploading ? <FaSync className="spin" /> : <FaCamera />}
                                        <span>{uploading ? "Subiendo..." : "Seleccionar Imagen"}</span>
                                        <input type="file" hidden accept="image/*" onChange={handleImageChange} disabled={uploading} />
                                    </label>

                                    {previewSrc && (
                                        <div className="hero-preview-container">
                                            <img src={previewSrc} alt="preview" />
                                            {imageFile && <span className="preview-label">Nueva Imagen</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Oscurecer imagen: {formData.overlay}%</label>
                                <input
                                    type="range" min={0} max={80} step={5}
                                    value={formData.overlay}
                                    onChange={e => setFormData(prev => ({ ...prev, overlay: Number(e.target.value) }))}
                                />
                            </div>
                            <div className="form-group">
                                <label>Animación</label>
                                <select
                                    value={formData.animation}
                                    onChange={e => setFormData(prev => ({ ...prev, animation: e.target.value as "zoom-in" | "zoom-out" }))}
                                >
                                    <option value="zoom-in">Zoom In (Acercar)</option>
                                    <option value="zoom-out">Zoom Out (Alejar)</option>
                                </select>
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
                    <h3>Slides ({slides.length})</h3>
                    <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>Arrastra las tarjetas para cambiar el orden en el que aparecen en la página principal.</p>
                    <button className="btn-secondary btn-sm" onClick={fetchSlides}><FaSync /> Actualizar Lista</button>
                </div>

                {loading && slides.length === 0 ? (
                    <p>Cargando slides...</p>
                ) : (
                    <div className="hero-grid-list">
                        {slides.map((slide, index) => (
                            <div
                                key={slide.id}
                                className="hero-admin-card"
                                draggable
                                onDragStart={() => handleDragStart(index)}
                                onDragEnter={() => handleDragEnter(index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => e.preventDefault()}
                                style={{
                                    cursor: 'grab',
                                    opacity: draggedItemIndex === index ? 0.5 : 1,
                                    border: dragOverItemIndex === index && draggedItemIndex !== index ? '2px dashed var(--primary-color)' : '1px solid #eee',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div className="hero-card-img">
                                    <img src={slide.imageUrl} alt="slide" draggable={false} />
                                    <span className="hero-anim-badge">{slide.animation}</span>
                                </div>
                                <div className="hero-card-body">
                                    <h4>{slide.texts.find(t => t.kind === 'title')?.text || slide.texts[0]?.text || '(sin texto)'}</h4>
                                    <p>{slide.texts.filter(t => t.kind !== 'title').map(t => t.text).join(' · ')}</p>
                                    {slide.buttons.length > 0 && (
                                        <span className="hero-btn-preview">
                                            {slide.buttons.map(b => b.isRaffle ? `🎁 ${b.text}` : `${b.text}${b.link ? ` → ${b.link}` : ''}`).join(' | ')}
                                        </span>
                                    )}
                                </div>
                                <div className="hero-card-actions">
                                    <button
                                        onClick={() => toggleVisibility(slide)}
                                        className={`btn-action visibility ${slide.active === false ? 'inactive' : 'active'}`}
                                        title={slide.active === false ? "Mostrar" : "Ocultar"}
                                        style={{ color: slide.active === false ? '#9ca3af' : '#10b981' }}
                                    >
                                        {slide.active === false ? <FaEyeSlash /> : <FaEye />}
                                    </button>
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
