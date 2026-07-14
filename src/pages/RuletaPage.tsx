import { useState, useEffect, useRef, useMemo } from "react";
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft } from "react-icons/fa";
import confetti from "canvas-confetti";
import logoImg from "../assets/logo.png";
import "./RuletaPage.css";

const COLORS = [
  "#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5",
  "#2196f3", "#03a9f4", "#00bcd4", "#009688", "#4caf50",
  "#8bc34a", "#cddc39", "#ffeb3b", "#ffc107", "#ff9800",
  "#ff5722"
];

// Audio Context helper
class AudioEngine {
  private ctx: AudioContext | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playClick() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playTick() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playWinner() {
    if (!this.ctx) return;
    // Simple fanfare
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, this.ctx!.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + i * 0.1 + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(this.ctx!.currentTime + i * 0.1);
      osc.stop(this.ctx!.currentTime + i * 0.1 + 0.5);
    });
  }
}

const audio = new AudioEngine();

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
}

export default function RuletaPage() {
  const { isSuperAdmin } = useCart();
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<any | null>(null);
  const [sessionWinners, setSessionWinners] = useState<any[]>([]);
  const [wheelExcludedWinners, setWheelExcludedWinners] = useState<any[]>([]);
  const [activeRaffleId, setActiveRaffleId] = useState<string | null>(null);
  const [activeRaffleData, setActiveRaffleData] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [numberOfPrizes, setNumberOfPrizes] = useState(3);

  const wheelRef = useRef<HTMLDivElement>(null);
  const lastTickAngle = useRef<number>(0);

  // Fetch active raffle participants
  useEffect(() => {
    const fetchActiveRaffle = async () => {
      try {
        const q = query(collection(db, "raffles"), where("isActive", "==", true));
        const activeSnap = await getDocs(q);

        if (activeSnap.empty) {
          setLoading(false);
          return;
        }

        const activeDoc = activeSnap.docs[0];
        setActiveRaffleId(activeDoc.id);
        setActiveRaffleData(activeDoc.data());

        // Listen to participants
        const unsub = onSnapshot(collection(db, `raffles/${activeDoc.id}/participants`), (snap) => {
          const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setParticipants(list);
          setLoading(false);
        });

        return () => unsub();
      } catch (err) {
        console.error("Error loading ruleta data", err);
        setLoading(false);
      }
    };

    fetchActiveRaffle();
  }, []);

  // Tick effect using requestAnimationFrame
  useEffect(() => {
    if (!spinning) return;

    let animFrame: number;
    const checkTick = () => {
      if (wheelRef.current) {
        // Obtenemos la rotación actual usando getComputedStyle
        const st = window.getComputedStyle(wheelRef.current);
        const tr = st.getPropertyValue("transform");
        if (tr !== 'none') {
          const values = tr.split('(')[1].split(')')[0].split(',');
          const a = values[0];
          const b = values[1];
          let angle = Math.round(Math.atan2(Number(b), Number(a)) * (180 / Math.PI));
          if (angle < 0) angle += 360;

          const adjustedAngle = (360 - angle) % 360;
          const currentSliceIndex = slices.findIndex(s => adjustedAngle >= s.startAngle && adjustedAngle < s.endAngle);
          const currentSlice = currentSliceIndex !== -1 ? currentSliceIndex : 0;

          if (currentSlice !== lastTickAngle.current) {
            audio.playTick();
            lastTickAngle.current = currentSlice;
          }
        }
      }
      animFrame = requestAnimationFrame(checkTick);
    };

    animFrame = requestAnimationFrame(checkTick);
    return () => cancelAnimationFrame(animFrame);
  }, [spinning, participants.length]);

  const availableParticipants = useMemo(() => {
    return participants.filter(p => !wheelExcludedWinners.some(w => w.id === p.id));
  }, [participants, wheelExcludedWinners]);

  const totalChances = availableParticipants.reduce((acc, p) => acc + (p.chances || 1), 0);

  const slices = useMemo(() => {
    let currentAngle = 0;
    return availableParticipants.map(p => {
      const chances = p.chances || 1;
      const angle = (chances / totalChances) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;
      return { participant: p, startAngle, endAngle, sliceAngle: angle };
    });
  }, [availableParticipants, totalChances]);

  const unselectedParticipants = useMemo(() => {
    return participants.filter(p => !sessionWinners.some(w => w.id === p.id));
  }, [participants, sessionWinners]);



  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: '100px' }}>Cargando Ruleta...</div>;
  }

  if (participants.length === 0) {
    return (
      <div style={{ textAlign: 'center', marginTop: '100px' }}>
        <h2>No hay participantes en el sorteo activo.</h2>
      </div>
    );
  }

  const handleSaveWinners = async () => {
    if (!activeRaffleId || sessionWinners.length === 0) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "raffles", activeRaffleId), {
        winners: arrayUnion(...sessionWinners)
      });
      alert("¡Ganadores guardados exitosamente en la base de datos!");
    } catch (error) {
      console.error("Error saving winners:", error);
      alert("Error al guardar ganadores.");
    } finally {
      setSaving(false);
    }
  };

  const handleSpin = () => {
    if (spinning || unselectedParticipants.length === 0) return;

    // Init audio on first user interaction
    audio.init();
    audio.playClick();

    setWheelExcludedWinners([...sessionWinners]);
    setWinner(null);
    setSpinning(true);

    const extraSpins = 8; // 8 full rotations

    const spinTotalChances = unselectedParticipants.reduce((acc, p) => acc + (p.chances || 1), 0);

    let currentAngle = 0;
    const spinSlices = unselectedParticipants.map(p => {
      const chances = p.chances || 1;
      const angle = (chances / spinTotalChances) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;
      return { participant: p, startAngle, endAngle, sliceAngle: angle };
    });

    // Selección ponderada por chances
    const randomTicket = Math.random() * spinTotalChances;
    let currentTicketCount = 0;
    let winnerIndex = 0;

    for (let i = 0; i < unselectedParticipants.length; i++) {
      currentTicketCount += (unselectedParticipants[i].chances || 1);
      if (randomTicket <= currentTicketCount) {
        winnerIndex = i;
        break;
      }
    }

    const winnerSlice = spinSlices[winnerIndex];
    const centerOffset = winnerSlice.sliceAngle / 2;
    // Un pequeño random offset dentro de la porción para que no caiga SIEMPRE en el exacto centro
    const randomOffset = (Math.random() - 0.5) * (winnerSlice.sliceAngle * 0.8);

    const targetDegree = 360 - winnerSlice.startAngle - centerOffset + randomOffset;

    const totalRotation = rotation + (360 - (rotation % 360)) + (360 * extraSpins) + targetDegree;

    setRotation(totalRotation);

    // Esperar a que termine la animación de CSS (6s)
    setTimeout(() => {
      setSpinning(false);
      const selectedWinner = unselectedParticipants[winnerIndex];
      setWinner(selectedWinner);
      setSessionWinners(prev => [...prev, selectedWinner]);
      audio.playWinner();
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6']
      });
    }, 6000); // 6 seconds matches the CSS transition
  };

  return (
    <div className="ruleta-page-wrapper">
      <button
        onClick={() => navigate(-1)}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          zIndex: 100,
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
          color: 'white',
          padding: '10px 15px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          fontWeight: 'bold',
          backdropFilter: 'blur(5px)'
        }}
      >
        <FaArrowLeft /> Volver
      </button>

      {/* LEFT SIDEBAR: Configuración */}
      {isSuperAdmin && (
        <div className="ruleta-sidebar-left">
          <h2>Configuración</h2>

          <div style={{ marginBottom: '15px', background: '#334155', padding: '10px', borderRadius: '8px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px', color: '#cbd5e1' }}>Total de premios:</label>
            <input
              type="number"
              value={numberOfPrizes}
              onChange={e => setNumberOfPrizes(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={sessionWinners.length > 0}
              style={{
                width: '100%', padding: '8px', borderRadius: '4px',
                border: '1px solid #475569', background: '#1e293b',
                color: 'white', fontSize: '1.1rem', fontWeight: 'bold'
              }}
            />
            {sessionWinners.length === 0 && <small style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginTop: '5px' }}>Configúralo antes de girar.</small>}
          </div>

          <button
            className="ruleta-save-btn"
            onClick={handleSaveWinners}
            disabled={saving || sessionWinners.length === 0}
            style={{ marginTop: 'auto' }}
          >
            {saving ? "Guardando..." : "Guardar ganadores"}
          </button>
        </div>
      )}

      <div className="ruleta-container">
        <div className="ruleta-header">
          <h1>{activeRaffleData?.name || "Sorteo Día del Amigo"}</h1>
          <h1>{activeRaffleData?.name || "20-07"}</h1>
        </div>

        <div className="ruleta-wheel-wrapper">
          <div className="ruleta-flapper"></div>

          <div
            className={`ruleta-wheel ${!isSuperAdmin ? 'idle-spin' : ''}`}
            ref={wheelRef}
            style={isSuperAdmin ? {
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 6s cubic-bezier(0.1, 0.7, 0.1, 1)' : 'none'
            } : {}}
          >
            <svg viewBox="0 0 1000 1000" width="100%" height="100%">
              {slices.map((slice, idx) => {
                const { participant: p, startAngle, endAngle, sliceAngle } = slice;

                const start = polarToCartesian(500, 500, 500, startAngle);
                const end = polarToCartesian(500, 500, 500, endAngle);
                const largeArcFlag = sliceAngle > 180 ? 1 : 0;

                const d = [
                  "M", 500, 500,
                  "L", start.x, start.y,
                  "A", 500, 500, 0, largeArcFlag, 1, end.x, end.y,
                  "Z"
                ].join(" ");

                const color = COLORS[idx % COLORS.length];

                // Posicionar el texto en el centro de la tajada usando un textPath
                const midAngle = startAngle + (sliceAngle / 2);

                const innerRadius = 120;
                const outerRadius = 450;
                const centerPos = polarToCartesian(500, 500, innerRadius, midAngle);
                const edgePos = polarToCartesian(500, 500, outerRadius, midAngle);

                const pathId = `text-path-${idx}`;
                const textPathD = `M ${centerPos.x} ${centerPos.y} L ${edgePos.x} ${edgePos.y}`;

                return (
                  <g key={idx}>
                    <path d={d} fill={color} stroke="#fff" strokeWidth="2" />
                    <defs>
                      <path id={pathId} d={textPathD} />
                    </defs>
                    <text
                      fill="#fff"
                      fontSize={availableParticipants.length > 20 ? "24" : "32"}
                      fontWeight="bold"
                      style={{ textShadow: "1px 1px 3px rgba(0,0,0,0.5)" }}
                    >
                      <textPath
                        href={`#${pathId}`}
                        startOffset="50%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        alignmentBaseline="middle"
                      >
                        {(() => {
                          const displayName = p.name ? p.name : (p.phoneOrEmail ? p.phoneOrEmail : "Participante");
                          return displayName.length > 15 ? displayName.substring(0, 15) + '...' : displayName;
                        })()}
                      </textPath>
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="ruleta-center">
            {isSuperAdmin ? (
              <button
                className="ruleta-spin-btn"
                onClick={handleSpin}
                disabled={spinning || unselectedParticipants.length === 0}
              >
                <img src={logoImg} alt="Girar" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
              </button>
            ) : (
              <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={logoImg} alt="Logo" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
              </div>
            )}
          </div>
        </div>

        {winner && (
          <div className="ruleta-winner-modal-overlay" onClick={() => setWinner(null)}>
            <div className="ruleta-winner-modal" onClick={e => e.stopPropagation()}>
              <h2>🎉 ¡Tenemos un ganador! 🎉</h2>
              <h3>{winner.name || winner.phoneOrEmail || "Participante"}</h3>
              {/* Contacto oculto a pedido del usuario */}
              <button onClick={() => setWinner(null)}>Aceptar</button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT SIDEBAR: Premios */}
      {isSuperAdmin && (
        <div className="ruleta-sidebar-right">
          <h2>Premios</h2>

          <ul className="ruleta-winners-list" style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {Array.from({ length: numberOfPrizes }).map((_, idx) => {
              const pos = idx + 1; // 1, 2, 3...
              const winnerIndex = numberOfPrizes - pos;
              const winner = sessionWinners[winnerIndex];

              let medalColor = '#64748b'; // default gris
              let shadowColor = 'transparent';
              if (pos === 1) {
                medalColor = '#fbbf24'; // Dorado
                shadowColor = 'rgba(251, 191, 36, 0.4)';
              } else if (pos === 2) {
                medalColor = '#cbd5e1'; // Plata
                shadowColor = 'rgba(203, 213, 225, 0.4)';
              } else if (pos === 3) {
                medalColor = '#b45309'; // Bronce
                shadowColor = 'rgba(180, 83, 9, 0.4)';
              }

              return (
                <li key={pos} style={{
                  display: 'flex', alignItems: 'center', background: '#334155',
                  padding: '15px', borderRadius: '12px', border: `2px solid ${winner ? medalColor : 'transparent'}`,
                  boxShadow: winner ? `0 0 15px ${shadowColor}` : 'none',
                  transition: 'all 0.5s ease',
                  opacity: winner ? 1 : 0.6
                }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: medalColor, color: pos === 1 ? '#000' : '#fff',
                    fontWeight: 'bold', fontSize: '1.2rem',
                    marginRight: '15px', boxShadow: `0 0 10px ${medalColor}`
                  }}>
                    {pos}º
                  </span>
                  <span className="winner-name" style={{
                    fontSize: winner ? '1.2rem' : '1rem',
                    color: winner ? '#fff' : '#94a3b8',
                    fontWeight: winner ? 'bold' : 'normal',
                    fontStyle: winner ? 'normal' : 'italic'
                  }}>
                    {winner ? (winner.name || winner.phoneOrEmail || "Participante") : "Esperando ganador..."}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

    </div>
  );
}
