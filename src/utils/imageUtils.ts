export const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const MAX_WIDTH = 800;
                const scaleSize = MAX_WIDTH / img.width;

                // Si la imagen es más pequeña que el máximo, no redimensionar
                const width = scaleSize < 1 ? MAX_WIDTH : img.width;
                const height = scaleSize < 1 ? img.height * scaleSize : img.height;

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("No se pudo obtener el contexto del canvas"));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error("Error al comprimir la imagen"));
                        }
                    },
                    "image/webp",
                    0.8 // Calidad de compresión (0.0 - 1.0)
                );
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};
