import { useState, useEffect, useRef } from "react";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useCart } from "../context/CartContext";
import confetti from "canvas-confetti";
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
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<any | null>(null);

  const wheelRef = useRef<HTMLDivElement>(null);
  const lastTickAngle = useRef<number>(0);

  // Fetch active raffle participants
  useEffect(() => {
    if (!isSuperAdmin) return;

    const fetchActiveRaffle = async () => {
      try {
        const q = query(collection(db, "raffles"), where("isActive", "==", true));
        const activeSnap = await getDocs(q);

        if (activeSnap.empty) {
          setLoading(false);
          return;
        }

        const activeDoc = activeSnap.docs[0];
        
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
  }, [isSuperAdmin]);

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

          const sliceAngle = 360 / participants.length;
          // Calcular índice actual pasando por el puntero (top = 0 deg)
          // La rueda gira en sentido horario, pero el transform rotate es absoluto
          const adjustedAngle = (360 - angle) % 360;
          const currentSlice = Math.floor(adjustedAngle / sliceAngle);

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

  if (!isSuperAdmin) {
    return (
      <div style={{ textAlign: 'center', marginTop: '100px', fontSize: '2rem' }}>
        ⛔ Acceso Denegado
      </div>
    );
  }

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

  const sliceAngle = 360 / participants.length;

  const handleSpin = () => {
    if (spinning) return;
    
    // Init audio on first user interaction
    audio.init();
    audio.playClick();
    
    setWinner(null);
    setSpinning(true);

    const extraSpins = 8; // 8 full rotations
    const winnerIndex = Math.floor(Math.random() * participants.length);
    
    // Para que el slice del winnerIndex caiga en 0 grados (arriba)
    // El centro del slice de winnerIndex está en: winnerIndex * sliceAngle
    // Por lo tanto, debemos rotar la rueda de manera que: (rotacion + centro_slice) % 360 == 0
    // rotacion = 360 - centro_slice
    
    const centerOffset = sliceAngle / 2;
    // Un pequeño random offset dentro de la porción para que no caiga SIEMPRE en el exacto centro
    const randomOffset = (Math.random() - 0.5) * (sliceAngle * 0.8); 
    
    const targetDegree = 360 - (winnerIndex * sliceAngle) - centerOffset + randomOffset;
    
    const totalRotation = rotation + (360 - (rotation % 360)) + (360 * extraSpins) + targetDegree;

    setRotation(totalRotation);

    // Esperar a que termine la animación de CSS (6s)
    setTimeout(() => {
      setSpinning(false);
      setWinner(participants[winnerIndex]);
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
    <div className="ruleta-container">
      <div className="ruleta-header">
        <h1>Ruleta de la Suerte</h1>
        <p>Gira la rueda para elegir al próximo gran ganador</p>
      </div>

      <div className="ruleta-wheel-wrapper">
        <div className="ruleta-flapper"></div>

        <div 
          className="ruleta-wheel"
          ref={wheelRef}
          style={{ 
            transform: `rotate(${rotation}deg)`, 
            transition: spinning ? 'transform 6s cubic-bezier(0.1, 0.7, 0.1, 1)' : 'none'
          }}
        >
          <svg viewBox="0 0 1000 1000" width="100%" height="100%">
            {participants.map((p, idx) => {
              const startAngle = idx * sliceAngle;
              const endAngle = startAngle + sliceAngle;
              
              const start = polarToCartesian(500, 500, 500, startAngle - 90);
              const end = polarToCartesian(500, 500, 500, endAngle - 90);
              const largeArcFlag = sliceAngle > 180 ? 1 : 0;
              
              const d = [
                "M", 500, 500,
                "L", start.x, start.y,
                "A", 500, 500, 0, largeArcFlag, 1, end.x, end.y,
                "Z"
              ].join(" ");

              const color = COLORS[idx % COLORS.length];

              // Posicionar el texto en el centro de la tajada (mitad del ángulo)
              // Rota desde el centro
              const midAngle = startAngle + (sliceAngle / 2);

              return (
                <g key={idx}>
                  <path d={d} fill={color} stroke="#fff" strokeWidth="2" />
                  <g transform={`translate(500, 500) rotate(${midAngle})`}>
                    <text 
                      x="0" 
                      y="-300" // Subir el texto hacia el borde exterior (radio = 500)
                      fill="#fff" 
                      fontSize={participants.length > 20 ? "24" : "32"} 
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      // Rotamos el texto para que se lea desde afuera hacia adentro o viceversa
                      transform="rotate(90, 0, -300)"
                      style={{ textShadow: "1px 1px 3px rgba(0,0,0,0.5)" }}
                    >
                      {p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="ruleta-center">
          <button 
            className="ruleta-spin-btn" 
            onClick={handleSpin} 
            disabled={spinning}
          >
            Girar
          </button>
        </div>
      </div>

      {winner && (
        <div className="ruleta-winner-modal-overlay" onClick={() => setWinner(null)}>
          <div className="ruleta-winner-modal" onClick={e => e.stopPropagation()}>
            <h2>🎉 ¡Tenemos un ganador! 🎉</h2>
            <h3>{winner.name}</h3>
            {winner.phone && <p>Teléfono: {winner.phone}</p>}
            <button onClick={() => setWinner(null)}>Aceptar</button>
          </div>
        </div>
      )}
    </div>
  );
}
