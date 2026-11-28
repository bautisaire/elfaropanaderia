import { useEffect, useState } from 'react';
import { FaWhatsapp, FaTimes, FaPlus, FaTrash, FaUndo } from 'react-icons/fa';
import {
    DEFAULT_TEMPLATES, PLACEHOLDERS, SEGMENTS, fillTemplate, saveTemplates, whatsappLink,
    type MessageTemplate, type Segment,
} from '../utils/marketing';

export interface MessageData { nombre: string; producto: string; dias: number; pedidos: number }

/** Tarjeta de la ficha: elegir plantilla, retocar el texto y abrir WhatsApp. */
export function SendMessageCard({ phone, data, templates, suggested, lastMessage, onSent }: {
    phone: string;
    data: MessageData;
    templates: MessageTemplate[];
    suggested: Segment;
    lastMessage?: { title?: string; atMs?: number };
    onSent: (t: MessageTemplate) => void;
}) {
    const pick = templates.find(t => t.segment === suggested) || templates[0];
    const [templateId, setTemplateId] = useState(pick?.id || '');
    const template = templates.find(t => t.id === templateId) || pick;
    const [text, setText] = useState(() => (template ? fillTemplate(template.text, data) : ''));

    // Al cambiar de plantilla (o de cliente) se vuelve a armar el texto
    useEffect(() => {
        if (template) setText(fillTemplate(template.text, data));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateId, phone]);

    if (!template) return null;
    const days = lastMessage?.atMs ? Math.floor((Date.now() - lastMessage.atMs) / 86_400_000) : null;

    return (
        <div className="cm-card cm-msg-card">
            <h4><FaWhatsapp /> Enviar mensaje</h4>
            <div className="cm-msg-chips">
                {templates.map(t => (
                    <button key={t.id} className={t.id === template.id ? 'active' : ''} onClick={() => setTemplateId(t.id)}>
                        {t.emoji} {t.title}{t.segment === suggested && suggested !== 'none' ? ' · sugerido' : ''}
                    </button>
                ))}
            </div>
            <textarea rows={5} value={text} onChange={e => setText(e.target.value)} />
            <div className="cm-msg-foot">
                <small>
                    {days === null ? 'Todavía no le mandaste mensajes desde acá.'
                        : `Último mensaje: ${lastMessage?.title || ''} · ${days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`}`}
                </small>
                <a className="cm-msg-send" href={whatsappLink(phone, text)} target="_blank" rel="noreferrer" onClick={() => onSent(template)}>
                    <FaWhatsapp /> Enviar por WhatsApp
                </a>
            </div>
        </div>
    );
}

/** Editor de plantillas (Clientes → Mensajes). */
export function TemplatesEditor({ templates, onClose }: { templates: MessageTemplate[]; onClose: () => void }) {
    const [list, setList] = useState<MessageTemplate[]>(() => templates.map(t => ({ ...t })));
    const [saving, setSaving] = useState(false);

    const update = (id: string, patch: Partial<MessageTemplate>) => setList(l => l.map(t => (t.id === id ? { ...t, ...patch } : t)));
    const add = () => setList(l => [...l, { id: `custom-${Date.now()}`, title: 'Nuevo mensaje', emoji: '💬', segment: 'none', text: '¡Hola {nombre}! ' }]);
    const remove = (id: string) => setList(l => l.filter(t => t.id !== id));
    const restore = () => {
        if (window.confirm('¿Volver a los 3 mensajes de fábrica? Se pierden los cambios y los mensajes que agregaste.')) setList(DEFAULT_TEMPLATES.map(t => ({ ...t })));
    };
    const save = async () => {
        if (list.some(t => !t.title.trim() || !t.text.trim())) { alert('Cada mensaje necesita título y texto.'); return; }
        setSaving(true);
        try {
            await saveTemplates(list.map(t => ({ ...t, title: t.title.trim(), text: t.text.trim() })));
            onClose();
        } catch (e) {
            console.error(e);
            alert('No se pudieron guardar los mensajes.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="cm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="cm-detail cm-tpl-modal">
                <div className="cm-hero cm-hero-green">
                    <div className="cm-hero-info">
                        <h3>💬 Mensajes para clientes</h3>
                        <div className="cm-hero-meta">Plantillas que se completan solas con los datos de cada cliente.</div>
                    </div>
                    <button className="cm-close" onClick={onClose} aria-label="Cerrar"><FaTimes /></button>
                </div>

                <div className="cm-tpl-body">
                    <div className="cm-tpl-help">
                        <strong>Datos que se completan solos:</strong>
                        {PLACEHOLDERS.map(p => <span key={p.key}><code>{p.key}</code> {p.help}</span>)}
                    </div>

                    {list.map(t => (
                        <div key={t.id} className="cm-card cm-tpl">
                            <div className="cm-tpl-row">
                                <input className="cm-tpl-emoji" value={t.emoji} maxLength={4} onChange={e => update(t.id, { emoji: e.target.value })} aria-label="Emoji" />
                                <input className="cm-tpl-title" value={t.title} onChange={e => update(t.id, { title: e.target.value })} placeholder="Título" />
                                <select value={t.segment} onChange={e => update(t.id, { segment: e.target.value as Segment })} title="Se sugiere para">
                                    <option value="none">Sin sugerir</option>
                                    {SEGMENTS.map(s => <option key={s.key} value={s.key}>Sugerir a: {s.emoji} {s.label}</option>)}
                                </select>
                                <button className="cm-tpl-del" onClick={() => remove(t.id)} title="Eliminar" aria-label="Eliminar"><FaTrash /></button>
                            </div>
                            <textarea rows={4} value={t.text} onChange={e => update(t.id, { text: e.target.value })} />
                            <small className="cm-muted">
                                Vista previa: {fillTemplate(t.text, { nombre: 'Laura', producto: 'Medialunas', dias: 45, pedidos: 8 })}
                            </small>
                        </div>
                    ))}

                    <div className="cm-tpl-actions">
                        <button onClick={add}><FaPlus /> Agregar mensaje</button>
                        <button onClick={restore}><FaUndo /> Volver a los de fábrica</button>
                    </div>
                </div>

                <div className="cm-modal-foot cm-tpl-foot">
                    <button onClick={onClose}>Cancelar</button>
                    <button className="primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar mensajes'}</button>
                </div>
            </div>
        </div>
    );
}
