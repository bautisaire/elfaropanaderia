const BOT_TOKEN = import.meta.env.VITE_BOT_TOKEN;
const CHAT_ID = import.meta.env.VITE_CHAT_ID;

export const sendTelegramNotification = async (orderData: any) => {
    const { cliente, items, total } = orderData;

    const itemsList = items
        .map((item: any) => `- ${item.quantity}x ${item.name} ($${Math.floor(item.price)})`)
        .join("\n");

    // Mensaje 1: Para el comercio (Datos copiables)
    const adminMessage = `
📦 *NUEVO PEDIDO RECIBIDO* 📦

👤 *Cliente:* ${cliente.nombre}
📍 *Dirección:* \`${cliente.direccion}\`
📞 *Teléfono:* \`${cliente.telefono}\`
💰 *Método de Pago:* ${cliente.metodoPago}
📝 *Indicaciones:* ${cliente.indicaciones || "Ninguna"}

🛒 *Productos:*
${itemsList}

💵 *Total:* $${Math.floor(total)}
  `.trim();

    // Mensaje 2: Plantilla para enviar al cliente
    const clientMessage = `
👋 ¡Hola ${cliente.nombre}! Recibimos tu pedido en *El Faro Panadería*.

📝 *Resumen:*
${itemsList}

💵 *Total:* $${Math.floor(total)}
📍 *Dirección de entrega:* ${cliente.direccion}

🛵 ¡Ya lo estamos preparando! Te avisamos cuando salga.
  `.trim();

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    const sendMessage = async (text: string) => {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: text,
                    parse_mode: "Markdown",
                }),
            });
            if (!response.ok) console.error("Telegram Error:", await response.text());
        } catch (error) {
            console.error("Telegram Network Error:", error);
        }
    };

    // Enviar ambos mensajes
    await sendMessage(adminMessage);
    await sendMessage(clientMessage);
};
