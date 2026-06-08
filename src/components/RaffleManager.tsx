import React, { useState, useEffect } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, orderBy, where, getDocs, limit } from "firebase/firestore";
import "./RaffleManager.css";
import { FaGift, FaSearch, FaTrash, FaPlus, FaTrophy, FaCalendarAlt, FaChevronDown, FaChevronUp, FaStopCircle, FaPlayCircle } from "react-icons/fa";

interface Raffle {
  id: string;
  title: string;
  prize: string;
  customMessage: string;
  drawDate?: string;
  startDate: any;
  endDate: any;
  isActive: boolean;
}

interface Participant {
  id: string;
  name: string;
  phoneOrEmail: string;
  date: any;
}

export default function RaffleManager() {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [activeRaffle, setActiveRaffle] = useState<Raffle | null>(null);
  
  // Start Raffle Form
  const [titleInput, setTitleInput] = useState("");
  const [prizeInput, setPrizeInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [drawDateInput, setDrawDateInput] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  // Participants of active raffle
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

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
        if (raffle.isActive) {
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

  const handleStartRaffle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim() || !prizeInput.trim()) return;
    setIsStarting(true);
    try {
      await addDoc(collection(db, "raffles"), {
        title: titleInput,
        prize: prizeInput,
        customMessage: messageInput,
        drawDate: drawDateInput,
        startDate: Timestamp.now(),
        endDate: null,
        isActive: true
      });
      setTitleInput("");
      setPrizeInput("");
      setMessageInput("");
      setDrawDateInput("");
    } catch (error) {
      console.error("Error starting raffle:", error);
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndRaffle = async () => {
    if (!activeRaffle) return;
    if (window.confirm("¿Seguro que deseas finalizar el sorteo actual? Los participantes quedarán guardados en el historial.")) {
      try {
        await updateDoc(doc(db, "raffles", activeRaffle.id), {
          isActive: false,
          endDate: Timestamp.now()
        });
      } catch (error) {
        console.error("Error ending raffle:", error);
      }
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
        alert("¡Esta persona ya está participando en el sorteo actual!");
        return;
      }

      await addDoc(collection(db, `raffles/${activeRaffle.id}/participants`), {
        name: newName.trim(),
        phoneOrEmail: newPhone.trim(),
        date: Timestamp.now()
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
      } catch (error) {
        console.error("Error deleting participant:", error);
      }
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

  const pastRaffles = raffles.filter(r => !r.isActive);

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
                  <label>Premios *</label>
                  <input 
                    type="text" 
                    placeholder="Ej: 1er Premio: Torta, 2do: Docena de Facturas" 
                    value={prizeInput}
                    onChange={(e) => setPrizeInput(e.target.value)}
                    required
                  />
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
                  <p style={{ fontWeight: 'bold', marginTop: '5px' }}>Premios: {activeRaffle.prize}</p>
                  {activeRaffle.drawDate && <p style={{ color: '#0f172a', marginTop: '5px', fontWeight: 'bold' }}>Se sortea el: {new Date(activeRaffle.drawDate + 'T00:00:00').toLocaleDateString()}</p>}
                  <p style={{ fontSize: '0.9rem', marginTop: '5px' }}>Iniciado el: {activeRaffle.startDate?.toDate().toLocaleDateString()} a las {activeRaffle.startDate?.toDate().toLocaleTimeString()}</p>
                </div>
                <button onClick={handleEndRaffle} className="btn-end-raffle">
                  <FaStopCircle /> Finalizar Sorteo
                </button>
              </div>

              <div className="raffle-card">
                <h3>Participantes ({participants.length})</h3>
                
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
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredParticipants.map(p => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td>{p.phoneOrEmail}</td>
                            <td>{p.date?.toDate().toLocaleString() || '---'}</td>
                            <td>
                              <button onClick={() => handleDeleteParticipant(p.id)} className="btn-delete-participant" title="Eliminar participante">
                                <FaTrash />
                              </button>
                            </td>
                          </tr>
                        ))}
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
                          <FaCalendarAlt /> {raffle.startDate?.toDate().toLocaleDateString()} - {raffle.endDate?.toDate().toLocaleDateString()}
                        </div>
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
                          <table className="participants-table" style={{ fontSize: '0.9rem' }}>
                            <thead>
                              <tr>
                                <th>Nombre</th>
                                <th>Contacto</th>
                                <th>Fecha</th>
                              </tr>
                            </thead>
                            <tbody>
                              {historyParticipants[raffle.id].map(p => (
                                <tr key={p.id}>
                                  <td>{p.name}</td>
                                  <td>{p.phoneOrEmail}</td>
                                  <td>{p.date?.toDate().toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
    </div>
  );
}
