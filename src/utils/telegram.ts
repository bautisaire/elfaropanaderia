const BOT_TOKEN = import.meta.env.VITE_BOT_TOKEN;
const CHAT_ID = import.meta.env.VITE_CHAT_ID;

// Comparación case/acento-insensitive para detectar pagos por transferencia.
// Acepta: "transferencia", "Transferencia", "TRANSFERENCIA", "transfer",
// también con tildes raras, espacios, etc.
const isTransferPayment = (metodoPago: any): boolean => {
    if (!metodoPago) return false;
    const normalized = String(metodoPago)
        .trim()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // saca acentos
    return normalized.includes('transfer');
};

const TRANSFER_DATA_BLOCK = `
 *Datos de Transferencia:*
BANCO NACIÓN
ALIAS: \`faro.78\`
A NOMBRE DE: \`MARIA ELISABETH CORONEL\`
_Enviar comprobante_`;

export const generateOrderMessage = (orderData: any) => {
    const { cliente, items, total } = orderData;

    const itemsList = items
        .map((item: any) => `- ${item.quantity}x ${item.name} ($${Math.floor(item.price * item.quantity)})`)
        .join("\n");

    const transferBlock = isTransferPayment(cliente?.metodoPago) ? TRANSFER_DATA_BLOCK : '';

    return `
¡Hola ${cliente.nombre}! Recibimos tu pedido en *El Faro Panadería*.
 *Dirección:* ${cliente.direccion}
 *Indicaciones:* ${cliente.indicaciones || "Ninguna"}

🛒 *Productos:*
${itemsList}
${orderData.shippingCost > 0 ? `\n *Envío:* $${Math.floor(orderData.shippingCost)}` : ''}

💵 *Total:* $${Math.floor(total)}

 ¡Ya lo estamos preparando! 
${transferBlock}

    elfaropanificacion.com
  `.trim();
};

export const generateOrderMessageShort = (orderData: any) => {
    const { cliente, total } = orderData;

    const transferBlock = isTransferPayment(cliente?.metodoPago) ? TRANSFER_DATA_BLOCK : '';

    return `
¡Hola ${cliente.nombre}, pedido recibido!


 Ya lo estamos preparando 
*Total:* $${Math.floor(total)}
${transferBlock}

 elfaropanificacion.com
  `.trim();
};

export const sendTelegramNotification = async (orderData: any) => {
    const adminMessage = `Tienes un nuevo pedido N° ${orderData.id || orderData.orderId || '?'} de *${orderData.cliente?.nombre || ''}*. Visitar https://www.elfaropanificacion.com/editor/orders/deliveries`;



    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    // Obtener lista de IDs (separados por coma en .env)
    const chatIds = CHAT_ID ? CHAT_ID.split(",") : [];

    const sendMessageToAll = async (text: string) => {
        const promises = chatIds.map(async (id: string) => {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: id.trim(),
                        text: text,
                        parse_mode: "Markdown",
                    }),
                });
                if (!response.ok) console.error(`Telegram Error (ID: ${id}):`, await response.text());
            } catch (error) {
                console.error(`Telegram Network Error (ID: ${id}):`, error);
            }
        });

        await Promise.all(promises);
    };

    // Enviar ambos mensajes a todos los destinatarios
    await sendMessageToAll(adminMessage);
};
