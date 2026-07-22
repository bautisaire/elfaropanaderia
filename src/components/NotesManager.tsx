import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { FaStickyNote, FaPlus, FaTrash, FaTimes, FaSearch, FaRegClock, FaSave, FaEdit } from 'react-icons/fa';
import './NotesManager.css';

export interface Note {
  id: string;
  title: string;
  content: string;
  color?: string;
  createdAt?: any;
  updatedAt?: any;
  authorEmail?: string;
}

const TICKET_COLORS = [
  { id: 'yellow', name: 'Amarillo Recibo', bg: '#fffbeb', border: '#fef3c7', topAccent: '#f59e0b' },
  { id: 'white', name: 'Blanco Térmico', bg: '#ffffff', border: '#e2e8f0', topAccent: '#3b82f6' },
  { id: 'green', name: 'Verde Ticket', bg: '#f0fdf4', border: '#dcfce7', topAccent: '#10b981' },
  { id: 'pink', name: 'Rosa Nota', bg: '#fdf2f8', border: '#fce7f3', topAccent: '#ec4899' },
  { id: 'blue', name: 'Azul Nota', bg: '#eff6ff', border: '#dbeafe', topAccent: '#0284c7' }
];

export default function NotesManager() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('view');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formColor, setFormColor] = useState('yellow');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'notes'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesData: Note[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as Note[];
      setNotes(notesData);
      setLoading(false);
    }, (error) => {
      console.error('Error cargando notas:', error);
      // Fallback query if index or updatedAt field missing on old docs
      const fallbackQuery = query(collection(db, 'notes'));
      onSnapshot(fallbackQuery, (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Note[];
        setNotes(data);
        setLoading(false);
      });
    });

    return () => unsubscribe();
  }, []);

  const handleOpenCreateModal = () => {
    setSelectedNote(null);
    setFormTitle('');
    setFormContent('');
    setFormColor('yellow');
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleOpenViewModal = (note: Note) => {
    setSelectedNote(note);
    setFormTitle(note.title || '');
    setFormContent(note.content || '');
    setFormColor(note.color || 'yellow');
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleSwitchToEditMode = () => {
    setModalMode('edit');
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedNote(null);
    setFormTitle('');
    setFormContent('');
    setSaving(false);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formContent.trim() && !formTitle.trim()) {
      alert('La nota no puede estar completamente vacía.');
      return;
    }

    setSaving(true);
    try {
      if (selectedNote) {
        // Modificar nota existente
        await updateDoc(doc(db, 'notes', selectedNote.id), {
          title: formTitle.trim(),
          content: formContent,
          color: formColor,
          updatedAt: serverTimestamp()
        });
      } else {
        // Crear nueva nota
        await addDoc(collection(db, 'notes'), {
          title: formTitle.trim() || 'Nota sin título',
          content: formContent,
          color: formColor,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      handleCloseModal();
    } catch (err) {
      console.error('Error guardando la nota:', err);
      alert('Ocurrió un error al guardar la nota.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas borrar esta nota?')) return;
    try {
      await deleteDoc(doc(db, 'notes', noteId));
      if (selectedNote?.id === noteId) {
        handleCloseModal();
      }
    } catch (err) {
      console.error('Error al borrar nota:', err);
      alert('No se pudo eliminar la nota.');
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Reciente';
    let date: Date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else {
      return 'Reciente';
    }

    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredNotes = notes.filter(note => {
    const term = searchTerm.toLowerCase();
    return (
      (note.title || '').toLowerCase().includes(term) ||
      (note.content || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="notes-manager-container">
      {/* Top Action Header */}
      <div className="notes-header">
        <div className="notes-header-title">
          <div className="notes-icon-wrapper">
            <FaStickyNote />
          </div>
          <div>
            <h2>Gestión de Notas</h2>
            <p className="notes-subtitle">Agrega, edita y consulta notas con texto llano en tiempo real</p>
          </div>
        </div>

        <button className="btn-add-note" onClick={handleOpenCreateModal}>
          <FaPlus />
          <span>Agregar nueva nota</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="notes-toolbar">
        <div className="notes-search-box">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Buscar en notas por título o contenido..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
              <FaTimes />
            </button>
          )}
        </div>
        <div className="notes-count-badge">
          {filteredNotes.length} {filteredNotes.length === 1 ? 'nota' : 'notas'}
        </div>
      </div>

      {/* Notes Grid */}
      {loading ? (
        <div className="notes-loading">Cargando notas...</div>
      ) : filteredNotes.length === 0 ? (
        <div className="notes-empty-state">
          <FaStickyNote className="empty-icon" />
          <h3>{searchTerm ? 'No se encontraron notas' : 'No hay notas creadas aún'}</h3>
          <p>{searchTerm ? 'Intenta buscar con otros términos.' : 'Crea tu primera nota haciendo clic en el botón superior.'}</p>
          {!searchTerm && (
            <button className="btn-add-note-empty" onClick={handleOpenCreateModal}>
              <FaPlus /> Agregar nueva nota
            </button>
          )}
        </div>
      ) : (
        <div className="notes-grid">
          {filteredNotes.map((note) => {
            const colorScheme = TICKET_COLORS.find(c => c.id === note.color) || TICKET_COLORS[0];
            return (
              <div
                key={note.id}
                className="note-ticket-card"
                style={{
                  backgroundColor: colorScheme.bg,
                  borderColor: colorScheme.border
                }}
                onDoubleClick={() => handleOpenViewModal(note)}
              >
                {/* Decorative Top Accent Bar */}
                <div
                  className="ticket-top-accent"
                  style={{ backgroundColor: colorScheme.topAccent }}
                />

                {/* Ticket Header */}
                <div className="ticket-header">
                  <div className="ticket-badge">
                    <FaStickyNote style={{ color: colorScheme.topAccent }} />
                    <span>TICKET NOTA</span>
                  </div>
                  <div className="ticket-date">
                    <FaRegClock />
                    <span>{formatDate(note.updatedAt || note.createdAt)}</span>
                  </div>
                </div>

                {/* Ticket Body */}
                <div className="ticket-body">
                  <h3 className="ticket-title">{note.title || 'Nota sin título'}</h3>
                  <div className="ticket-content-preview">
                    {note.content ? note.content : <em style={{ color: '#94a3b8' }}>Sin contenido adicional</em>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for View / Edit / Create Note */}
      {isModalOpen && (
        <div className="notes-modal-overlay" onClick={handleCloseModal}>
          <div className="notes-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3>
                <FaStickyNote className="modal-title-icon" />
                {modalMode === 'view' ? (selectedNote?.title || 'Lectura de Nota') : selectedNote ? 'Modificar Nota' : 'Nueva Nota'}
              </h3>
              <button className="notes-modal-close" onClick={handleCloseModal}>
                <FaTimes />
              </button>
            </div>

            {modalMode === 'view' && selectedNote ? (
              /* --- MODO LECTURA (RENGLONES SIN HUD DE MODIFICAR) --- */
              <div className="notes-modal-body-view">
                <div className="view-note-meta">
                  <div className="view-note-title">{selectedNote.title || 'Nota sin título'}</div>
                  <div className="view-note-date">
                    <FaRegClock /> {formatDate(selectedNote.updatedAt || selectedNote.createdAt)}
                  </div>
                </div>

                {/* Lined Paper View */}
                <div className="lined-paper">
                  {selectedNote.content ? selectedNote.content : <em style={{ color: '#94a3b8' }}>Esta nota está vacía.</em>}
                </div>

                <div className="notes-modal-footer">
                  <button
                    type="button"
                    className="btn-modal-delete"
                    onClick={() => handleDeleteNote(selectedNote.id)}
                  >
                    <FaTrash /> Borrar
                  </button>

                  <div className="notes-modal-actions-right">
                    <button
                      type="button"
                      className="btn-modal-edit-trigger"
                      onClick={handleSwitchToEditMode}
                    >
                      <FaEdit /> Modificar
                    </button>
                    <button
                      type="button"
                      className="btn-modal-cancel"
                      onClick={handleCloseModal}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* --- MODO EDITAR / CREAR --- */
              <form onSubmit={handleSaveNote} className="notes-modal-form">
                <div className="form-group">
                  <label htmlFor="note-title-input">Título / Asunto</label>
                  <input
                    id="note-title-input"
                    type="text"
                    placeholder="Ej: Pendiente proveedor, Recordatorio..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label>Color</label>
                  <div className="color-picker-options">
                    {TICKET_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`color-chip ${formColor === c.id ? 'active' : ''}`}
                        style={{ backgroundColor: c.bg, borderColor: c.topAccent }}
                        onClick={() => setFormColor(c.id)}
                        title={c.name}
                      >
                        {formColor === c.id && <span className="color-check">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group flex-fill">
                  <label htmlFor="note-content-input">Contenido de la nota (Texto Llano)</label>
                  <textarea
                    id="note-content-input"
                    placeholder="Escribe todo el texto de tu nota aquí..."
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    rows={8}
                  />
                </div>

                <div className="notes-modal-footer">
                  {selectedNote ? (
                    <button
                      type="button"
                      className="btn-modal-delete"
                      onClick={() => handleDeleteNote(selectedNote.id)}
                      disabled={saving}
                    >
                      <FaTrash /> Borrar
                    </button>
                  ) : <div />}

                  <div className="notes-modal-actions-right">
                    <button
                      type="button"
                      className="btn-modal-cancel"
                      onClick={() => {
                        if (selectedNote) {
                          setModalMode('view');
                        } else {
                          handleCloseModal();
                        }
                      }}
                      disabled={saving}
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      className="btn-modal-save"
                      disabled={saving}
                    >
                      <FaSave /> {saving ? 'Guardando...' : selectedNote ? 'Guardar Cambios' : 'Crear Nota'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
