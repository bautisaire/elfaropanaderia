// Identificador persistente por navegador/PC (admin), usado para no reimprimir un ticket
// en el mismo dispositivo que ya lo imprimió al confirmar la venta.
export const getDeviceId = (): string => {
    let id = localStorage.getItem('admin_device_id');
    if (!id) {
        id = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        localStorage.setItem('admin_device_id', id);
    }
    return id;
};
