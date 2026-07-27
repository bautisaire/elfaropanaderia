import React, { useState, useEffect } from "react";
import { db, storage } from "../firebase/firebaseConfig";
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, orderBy, where, getDocs, limit } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import ProductImageEditor from "./ProductImageEditor";
import "./RaffleManager.css";
import { FaGift, FaSearch, FaTrash, FaPlus, FaTrophy, FaCalendarAlt, FaChevronDown, FaChevronUp, FaStopCircle, FaPlayCircle, FaEdit, FaSave, FaTimes, FaCopy, FaCheckCircle } from "react-icons/fa";

interface RaffleWinner {
  participantId: string;
  name: string;
  phoneOrEmail: string;
}

interface Raffle {
  id: string;
  title: string;
  prize: string;
  customMessage: string;
  drawDate?: string;
  startDate: any;
  endDate: any;
  isActive: boolean;
  winner?: RaffleWinner | null;
  description?: string;
  imageUrl?: string;
  isModalMode?: boolean;
  prizes?: string[];
}

interface Participant {
  id: string;
  name: string;
  phoneOrEmail: string;
  date: any;
  chances?: number;
}

function isEmailContact(contact: string): boolean {
  return contact.includes("@");
}

function getWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/+549${digits}`;
}

function ParticipantContactLink({ contact }: { contact: string }) {
  if (isEmailContact(contact)) {
    return <span>{contact}</span>;
  }

  return (
    <a
      href={getWhatsAppUrl(contact)}
      target="_blank"
      rel="noopener noreferrer"
      className="participant-whatsapp-link"
      title="Abrir WhatsApp"
    >
      {contact}
    </a>
  );
}

export default function RaffleManager() {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [activeRaffle, setActiveRaffle] = useState<Raffle | null>(null);
  
  // Start Raffle Form
  const [titleInput, setTitleInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isModalMode, setIsModalMode] = useState(false);
  const [prizesInput, setPrizesInput] = useState<string[]>([""]);
  const [messageInput, setMessageInput] = useState("¡Realizando tu pedido sumas chances de ganar!");
  const [drawDateInput, setDrawDateInput] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  // Participants of active raffle
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editChances, setEditChances] = useState<number>(1);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [namesCopied, setNamesCopied] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null);
  const [endModalSearch, setEndModalSearch] = useState("");
  const [isEnding, setIsEnding] = useState(false);

  // Edit Raffle State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrizes, setEditPrizes] = useState<string[]>([""]);
  const [editMessage, setEditMessage] = useState("");
  const [editDrawDate, setEditDrawDate] = useState("");
  const [editIsModalMode, setEditIsModalMode] = useState(false);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [isSavingRaffle, setIsSavingRaffle] = useState(false);

  // Image Editor State
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imageEditorTarget, setImageEditorTarget] = useState<'start' | 'edit' | null>(null);

  // History expanded items
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [historyParticipants, setHistoryParticipants] = useState<Record<string, Participant[]>>({});

  useEffect(() => {
    // Listen to all raffles
    const q = query(collection(db, "raffles"), orderBy("startDate", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const allRaffles: Raffle[] = [];
      let active: Raffle | null = null;

      snap.docs.forEach(d => {
        const data = d.data() as Omit<Raffle, 'id'>;
        const raffle = { id: d.id, ...data };
        allRaffles.push(raffle);
        if (raffle.isActive && !active) {
          active = raffle;
        }
      });
      setRaffles(allRaffles);
      setActiveRaffle(active);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (activeRaffle) {
      const q = query(collection(db, `raffles/${activeRaffle.id}/participants`), orderBy("date", "desc"));
      const unsub = onSnapshot(q, (snap) => {
        const parts: Participant[] = [];
        snap.docs.forEach(d => parts.push({ id: d.id, ...d.data() } as Participant));
        setParticipants(parts);
      });
      return () => unsub();
    } else {
      setParticipants([]);
    }
  }, [activeRaffle]);

  const handleImageEditorConfirm = async (blob: Blob) => {
    if (!pendingImageFile || !imageEditorTarget) return;
    const croppedFile = new File([blob], pendingImageFile.name, { type: 'image/jpeg' });
    if (imageEditorTarget === 'start') {
      setImageFile(croppedFile);
    } else if (imageEditorTarget === 'edit') {
      setEditImageFile(croppedFile);
    }
    setPendingImageFile(null);
    setImageEditorTarget(null);
  };

  const handleStartRaffle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim() || prizesInput.filter(p => p.trim()).length === 0) return;
    setIsStarting(true);
    try {
      let imageUrl = "";
      if (imageFile) {
        const storageRef = ref(storage, `raffles/${Date.now()}_${imageFile.name}`);
        await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(storageRef);
      }

      const validPrizes = prizesInput.filter(p => p.trim() !== "");
      await addDoc(collection(db, "raffles"), {
        title: titleInput,
        description: descriptionInput,
        imageUrl: imageUrl,
        isModalMode: isModalMode,
        prize: validPrizes.join(" - "), // fallback
        prizes: validPrizes, // new array structure
        customMessage: messageInput,
        drawDate: drawDateInput,
        startDate: Timestamp.now(),
        endDate: null,
        isActive: true
      });
      setTitleInput("");
      setDescriptionInput("");
      setImageFile(null);
      setIsModalMode(false);
      setPrizesInput([""]);
      setMessageInput("");
      setDrawDateInput("");
    } catch (error) {
      console.error("Error starting raffle:", error);
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndRaffle = () => {
    if (!activeRaffle) return;
    setSelectedWinnerId(null);
    setEndModalSearch("");
    setShowEndModal(true);
  };

  const closeEndModal = () => {
    if (isEnding) return;
    setShowEndModal(false);
    setSelectedWinnerId(null);
    setEndModalSearch("");
  };

  const confirmEndRaffle = async () => {
    if (!activeRaffle) return;
    if (participants.length > 0 && !selectedWinnerId) return;

    setIsEnding(true);
    try {
      const winner = selectedWinnerId
        ? participants.find(p => p.id === selectedWinnerId)
        : null;

      await updateDoc(doc(db, "raffles", activeRaffle.id), {
        isActive: false,
        endDate: Timestamp.now(),
        winner: winner
          ? {
              participantId: winner.id,
              name: winner.name,
              phoneOrEmail: winner.phoneOrEmail
            }
          : null
      });
      setShowEndModal(false);
      setSelectedWinnerId(null);
      setEndModalSearch("");
      setActiveTab("history");
    } catch (error) {
      console.error("Error ending raffle:", error);
      alert("No se pudo finalizar el sorteo.");
    } finally {
      setIsEnding(false);
    }
  };

  const handleEditRaffle = () => {
    if (!activeRaffle) return;
    setEditTitle(activeRaffle.title || "");
    setEditDescription(activeRaffle.description || "");
    
    let initialPrizes = [""];
    if (activeRaffle.prizes && activeRaffle.prizes.length > 0) {
      initialPrizes = activeRaffle.prizes;
    } else if (activeRaffle.prize) {
      initialPrizes = activeRaffle.prize.split(" - ");
    }
    setEditPrizes(initialPrizes);

    setEditMessage(activeRaffle.customMessage || "");
    setEditDrawDate(activeRaffle.drawDate || "");
    setEditIsModalMode(activeRaffle.isModalMode || false);
    setEditImageFile(null);
    setShowEditModal(true);
  };

  const saveEditRaffle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRaffle || !editTitle.trim() || editPrizes.filter(p => p.trim()).length === 0) return;
    
    setIsSavingRaffle(true);
    try {
      let newImageUrl = activeRaffle.imageUrl || "";
      if (editImageFile) {
        const storageRef = ref(storage, `raffles/${Date.now()}_${editImageFile.name}`);
        await uploadBytes(storageRef, editImageFile);
        newImageUrl = await getDownloadURL(storageRef);
      }

      const validPrizes = editPrizes.filter(p => p.trim() !== "");
      await updateDoc(doc(db, "raffles", activeRaffle.id), {
        title: editTitle,
        description: editDescription,
        imageUrl: newImageUrl,
        isModalMode: editIsModalMode,
        prize: validPrizes.join(" - "),
        prizes: validPrizes,
        customMessage: editMessage,
        drawDate: editDrawDate
      });

      setShowEditModal(false);
    } catch (error) {
      console.error("Error saving raffle:", error);
      alert("No se pudo guardar el sorteo.");
    } finally {
      setIsSavingRaffle(false);
    }
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRaffle || !newName.trim() || !newPhone.trim()) return;
    try {
      const qCheck = query(
        collection(db, `raffles/${activeRaffle.id}/participants`), 
        where("phoneOrEmail", "==", newPhone.trim()), 
        limit(1)
      );
      const checkSnap = await getDocs(qCheck);
      if (!checkSnap.empty) {
        const existingDoc = checkSnap.docs[0];
        const existingChances = existingDoc.data().chances || 1;
        await updateDoc(doc(db, `raffles/${activeRaffle.id}/participants`, existingDoc.id), {
          chances: existingChances + 1,
          date: Timestamp.now()
        });
        alert("¡Esta persona ya estaba participando! Se le sumó +1 chance.");
        setNewName("");
        setNewPhone("");
        return;
      }

      await addDoc(collection(db, `raffles/${activeRaffle.id}/participants`), {
        name: newName.trim(),
        phoneOrEmail: newPhone.trim(),
        date: Timestamp.now(),
        chances: 1
      });
      setNewName("");
      setNewPhone("");
    } catch (error) {
      console.error("Error adding participant:", error);
    }
  };

  const handleDeleteParticipant = async (participantId: string) => {
    if (!activeRaffle) return;
    if (window.confirm("¿Eliminar este participante?")) {
      try {
        await deleteDoc(doc(db, `raffles/${activeRaffle.id}/participants`, participantId));
        if (editingParticipantId === participantId) {
          setEditingParticipantId(null);
        }
      } catch (error) {
        console.error("Error deleting participant:", error);
      }
    }
  };

  const startEditParticipant = (participant: Participant) => {
    setEditingParticipantId(participant.id);
    setEditName(participant.name);
    setEditPhone(participant.phoneOrEmail);
    setEditChances(participant.chances || 1);
  };

  const cancelEditParticipant = () => {
    setEditingParticipantId(null);
    setEditName("");
    setEditPhone("");
    setEditChances(1);
  };

  const handleSaveParticipant = async (participantId: string) => {
    if (!activeRaffle || !editName.trim() || !editPhone.trim()) return;

    setIsSavingEdit(true);
    try {
      const trimmedPhone = editPhone.trim();
      const currentParticipant = participants.find(p => p.id === participantId);
      const phoneChanged = currentParticipant?.phoneOrEmail !== trimmedPhone;

      if (phoneChanged) {
        const qCheck = query(
          collection(db, `raffles/${activeRaffle.id}/participants`),
          where("phoneOrEmail", "==", trimmedPhone),
          limit(1)
        );
        const checkSnap = await getDocs(qCheck);
        const duplicate = checkSnap.docs.find(d => d.id !== participantId);
        if (duplicate) {
          alert("¡Ya existe otro participante con ese teléfono o contacto!");
          return;
        }
      }

      await updateDoc(doc(db, `raffles/${activeRaffle.id}/participants`, participantId), {
        name: editName.trim(),
        phoneOrEmail: trimmedPhone,
        chances: editChances > 0 ? editChances : 1
      });
      cancelEditParticipant();
    } catch (error) {
      console.error("Error updating participant:", error);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const loadHistoryParticipants = (raffleId: string) => {
    if (!historyParticipants[raffleId]) {
      const q = query(collection(db, `raffles/${raffleId}/participants`), orderBy("date", "desc"));
      onSnapshot(q, (snap) => {
        const parts: Participant[] = [];
        snap.docs.forEach(d => parts.push({ id: d.id, ...d.data() } as Participant));
        setHistoryParticipants(prev => ({ ...prev, [raffleId]: parts }));
      });
    }
  };

  const toggleHistory = (raffleId: string) => {
    const isExpanded = expandedHistory[raffleId];
    if (!isExpanded) {
      loadHistoryParticipants(raffleId);
    }
    setExpandedHistory(prev => ({ ...prev, [raffleId]: !isExpanded }));
  };

  const filteredParticipants = participants.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.phoneOrEmail.toLowerCase().includes(search.toLowerCase())
  );

  const copyParticipantNames = async (list: Participant[]) => {
    if (list.length === 0) return;
    const text = list.map(p => {
      const chances = p.chances || 1;
      return Array(chances).fill(p.name).join("\n");
    }).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setNamesCopied(true);
      setTimeout(() => setNamesCopied(false), 2000);
    } catch (error) {
      console.error("Error copying names:", error);
      alert("No se pudieron copiar los nombres.");
    }
  };

  const pastRaffles = raffles.filter(r => !activeRaffle || r.id !== activeRaffle.id);

  const endModalParticipants = participants.filter(p =>
    p.name.toLowerCase().includes(endModalSearch.toLowerCase()) ||
    p.phoneOrEmail.toLowerCase().includes(endModalSearch.toLowerCase())
  );

  return (
    <div className="raffle-manager">
      <div className="raffle-header">
        <h2><FaGift /> Sorteos</h2>
      </div>

      <div className="raffle-tabs">
        <button 
          className={`raffle-tab ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Sorteo Activo
        </button>
        <button 
          className={`raffle-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Historial
        </button>
      </div>

      {activeTab === 'active' && (
        <div className="raffle-content">
          {!activeRaffle ? (
            <div className="raffle-card">
              <h3>Comenzar un Nuevo Sorteo</h3>
              <p style={{ color: '#64748b', marginBottom: '20px' }}>Inicia un sorteo para que los clientes que compren en la web comiencen a participar automáticamente.</p>
              <form onSubmit={handleStartRaffle} className="start-raffle-form">
                <div className="raffle-form-group">
                  <label>Nombre del Sorteo *</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Sorteo Día de la Madre" 
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    required
                  />
                </div>
                <div className="raffle-form-group">
                  <label>Descripción del Sorteo</label>
                  <textarea 
                    placeholder="Ej: Participá para ganarte increíbles premios este fin de semana." 
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                </div>
                <div className="raffle-form-group">
                  <label>Imagen de Portada (Opcional)</label>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setPendingImageFile(e.target.files[0]);
                        setImageEditorTarget('start');
                      }
                    }}
                    style={{ border: 'none', padding: '0' }}
                  />
                  {imageFile && (
                    <div style={{ marginTop: '10px' }}>
                      <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 'bold' }}><FaCheckCircle style={{ verticalAlign: 'middle', marginRight: '5px' }} />Imagen ajustada y lista</span>
                      <button type="button" onClick={() => setImageFile(null)} style={{ marginLeft: '10px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0' }} title="Quitar imagen"><FaTrash /></button>
                    </div>
                  )}
                  <small style={{ color: '#94a3b8', marginTop: '5px', display: 'block' }}>Imagen recomendada para el modal automático. Se abrirá el editor para ajustarla.</small>
                </div>
                <div className="raffle-form-group">
                  <label>Premios *</label>
                  {prizesInput.map((prize, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ marginRight: '10px', fontWeight: 'bold', width: '20px', color: '#64748b' }}>{index + 1}.</span>
                      <input 
                        type="text" 
                        placeholder={`Ej: Camiseta de la selección`} 
                        value={prize}
                        onChange={(e) => {
                          const newPrizes = [...prizesInput];
                          newPrizes[index] = e.target.value;
                          setPrizesInput(newPrizes);
                        }}
                        required={index === 0}
                        style={{ flex: 1, margin: 0 }}
                      />
                      {prizesInput.length > 1 && (
                        <button type="button" onClick={() => {
                          const newPrizes = prizesInput.filter((_, i) => i !== index);
                          setPrizesInput(newPrizes);
                        }} style={{ marginLeft: '10px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '5px' }} title="Eliminar premio"><FaTrash /></button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setPrizesInput([...prizesInput, ''])} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'transparent', border: '1px dashed #cbd5e1', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', color: '#64748b', marginTop: '5px' }}>
                    <FaPlus /> Agregar otro premio
                  </button>
                </div>
                <div className="raffle-form-group">
                  <label>Mensaje Promocional (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder={`Ej: ¡Realizando tu pedido participas automáticamente!`} 
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                  />
                  <small style={{ color: '#94a3b8', marginTop: '5px', display: 'block' }}>Este mensaje se mostrará a los clientes en el carrito de compras.</small>
                </div>
                <div className="raffle-form-group">
                  <label>Fecha del Sorteo (Opcional)</label>
                  <input 
                    type="date" 
                    value={drawDateInput}
                    onChange={(e) => setDrawDateInput(e.target.value)}
                  />
                  <small style={{ color: '#94a3b8', marginTop: '5px', display: 'block' }}>Indica qué día se realizará el sorteo.</small>
                </div>
                <div className="raffle-form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <input 
                    type="checkbox" 
                    id="modalModeCheckbox"
                    checked={isModalMode}
                    onChange={(e) => setIsModalMode(e.target.checked)}
                    style={{ width: '20px', height: '20px', margin: 0, cursor: 'pointer' }}
                  />
                  <label htmlFor="modalModeCheckbox" style={{ margin: 0, cursor: 'pointer', fontWeight: 'bold', color: '#0f172a' }}>Habilitar modalidad de modal automático al iniciar</label>
                </div>
                <button type="submit" className="btn-start-raffle" disabled={isStarting}>
                  <FaPlayCircle /> {isStarting ? 'Iniciando...' : 'Comenzar Sorteo'}
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="active-raffle-info">
                <div className="info-text">
                  <h3><FaTrophy style={{ color: '#eab308' }} /> {activeRaffle.title}</h3>
                  {activeRaffle.description && <p style={{ fontStyle: 'italic', color: '#475569', marginTop: '5px', marginBottom: '5px' }}>{activeRaffle.description}</p>}
                  <p style={{ fontWeight: 'bold', marginTop: '5px' }}>Premios: {activeRaffle.prize}</p>
                  {activeRaffle.drawDate && <p style={{ color: '#0f172a', marginTop: '5px', fontWeight: 'bold' }}>Se sortea el: {new Date(activeRaffle.drawDate + 'T00:00:00').toLocaleDateString('es-AR')}</p>}
                  <p style={{ fontSize: '0.9rem', marginTop: '5px' }}>Iniciado el: {activeRaffle.startDate?.toDate().toLocaleDateString('es-AR')} a las {activeRaffle.startDate?.toDate().toLocaleTimeString('es-AR')}</p>
                  {activeRaffle.isModalMode && <span style={{ display: 'inline-block', background: '#3b82f6', color: 'white', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', marginTop: '8px', fontWeight: 'bold' }}>Modal Automático Activado</span>}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleEditRaffle} className="btn-edit-raffle" style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaEdit /> Editar
                  </button>
                  <button onClick={handleEndRaffle} className="btn-end-raffle">
                    <FaStopCircle /> Finalizar Sorteo
                  </button>
                </div>
              </div>

              <div className="raffle-card">
                <div className="participants-header">
                  <h3>Participantes ({participants.length})</h3>
                  {participants.length > 0 && (
                    <button
                      type="button"
                      className="btn-copy-names"
                      onClick={() => copyParticipantNames(participants)}
                      title="Copiar todos los nombres (uno por línea)"
                    >
                      <FaCopy /> {namesCopied ? "¡Copiado!" : "Copiar nombres"}
                    </button>
                  )}
                </div>
                
                <form onSubmit={handleAddParticipant} className="add-participant-bar">
                  <input 
                    type="text" 
                    placeholder="Nombre del cliente (Local)" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                  <input 
                    type="text" 
                    placeholder="Teléfono" 
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn-add-participant"><FaPlus /> Agregar Manual</button>
                </form>

                <div className="search-bar">
                  <FaSearch className="search-icon" />
                  <input 
                    type="text" 
                    placeholder="Buscar participante por nombre o contacto..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {filteredParticipants.length === 0 ? (
                  <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>No hay participantes que coincidan.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="participants-table">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Contacto (Tel/Email)</th>
                          <th>Fecha</th>
                          <th>Chances</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredParticipants.map(p => {
                          const isEditing = editingParticipantId === p.id;
                          return (
                            <tr key={p.id} className={isEditing ? "participant-row-editing" : ""}>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    className="participant-edit-input"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    disabled={isSavingEdit}
                                  />
                                ) : (
                                  p.name
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    className="participant-edit-input"
                                    value={editPhone}
                                    onChange={(e) => setEditPhone(e.target.value)}
                                    disabled={isSavingEdit}
                                  />
                                ) : (
                                  <ParticipantContactLink contact={p.phoneOrEmail} />
                                )}
                              </td>
                              <td>{p.date?.toDate().toLocaleString() || '---'}</td>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="1"
                                    className="participant-edit-input"
                                    style={{ width: '60px' }}
                                    value={editChances}
                                    onChange={(e) => setEditChances(Number(e.target.value))}
                                    disabled={isSavingEdit}
                                  />
                                ) : (
                                  <span style={{ fontWeight: 'bold', color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: '12px' }}>{p.chances || 1}</span>
                                )}
                              </td>
                              <td>
                                <div className="participant-actions">
                                  {isEditing ? (
                                    <>
                                      <button
                                        onClick={() => handleSaveParticipant(p.id)}
                                        className="btn-save-participant"
                                        title="Guardar cambios"
                                        disabled={isSavingEdit || !editName.trim() || !editPhone.trim()}
                                      >
                                        <FaSave />
                                      </button>
                                      <button
                                        onClick={cancelEditParticipant}
                                        className="btn-cancel-participant"
                                        title="Cancelar"
                                        disabled={isSavingEdit}
                                      >
                                        <FaTimes />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => startEditParticipant(p)}
                                        className="btn-edit-participant"
                                        title="Editar participante"
                                        disabled={editingParticipantId !== null}
                                      >
                                        <FaEdit />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteParticipant(p.id)}
                                        className="btn-delete-participant"
                                        title="Eliminar participante"
                                        disabled={editingParticipantId !== null}
                                      >
                                        <FaTrash />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="raffle-content">
          <div className="raffle-card">
            <h3>Historial de Sorteos</h3>
            {pastRaffles.length === 0 ? (
              <p style={{ color: '#94a3b8' }}>Aún no hay sorteos finalizados.</p>
            ) : (
              <div className="history-list">
                {pastRaffles.map(raffle => (
                  <div key={raffle.id} className="history-card">
                    <div className="history-header" onClick={() => toggleHistory(raffle.id)}>
                      <div>
                        <h4><FaTrophy style={{ color: '#cbd5e1', marginRight: '8px' }} /> {raffle.title || 'Sorteo'}</h4>
                        <div style={{ fontSize: '0.9rem', color: '#475569', margin: '4px 0 2px 28px' }}>Premios: {raffle.prize}</div>
                        <div className="history-dates" style={{ marginLeft: '28px' }}>
                          <FaCalendarAlt /> {raffle.startDate?.toDate().toLocaleDateString('es-AR')} - {raffle.endDate ? raffle.endDate.toDate().toLocaleDateString('es-AR') : 'Sin finalizar / Duplicado'}
                        </div>
                        {raffle.winner && (
                          <div className="history-winner">
                            <FaTrophy /> Ganador: <strong>{raffle.winner.name}</strong>
                            {" · "}
                            <ParticipantContactLink contact={raffle.winner.phoneOrEmail} />
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span className="participant-count">
                          {historyParticipants[raffle.id] ? `${historyParticipants[raffle.id].length} Participantes` : 'Ver participantes'}
                        </span>
                        {expandedHistory[raffle.id] ? <FaChevronUp /> : <FaChevronDown />}
                      </div>
                    </div>
                    {expandedHistory[raffle.id] && (
                      <div className="history-body">
                        {historyParticipants[raffle.id] === undefined ? (
                          <p>Cargando participantes...</p>
                        ) : historyParticipants[raffle.id].length === 0 ? (
                          <p>No hubo participantes.</p>
                        ) : (
                          <>
                          <div style={{ marginBottom: '12px' }}>
                            <button
                              type="button"
                              className="btn-copy-names"
                              onClick={() => copyParticipantNames(historyParticipants[raffle.id])}
                              title="Copiar todos los nombres (uno por línea)"
                            >
                              <FaCopy /> Copiar nombres
                            </button>
                          </div>
                          <table className="participants-table" style={{ fontSize: '0.9rem' }}>
                            <thead>
                              <tr>
                                <th>Nombre</th>
                                <th>Contacto</th>
                                <th>Fecha</th>
                                <th>Chances</th>
                              </tr>
                            </thead>
                            <tbody>
                              {historyParticipants[raffle.id].map(p => {
                                const isWinner = raffle.winner?.participantId === p.id;
                                return (
                                <tr key={p.id} className={isWinner ? "participant-row-winner" : ""}>
                                  <td>
                                    {p.name}
                                    {isWinner && <span className="winner-badge">Ganador</span>}
                                  </td>
                                  <td><ParticipantContactLink contact={p.phoneOrEmail} /></td>
                                  <td>{p.date?.toDate().toLocaleString()}</td>
                                  <td><span style={{ fontWeight: 'bold', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>{p.chances || 1}</span></td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showEndModal && activeRaffle && (
        <div className="raffle-modal-overlay" onClick={closeEndModal}>
          <div className="raffle-modal" onClick={(e) => e.stopPropagation()}>
            <div className="raffle-modal-header">
              <h3><FaTrophy style={{ color: '#eab308' }} /> Finalizar sorteo</h3>
              <button type="button" className="raffle-modal-close" onClick={closeEndModal} disabled={isEnding}>
                <FaTimes />
              </button>
            </div>

            <p className="raffle-modal-subtitle">
              Seleccioná al ganador de <strong>{activeRaffle.title}</strong> antes de guardarlo en el historial.
            </p>

            {participants.length === 0 ? (
              <p className="raffle-modal-empty">No hay participantes en este sorteo. Podés finalizarlo sin ganador.</p>
            ) : (
              <>
                <div className="search-bar" style={{ marginBottom: '12px' }}>
                  <FaSearch className="search-icon" />
                  <input
                    type="text"
                    placeholder="Buscar participante..."
                    value={endModalSearch}
                    onChange={(e) => setEndModalSearch(e.target.value)}
                  />
                </div>

                <div className="winner-select-list">
                  {endModalParticipants.length === 0 ? (
                    <p className="raffle-modal-empty">No hay participantes que coincidan con la búsqueda.</p>
                  ) : (
                    endModalParticipants.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className={`winner-select-item ${selectedWinnerId === p.id ? "selected" : ""}`}
                        onClick={() => setSelectedWinnerId(p.id)}
                        disabled={isEnding}
                      >
                        <span className="winner-select-radio" aria-hidden="true" />
                        <span className="winner-select-info">
                          <strong>{p.name}</strong>
                          <span><ParticipantContactLink contact={p.phoneOrEmail} /></span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            <div className="raffle-modal-actions">
              <button type="button" className="btn-cancel-end" onClick={closeEndModal} disabled={isEnding}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-confirm-end"
                onClick={confirmEndRaffle}
                disabled={isEnding || (participants.length > 0 && !selectedWinnerId)}
              >
                <FaStopCircle /> {isEnding ? "Finalizando..." : "Finalizar sorteo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && activeRaffle && (
        <div className="raffle-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="raffle-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="raffle-modal-header">
              <h3><FaEdit style={{ color: '#3b82f6' }} /> Editar Sorteo</h3>
              <button type="button" className="raffle-modal-close" onClick={() => setShowEditModal(false)} disabled={isSavingRaffle}>
                <FaTimes />
              </button>
            </div>
            
            <form onSubmit={saveEditRaffle} className="start-raffle-form" style={{ padding: '20px' }}>
                <div className="raffle-form-group">
                  <label>Nombre del Sorteo *</label>
                  <input 
                    type="text" 
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="raffle-form-group">
                  <label>Descripción del Sorteo</label>
                  <textarea 
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                </div>
                <div className="raffle-form-group">
                  <label>Imagen de Portada (Opcional)</label>
                  {activeRaffle.imageUrl && !editImageFile && (
                    <div style={{ marginBottom: '10px' }}>
                      <img src={activeRaffle.imageUrl} alt="Actual" style={{ height: '60px', borderRadius: '4px', objectFit: 'cover' }} />
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Imagen actual</div>
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setPendingImageFile(e.target.files[0]);
                        setImageEditorTarget('edit');
                      }
                    }}
                    style={{ border: 'none', padding: '0' }}
                  />
                  {editImageFile && (
                    <div style={{ marginTop: '10px' }}>
                      <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 'bold' }}><FaCheckCircle style={{ verticalAlign: 'middle', marginRight: '5px' }} />Nueva imagen ajustada</span>
                      <button type="button" onClick={() => setEditImageFile(null)} style={{ marginLeft: '10px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0' }} title="Quitar nueva imagen"><FaTrash /></button>
                    </div>
                  )}
                  <small style={{ color: '#94a3b8', marginTop: '5px', display: 'block' }}>Selecciona una imagen nueva para reemplazar la actual. Se abrirá el editor.</small>
                </div>
                <div className="raffle-form-group">
                  <label>Premios *</label>
                  {editPrizes.map((prize, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ marginRight: '10px', fontWeight: 'bold', width: '20px', color: '#64748b' }}>{index + 1}.</span>
                      <input 
                        type="text" 
                        value={prize}
                        onChange={(e) => {
                          const newPrizes = [...editPrizes];
                          newPrizes[index] = e.target.value;
                          setEditPrizes(newPrizes);
                        }}
                        required={index === 0}
                        style={{ flex: 1, margin: 0 }}
                      />
                      {editPrizes.length > 1 && (
                        <button type="button" onClick={() => {
                          const newPrizes = editPrizes.filter((_, i) => i !== index);
                          setEditPrizes(newPrizes);
                        }} style={{ marginLeft: '10px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '5px' }} title="Eliminar premio"><FaTrash /></button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setEditPrizes([...editPrizes, ''])} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'transparent', border: '1px dashed #cbd5e1', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', color: '#64748b', marginTop: '5px' }}>
                    <FaPlus /> Agregar otro premio
                  </button>
                </div>
                <div className="raffle-form-group">
                  <label>Mensaje Promocional (Opcional)</label>
                  <input 
                    type="text" 
                    value={editMessage}
                    onChange={(e) => setEditMessage(e.target.value)}
                  />
                </div>
                <div className="raffle-form-group">
                  <label>Fecha del Sorteo (Opcional)</label>
                  <input 
                    type="date" 
                    value={editDrawDate}
                    onChange={(e) => setEditDrawDate(e.target.value)}
                  />
                </div>
                <div className="raffle-form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <input 
                    type="checkbox" 
                    id="editModalModeCheckbox"
                    checked={editIsModalMode}
                    onChange={(e) => setEditIsModalMode(e.target.checked)}
                    style={{ width: '20px', height: '20px', margin: 0, cursor: 'pointer' }}
                  />
                  <label htmlFor="editModalModeCheckbox" style={{ margin: 0, cursor: 'pointer', fontWeight: 'bold', color: '#0f172a' }}>Habilitar modalidad de modal automático al iniciar</label>
                </div>
                
                <div className="raffle-modal-actions" style={{ padding: '20px 0 0 0', marginTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                  <button type="button" className="btn-cancel-end" onClick={() => setShowEditModal(false)} disabled={isSavingRaffle}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-confirm-end"
                    style={{ background: '#3b82f6', color: 'white' }}
                    disabled={isSavingRaffle}
                  >
                    <FaSave /> {isSavingRaffle ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
            </form>
          </div>
        </div>
      )}

      {pendingImageFile && imageEditorTarget && (
        <ProductImageEditor
          imageFile={pendingImageFile}
          previewType="simple"
          aspectRatio={2 / 1}
          onConfirm={handleImageEditorConfirm}
          onCancel={() => {
            setPendingImageFile(null);
            setImageEditorTarget(null);
          }}
        />
      )}
    </div>
  );
}
