export const generateOrderMessage = (order: any): string => {
    let message = `¡Hola ${order.cliente?.nombre || ''}! Recibimos tu pedido en El Faro Panadería.\n`;
    
    // Dirección o Retiro
    if (order.tipoEnvio === 'delivery' || order.cliente?.direccion) {
        message += ` Dirección: ${order.cliente?.direccion || 'No especificada'} \n`;
        if (order.cliente?.indicaciones) {
            message += ` Indicaciones: ${order.cliente.indicaciones} \n`;
        }
    } else {
        message += ` Retira en local \n`;
    }
    
    // Productos
    message += `\n🛒 Productos:\n`;
    order.items?.forEach((item: any) => {
        const itemTotal = item.price * (item.quantity || 1);
        message += `- ${item.quantity}x ${item.name}`;
        if (item.variant) message += ` (${item.variant})`;
        message += ` ($${itemTotal})\n`;
    });
    
    // Totales
    message += `\n\n💵 Total: $${order.total}\n\n`;
    message += ` ¡Ya lo estamos preparando! \n\n`;

    if (order.cliente?.metodoPago?.toLowerCase() === 'transferencia' || order.cliente?.metodoPago?.toLowerCase() === 'transferencia bancaria' || order.cliente?.metodoPago?.toLowerCase() === 'transferencia/mp') {
        message += ` Datos de Transferencia:\n`;
        message += `ALIAS: elfaro80.mp\n`;
        message += `CVU: 0000003100006832823516\n`;
        message += `A NOMBRE DE: MARIA ELISABETH CORONEL\n`;
        message += `Enviar comprobante\n\n`;
    }

    message += getRaffleParticipationLine(order);

    message += getWebsiteLine(order);

    return message;
};

interface OrderRaffleParticipation {
    raffleParticipation?: {
        raffleTitle?: string;
        totalChances?: number;
    };
}

// Si el cliente (identificado por su teléfono) ya tiene chances en el sorteo activo
// -sea porque compró un boleto en este pedido, o porque ya había comprado antes-
// se lo recordamos, aunque este pedido puntual no haya sumado un boleto nuevo.
const getRaffleParticipationLine = (order: OrderRaffleParticipation): string => {
    const participation = order.raffleParticipation;
    if (!participation || !participation.totalChances) return '';
    return `🎟️ ¡Ya estás participando del ${participation.raffleTitle || 'sorteo'}! Chances de ganar: ${participation.totalChances}\n\n`;
};

const getWebsiteLine = (order: OrderRaffleParticipation): string => {
    const participation = order.raffleParticipation;
    if (participation && participation.totalChances) {
        return `    🎡 Ver ruleta: elfaropanificacion.com/ruleta \n`;
    }
    return `    elfaropanificacion.com \n`;
};

export const generateOrderMessageShort = (order: any): string => {
    let message = `¡Hola ${order.cliente?.nombre || ''}! Recibimos tu pedido en El Faro Panadería.\n\n`;
    message += `💵 Total: $${order.total}\n\n`;

    if (order.cliente?.metodoPago?.toLowerCase() === 'transferencia' || order.cliente?.metodoPago?.toLowerCase() === 'transferencia bancaria' || order.cliente?.metodoPago?.toLowerCase() === 'transferencia/mp') {
        message += ` Datos de Transferencia:\n`;
        message += `ALIAS: elfaro80.mp\n`;
        message += `CVU: 0000003100006832823516\n`;
        message += `A NOMBRE DE: MARIA ELISABETH CORONEL\n`;
        message += `Enviar comprobante\n\n`;
    }

    message += ` ¡Ya lo estamos preparando! \n\n`;
    message += getRaffleParticipationLine(order);
    message += getWebsiteLine(order);

    return message;
};
