const BOT_TOKEN = import.meta.env.VITE_BOT_TOKEN;
const CHAT_ID = import.meta.env.VITE_CHAT_ID;

export const generateOrderMessage = (orderData: any) => {
    const { cliente, items, total } = orderData;

    const itemsList = items
        .map((item: any) => `- ${item.quantity}x ${item.name} ($${Math.floor(item.price)})`)
        .join("\n");

    // Limpiar número para el link (quitar espacios, guiones, etc)
    // const cleanPhone = cliente.telefono.replace(/\D/g, "");

    return `
¡Hola ${cliente.nombre}! Recibimos tu pedido en *El Faro Panadería*.
 *Dirección:* ${cliente.direccion}
 *Indicaciones:* ${cliente.indicaciones || "Ninguna"}

🛒 *Productos:*
${itemsList}
${orderData.shippingCost > 0 ? `\n *Envío:* $${Math.floor(orderData.shippingCost)}` : ''}

💵 *Total:* $${Math.floor(total)}

 ¡Ya lo estamos preparando! 

${(cliente.metodoPago === 'transferencia' || cliente.metodoPago === 'transfer') ? `
 *Datos de Transferencia:*
ALIAS: \`elfaro80.mp\`
CVU: \`0000003100006832823516\`
A NOMBRE DE: \`MARIA ELISABETH CORONEL\`
_Puedes abonar ahora o esperar al repartidor._` : ''}

https://www.elfaropanificacion.com
  `.trim();
};

export const sendTelegramNotification = async (orderData: any) => {
    const adminMessage = `Tienes un nuevo pedido de *${orderData.cliente.nombre}*. Visitar https://www.elfaropanificacion.com/editor/orders/web`;



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
