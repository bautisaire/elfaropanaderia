import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { FaMicrophone, FaRobot, FaTimes, FaCheckCircle, FaTrash, FaPlus } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { RawMaterial } from './CostManager';

const SearchableSelect = ({ value, options, onChange, placeholder, style }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find((o: any) => o.value === value);
    const displayValue = isOpen ? search : (selectedOption ? selectedOption.label : '');
    const filteredOptions = options.filter((o: any) => o.label.toLowerCase().includes(search.toLowerCase()));

    return (
        <div ref={wrapperRef} style={{ position: 'relative', ...style }}>
            <input
                type="text"
                value={displayValue}
                onChange={(e) => {
                    setSearch(e.target.value);
                    if (!isOpen) setIsOpen(true);
                }}
                onFocus={() => { setIsOpen(true); setSearch(''); }}
                placeholder={placeholder}
                style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', outline: 'none', fontWeight: 'bold', fontFamily: 'inherit', color: 'inherit' }}
            />
            {isOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: 'normal' }}>
                    {filteredOptions.length === 0 ? <div style={{ padding: '8px', color: '#94a3b8' }}>Sin resultados</div> : null}
                    {filteredOptions.map((o: any) => (
                        <div
                            key={o.value}
                            onClick={() => {
                                onChange(o.value);
                                setIsOpen(false);
                                setSearch('');
                            }}
                            onMouseEnter={(e: any) => e.target.style.background = '#f1f5f9'}
                            onMouseLeave={(e: any) => e.target.style.background = 'transparent'}
                            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem', color: '#334155' }}
                        >
                            {o.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

interface VoiceAIPurchasesProps {
    rawMaterials: RawMaterial[];
}

export default function VoiceAIPurchases({ rawMaterials }: VoiceAIPurchasesProps) {
    const { user } = useAuth();
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [isProcessingAI, setIsProcessingAI] = useState(false);
    const [aiDetectedProducts, setAiDetectedProducts] = useState<any[]>([]);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'es-AR';

            recognitionRef.current.onresult = (event: any) => {
                let currentTranscript = '';
                for (let i = 0; i < event.results.length; i++) {
                    currentTranscript += event.results[i][0].transcript;
                }
                setTranscript(currentTranscript);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                setIsRecording(false);
            };

            recognitionRef.current.onend = () => {
                if (isRecording) {
                    setIsRecording(false);
                }
            };
        }
    }, [isRecording]);

    const toggleRecording = () => {
        if (!recognitionRef.current) {
            alert("Tu navegador no soporta reconocimiento de voz. Usa Chrome.");
            return;
        }

        if (isRecording) {
            recognitionRef.current.stop();
            setIsRecording(false);
        } else {
            setTranscript('');
            setAiDetectedProducts([]);
            recognitionRef.current.start();
            setIsRecording(true);
        }
    };

    const calculateEstimatedAIPrice = (prod: any) => {
        if (!prod.rawMaterialId) return 0;
        const mat = rawMaterials.find(m => m.id === prod.rawMaterialId);
        if (!mat) return 0;

        let totalAiAmount = prod.cantidad || 0;
        let aiUnit = prod.unidad?.toLowerCase() || '';
        if (aiUnit === 'kg' || aiUnit === 'l') totalAiAmount *= 1000;

        let baseAmount = mat.baseQuantity || 1;
        let baseUnit = mat.unit?.toLowerCase() || '';
        if (baseUnit === 'kg' || baseUnit === 'l') baseAmount *= 1000;

        if (baseAmount === 0) return 0;
        return (totalAiAmount / baseAmount) * (mat.price || 0);
    };

    const processVoiceWithAI = async () => {
        if (!transcript) return alert("No hay texto para procesar.");

        setIsProcessingAI(true);
        try {
            const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
            if (!apiKey) throw new Error("Falta VITE_OPENAI_API_KEY en .env");

            const prompt = `
Eres un asistente experto en compras de inventario. Analiza el siguiente texto dictado por un usuario que está registrando compras de materias primas.

Extrae las materias primas, sus cantidades y unidades (gramos a 'kg', mililitros a 'l', y considerando 'unidad', 'kg', 'g', 'l', 'ml'). IMPORTANTE: No resumas ni recortes los nombres de los productos, mantén el nombre compuesto original tal cual lo dictó el usuario (ejemplo: "margarina de hojaldre" NUNCA debe acortarse a solo "margarina").
Extrae también el multiplicador si se menciona (ej: "10 cajas de 2 kilos de manteca" -> nombre: manteca, cantidad: 2, unidad: kg, multiplicador: 10). Si dice "por 10" o "x 10" el multiplicador es 10. Por defecto el multiplicador es 1.
Extrae también el 'precioDictado' si el usuario menciona cuánto costó (solo el número, null si no lo menciona). 
Si el usuario dice un número suelto igual o mayor a 1000 sin especificar unidad de peso o volumen pesada, asume que se está refiriendo al 'precioDictado' del producto y NO a la cantidad.
Detecta si el usuario comete un error y se corrige. Usa la versión corregida.
Si el usuario SOLO menciona un precio pero no cantidad (ej: "margarina de hojaldre 64000 pesos", o "vacalin 25000"), asigna cantidad a 0 y envia el precioDictado.

Devuelve ÚNICAMENTE un JSON válido, sin delimitadores de Markdown (\`\`\`json).
Formato OBLIGATORIO:
{
  "productos": [
    {
      "nombre": "string",
      "cantidad": number,
      "unidad": "kg" | "g" | "l" | "ml" | "unidad",
      "multiplicador": number,
      "precioDictado": number | null
    }
  ],
  "correccion": boolean
}

Texto del usuario: "${transcript}"
            `;

            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    response_format: { type: "json_object" }
                })
            });

            if (!res.ok) {
                if (res.status === 429) {
                    throw new Error("Error 429. Límite de cuota alcanzado. OpenAI requiere que agregues saldo a tu cuenta.");
                } else if (res.status === 401) {
                    throw new Error("Error 401. Clave de API inválida.");
                }
                throw new Error("Error consultando la API de OpenAI");
            }

            const aiRes = await res.json();
            const data = JSON.parse(aiRes.choices[0].message.content);

            const matchedProducts = data.productos.map((aiProd: any) => {
                const aiNameLow = aiProd.nombre.toLowerCase().trim();

                // 1. Exact match first (no substring includes here)
                let foundMat = rawMaterials.find(m => m.name.toLowerCase().trim() === aiNameLow);

                // 2. Fuzzy matching if exact fails
                if (!foundMat) {
                    const aiWords = aiNameLow.split(/\s+/).filter((w: string) => w.length > 2);
                    let bestMatches: RawMaterial[] = [];
                    let maxScore = 0;

                    rawMaterials.forEach(m => {
                        let score = 0;
                        const mNameLow = m.name.toLowerCase().trim();
                        const mWords = mNameLow.split(/\s+/);

                        aiWords.forEach((aw: string) => {
                            if (mWords.includes(aw)) {
                                score += 10; // Exact word match
                            } else if (aw.endsWith('s') && mWords.includes(aw.slice(0, -1))) {
                                score += 8; // Plural word match exactly
                            } else if (aw.endsWith('es') && mWords.includes(aw.slice(0, -2))) {
                                score += 8; // Plural -es
                            } else if (mNameLow.includes(aw)) {
                                score += 4; // Substring
                            } else if (aw.length > 3 && mNameLow.includes(aw.slice(0, -1))) {
                                score += 3; // Substring missing last letter
                            }
                        });

                        // Tie-breakers
                        if (mNameLow.includes(aiNameLow) || aiNameLow.includes(mNameLow)) {
                            score += 2;
                        }

                        if (score > 0) {
                            // Only replace maxScore if it's strictly better
                            if (score > maxScore) {
                                maxScore = score;
                                bestMatches = [m];
                            } else if (score === maxScore) {
                                bestMatches.push(m);
                            }
                        }
                    });

                    // Resolve
                    if (bestMatches.length === 1) {
                        foundMat = bestMatches[0];
                    } else if (bestMatches.length > 1) {
                        foundMat = undefined;
                        aiProd.suggestedMatches = bestMatches;
                    }
                }

                let finalCantidad = (aiProd.cantidad || 0) * (aiProd.multiplicador || 1);
                let finalUnidad = aiProd.unidad || 'unidad';

                // Inverse Calculation: If we have dictated price, zero quantity, and a matched material
                if (aiProd.precioDictado && (!aiProd.cantidad || aiProd.cantidad === 0) && foundMat && foundMat.price > 0) {
                    const priceRatio = aiProd.precioDictado / foundMat.price;
                    let estimatedBaseUnits = priceRatio * foundMat.baseQuantity;

                    if (foundMat.unit === 'g' && estimatedBaseUnits >= 1000) {
                        finalCantidad = parseFloat((estimatedBaseUnits / 1000).toFixed(2));
                        finalUnidad = 'kg';
                    } else if (foundMat.unit === 'ml' && estimatedBaseUnits >= 1000) {
                        finalCantidad = parseFloat((estimatedBaseUnits / 1000).toFixed(2));
                        finalUnidad = 'l';
                    } else if ((foundMat.unit === 'kg' || foundMat.unit === 'l') && estimatedBaseUnits < 1) {
                        // e.g. base is kg, calculated 0.5 -> make it 500g
                        finalCantidad = Math.round(estimatedBaseUnits * 1000);
                        finalUnidad = foundMat.unit === 'kg' ? 'g' : 'ml';
                    } else {
                        finalCantidad = Math.round(estimatedBaseUnits * 100) / 100;
                        finalUnidad = foundMat.unit;
                    }
                }

                return {
                    ...aiProd,
                    cantidad: finalCantidad,
                    unidad: finalUnidad,
                    id: crypto.randomUUID(),
                    precioDictado: aiProd.precioDictado || null,
                    precioEditado: undefined,
                    suggestedMatches: aiProd.suggestedMatches || [],
                    rawMaterialId: foundMat?.id || null,
                    matchedName: foundMat?.name || "No encontrado en BD"
                };
            });

            setAiDetectedProducts(matchedProducts);
        } catch (error: any) {
            console.error(error);
            alert(error.message || "Hubo un problema procesando el dictado. Intenta nuevamente.");
        } finally {
            setIsProcessingAI(false);
        }
    };

    const confirmAIPurchases = async () => {
        if (aiDetectedProducts.length === 0) return;

        const cleanedItems = aiDetectedProducts.map(prod => {
            const cleanProd = { ...prod };
            Object.keys(cleanProd).forEach(key => {
                if (cleanProd[key] === undefined) {
                    delete cleanProd[key];
                }
            });
            return cleanProd;
        });

        try {
            await addDoc(collection(db, "voice_purchases"), {
                timestamp: Timestamp.now(),
                items: cleanedItems,
                originalText: transcript || "Carga Manual"
            });

            alert("¡Compra guardada con éxito!");
            setAiDetectedProducts([]);
            setTranscript('');
        } catch (error) {
            console.error(error);
            alert("Error al guardar la compra.");
        }
    };

    return (
        <div className="cm-tab-content">
            <h3><FaRobot style={{ color: '#8b5cf6' }} /> Asistente de Carga por Voz / Manual</h3>
            <p style={{ color: '#64748b', marginBottom: '20px' }}>
                Dicta las compras o ingresa los datos manualmente.
            </p>

            <div className="cm-ai-voice-container">
                <div className="ai-record-section">
                    <button
                        className={`ai-record-btn ${isRecording ? 'recording' : ''}`}
                        onClick={toggleRecording}
                    >
                        <FaMicrophone size={32} />
                    </button>
                    <p>{isRecording ? "Escuchando... Haz clic para detener." : "Haz clic para empezar a grabar"}</p>
                </div>

                <div className="ai-transcript-box">
                    <h4>Texto Capturado:</h4>
                    <textarea
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        placeholder="Aquí aparecerá lo que dictes..."
                    />
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button
                            className="cm-btn-primary"
                            style={{ flex: 1, background: '#8b5cf6' }}
                            onClick={processVoiceWithAI}
                            disabled={!transcript || isProcessingAI}
                        >
                            {isProcessingAI ? "🧠 Procesando..." : "Procesar Texto"}
                        </button>
                        <button
                            className="cm-btn-primary"
                            style={{ flex: 1, background: '#3b82f6' }}
                            onClick={() => {
                                setAiDetectedProducts([{
                                    id: crypto.randomUUID(),
                                    nombre: "Ingreso Manual",
                                    cantidad: 0,
                                    unidad: "unidad",
                                    rawMaterialId: "",
                                    precioEditado: 0,
                                    precioDictado: null
                                }]);
                            }}
                        >
                            <FaPlus style={{ marginRight: '8px' }} /> Ingreso Manual
                        </button>
                    </div>
                </div>

                {aiDetectedProducts.length > 0 && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                        backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
                        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '20px', fontFamily: '"Courier New", Courier, monospace'
                    }}>
                        <div style={{
                            background: '#fff', width: '100%', maxWidth: '900px', maxHeight: '90vh',
                            overflowY: 'auto', padding: '30px', borderRadius: '4px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            borderTop: '20px solid #cbd5e1', borderBottom: '20px dashed #cbd5e1'
                        }}>
                            <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px dashed #94a3b8', paddingBottom: '10px' }}>
                                <h2 style={{ margin: 0, color: '#0f172a', fontWeight: 'bold' }}>TICKET DE INGRESO</h2>
                                <p style={{ margin: '5px 0', color: '#475569' }}>----------------------------------------</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#334155' }}>
                                    <span>FECHA: {new Date().toLocaleDateString()}</span>
                                    <span>HORA: {new Date().toLocaleTimeString()}</span>
                                </div>
                                <div style={{ textAlign: 'left', fontSize: '0.9rem', color: '#334155', marginTop: '5px' }}>
                                    <span>USUARIO: {user?.email || 'Administrador'}</span>
                                </div>
                                <div style={{ textAlign: 'left', fontSize: '0.8rem', color: '#64748b', marginTop: '10px', fontStyle: 'italic', background: '#f8fafc', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontWeight: 'bold' }}>Dictado Original:</span> "{transcript}"
                                </div>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                        <th style={{ padding: '8px' }}>P. Detectado</th>
                                        <th style={{ padding: '8px' }}>Materia Prima</th>
                                        <th style={{ padding: '8px' }}>Cantidad</th>
                                        <th style={{ padding: '8px' }}>Unidad</th>
                                        <th style={{ padding: '8px' }}>Precio</th>
                                        <th style={{ padding: '8px' }}>Del</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {aiDetectedProducts.map((prod, idx) => {
                                        const estimatedPrice = calculateEstimatedAIPrice(prod);
                                        return (
                                            <tr key={prod.id || idx} style={{ borderBottom: '1px dashed #e2e8f0', background: prod.rawMaterialId ? 'transparent' : '#fef2f2' }}>
                                                <td style={{ padding: '8px', textTransform: 'capitalize' }}>{prod.nombre}</td>
                                                <td style={{ padding: '8px' }}>
                                                    <SearchableSelect
                                                        value={prod.rawMaterialId || ""}
                                                        onChange={(newVal: string) => {
                                                            const newProd = [...aiDetectedProducts];
                                                            const targetProd = newProd[idx];
                                                            targetProd.rawMaterialId = newVal;
                                                            const sMat = rawMaterials.find(m => m.id === newVal);
                                                            if (sMat) {
                                                                targetProd.matchedName = sMat.name;
                                                                targetProd.suggestedMatches = []; // clear warning

                                                                // Recalculate inverse quantity if dictated price exists & quantity is 0
                                                                if (targetProd.precioDictado && (!targetProd.cantidad || targetProd.cantidad === 0) && sMat.price > 0) {
                                                                    const priceRatio = targetProd.precioDictado / sMat.price;
                                                                    let estimatedBaseUnits = priceRatio * sMat.baseQuantity;

                                                                    if (sMat.unit === 'g' && estimatedBaseUnits >= 1000) {
                                                                        targetProd.cantidad = parseFloat((estimatedBaseUnits / 1000).toFixed(2));
                                                                        targetProd.unidad = 'kg';
                                                                    } else if (sMat.unit === 'ml' && estimatedBaseUnits >= 1000) {
                                                                        targetProd.cantidad = parseFloat((estimatedBaseUnits / 1000).toFixed(2));
                                                                        targetProd.unidad = 'l';
                                                                    } else if ((sMat.unit === 'kg' || sMat.unit === 'l') && estimatedBaseUnits < 1) {
                                                                        targetProd.cantidad = Math.round(estimatedBaseUnits * 1000);
                                                                        targetProd.unidad = sMat.unit === 'kg' ? 'g' : 'ml';
                                                                    } else {
                                                                        targetProd.cantidad = Math.round(estimatedBaseUnits * 100) / 100;
                                                                        targetProd.unidad = sMat.unit;
                                                                    }
                                                                }
                                                            }
                                                            setAiDetectedProducts(newProd);
                                                        }}
                                                        placeholder={prod.suggestedMatches?.length > 1 ? `⚠️ Conflicto: ${prod.suggestedMatches.length} opciones. Escribe para buscar...` : '⚠️ No definido, buscar...'}
                                                        style={{
                                                            border: prod.suggestedMatches?.length > 1 ? '2px solid #eab308' : (prod.rawMaterialId ? '1px solid #cbd5e1' : '1px solid #ef4444'),
                                                            padding: '4px',
                                                            borderRadius: '4px',
                                                            width: '280px',
                                                            background: prod.suggestedMatches?.length > 1 ? '#fefce8' : '#fff',
                                                            color: prod.suggestedMatches?.length > 1 ? '#854d0e' : 'inherit'
                                                        }}
                                                        options={[
                                                            ...(prod.suggestedMatches?.length > 1 ? prod.suggestedMatches.map((rm: any) => ({
                                                                value: rm.id,
                                                                label: `⚠️Sugerido: ${rm.name} (${rm.baseQuantity}${rm.unit} - $${rm.price})`
                                                            })) : []),
                                                            ...rawMaterials.map(rm => ({
                                                                value: rm.id,
                                                                label: `${rm.name} (${rm.baseQuantity}${rm.unit} - $${rm.price})`
                                                            }))
                                                        ].filter((o, i, a) => a.findIndex(t => t.value === o.value) === i)} // remove duplicates
                                                    />
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    <input
                                                        type="number"
                                                        value={prod.cantidad}
                                                        onChange={(e) => {
                                                            const newProd = [...aiDetectedProducts];
                                                            newProd[idx].cantidad = Number(e.target.value);
                                                            setAiDetectedProducts(newProd);
                                                        }}
                                                        style={{ width: '80px', padding: '4px', textAlign: 'right', fontFamily: 'inherit' }}
                                                    />
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    <select
                                                        value={prod.unidad}
                                                        onChange={(e) => {
                                                            const newProd = [...aiDetectedProducts];
                                                            newProd[idx].unidad = e.target.value;
                                                            setAiDetectedProducts(newProd);
                                                        }}
                                                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontFamily: 'inherit' }}
                                                    >
                                                        <option value="g">g</option>
                                                        <option value="kg">kg</option>
                                                        <option value="ml">ml</option>
                                                        <option value="l">l</option>
                                                        <option value="unidad">un</option>
                                                    </select>
                                                </td>
                                                <td style={{ padding: '8px', fontWeight: 'bold', fontSize: '1.1rem', color: '#0f172a' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                                        <span style={{ marginRight: '4px', color: prod.precioDictado || prod.precioEditado !== undefined ? '#8b5cf6' : '#0f172a' }}>$</span>
                                                        <input
                                                            type="number"
                                                            value={Math.round(prod.precioEditado !== undefined ? prod.precioEditado : (prod.precioDictado || estimatedPrice))}
                                                            onChange={(e) => {
                                                                const newProd = [...aiDetectedProducts];
                                                                newProd[idx].precioEditado = Number(e.target.value);
                                                                setAiDetectedProducts(newProd);
                                                            }}
                                                            style={{ width: '90px', padding: '4px', textAlign: 'right', fontFamily: 'inherit', fontWeight: 'bold', border: '1px solid #cbd5e1', borderRadius: '4px', color: prod.precioDictado || prod.precioEditado !== undefined ? '#8b5cf6' : '#0f172a' }}
                                                        />
                                                    </div>
                                                    {(prod.precioDictado || prod.precioEditado !== undefined) && (
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                                                            Est: ${estimatedPrice.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    <button
                                                        className="cm-icon-btn delete"
                                                        style={{ padding: '6px', cursor: 'pointer' }}
                                                        onClick={() => {
                                                            setAiDetectedProducts(aiDetectedProducts.filter((_, i) => i !== idx));
                                                        }}
                                                        title="Eliminar fila"
                                                    >
                                                        <FaTrash color="#ef4444" size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>

                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                                <button
                                    onClick={() => {
                                        setAiDetectedProducts([...aiDetectedProducts, {
                                            id: crypto.randomUUID(),
                                            nombre: "Nueva fila manual",
                                            cantidad: 0,
                                            unidad: "unidad",
                                            rawMaterialId: "",
                                            precioEditado: 0,
                                            precioDictado: null
                                        }]);
                                    }}
                                    style={{
                                        background: '#f8fafc', border: '1px dashed #cbd5e1', color: '#3b82f6',
                                        padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold',
                                        display: 'flex', alignItems: 'center', gap: '8px'
                                    }}
                                >
                                    <FaPlus /> Añadir Fila Manual
                                </button>
                            </div>

                            {/* TOTAL TICKET */}
                            <div style={{ borderTop: '2px dashed #94a3b8', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#0f172a' }}>TOTAL TICKET:</span>
                                <span style={{ fontWeight: 'bold', fontSize: '1.5rem', color: '#166534' }}>
                                    ${aiDetectedProducts.reduce((sum, p) => {
                                        const est = calculateEstimatedAIPrice(p);
                                        const finalPrice = p.precioEditado !== undefined ? p.precioEditado : (p.precioDictado || est);
                                        return sum + finalPrice;
                                    }, 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                                <button className="cm-icon-btn cancel" onClick={() => setAiDetectedProducts([])} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '12px 20px', fontWeight: 'bold', color: '#475569', borderRadius: '4px' }}>
                                    <FaTimes style={{ marginRight: '8px' }} /> Descartar Ticket
                                </button>
                                <button className="cm-btn-primary" onClick={confirmAIPurchases} style={{ background: '#0f172a', padding: '12px 25px', fontSize: '1.1rem', fontWeight: 'bold', borderRadius: '4px', border: 'none' }}>
                                    <FaCheckCircle style={{ marginRight: '8px' }} /> Confirmar y Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
