const BOT_TOKEN = import.meta.env.VITE_BOT_TOKEN;
const CHAT_ID = import.meta.env.VITE_CHAT_ID;

export const sendTelegramNotification = async (orderData: any) => {
    const { cliente, items, total } = orderData;

    const itemsList = items
        .map((item: any) => `- ${item.quantity}x ${item.name} ($${Math.floor(item.price)})`)
        .join("\n");

    // Limpiar número para el link (quitar espacios, guiones, etc)
    const cleanPhone = cliente.telefono.replace(/\D/g, "");

    // Mensaje 1: Para el comercio (Datos copiables)
    const adminMessage = `
📦 *NUEVO PEDIDO RECIBIDO* 📦

👤 *Cliente:* ${cliente.nombre}
📍 *Dirección:* \`${cliente.direccion}\`
📞 *Teléfono:* [${cliente.telefono}](https://wa.me/549${cleanPhone})
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
    await sendMessageToAll(clientMessage);
};
