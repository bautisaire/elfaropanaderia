export const printTicket = (order: any) => {
    // Generate date
    let orderTime = new Date();
    if (order.date && typeof order.date.toMillis === 'function') {
        orderTime = new Date(order.date.toMillis());
    } else if (order.date && order.date.seconds) {
        orderTime = new Date(order.date.seconds * 1000);
    } else if (typeof order.date === "string" || typeof order.date === "number") {
        orderTime = new Date(order.date);
    }
    const dateStr = orderTime.toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const orderId = order.id ? (typeof order.id === 'string' ? order.id.slice(-6).toUpperCase() : order.id) : 'N/A';
    const clientName = order.cliente?.nombre || 'Consumidor Final';

    const itemsHtml = order.items.map((item: any) => {
        const qty = Number(item.quantity).toFixed(2).replace(/\.?0+$/, "");
        const qtyDisplay = item.unitType === 'weight' ? `${Math.round(item.quantity * 1000)}g` : `${qty}x`;
        const subtotal = Math.ceil(item.price * (item.quantity || 1));
        const name = `${item.name} ${item.variant ? `(${item.variant})` : ''}`;
        return `
        <tr>
            <td class="text-left" style="vertical-align: top;">${qtyDisplay}</td>
            <td class="text-left">${name}</td>
            <td class="text-right" style="vertical-align: top;">$${subtotal}</td>
        </tr>
        `;
    }).join('');

    const total = Math.ceil(order.total);

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Ticket ${orderId}</title>
        <style>
            * { box-sizing: border-box; }
            @page {
                size: 58mm auto;
                margin: 0;
            }
            body {
                font-family: 'Courier New', Courier, monospace;
                width: 44mm; /* Reducido para que no se corte a la derecha */
                max-width: 100%;
                margin: 0 0 0 2mm; /* Un poco de margen izquierdo para centrar */
                padding: 0;
                font-size: 11px; 
                font-weight: bold; 
                color: #000;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; padding-right: 2mm; } /* Aleja los textos derechos del borde */
            .text-left { text-align: left; }
            .bold { font-weight: bold; }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-top: 5px; 
                margin-bottom: 5px; 
                table-layout: fixed; /* Fuerza los anchos exactos */
            }
            th, td { 
                padding: 2px 0; 
                font-size: 10px; 
                word-wrap: break-word; 
            }
            th:nth-child(1), td:nth-child(1) { width: 15%; } /* Cantidad */
            th:nth-child(2), td:nth-child(2) { width: 60%; padding-right: 2px; } /* Descripción */
            th:nth-child(3), td:nth-child(3) { width: 25%; text-align: right; } /* Subtotal */
            th { border-bottom: 1px dashed #000; }
            .divider { border-top: 1px dashed #000; margin: 5px 0; }
        </style>
    </head>
    <body>
        <div class="text-center bold" style="font-size: 14px;">EL FARO PANADERIA</div>
        <div class="divider"></div>
        <div>Fecha: ${dateStr}</div>
        <div>Cliente: ${clientName}</div>
        <div>Pedido #: ${orderId}</div>
        <div class="divider"></div>
        <table>
            <tr>
                <th class="text-left">Cant</th>
                <th class="text-center">Desc</th>
                <th class="text-right">SubT</th>
            </tr>
            ${itemsHtml}
        </table>
        <div class="divider"></div>
        <div class="text-right bold" style="font-size: 14px;">TOTAL: $${total}</div>
        <div class="divider"></div>
        <div class="text-center bold" style="font-size: 14px;">¡GRACIAS POR SU COMPRA!</div>
    </body>
    </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '58mm';
    iframe.style.height = '100vh';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        iframe.onload = () => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            // Aumentamos el timeout a 10 segundos para dar tiempo a la cola de impresión
            setTimeout(() => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            }, 10000);
        };
    }
};
