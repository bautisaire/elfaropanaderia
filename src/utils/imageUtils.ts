import type { Area } from "react-easy-crop";

export const compressImage = (file: File, maxWidth: number = 800, quality: number = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const MAX_WIDTH = maxWidth;
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
                    quality // Calidad de compresión (0.0 - 1.0)
                );
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener("load", () => resolve(image));
        image.addEventListener("error", (error) => reject(error));
        image.setAttribute("crossOrigin", "anonymous");
        image.src = url;
    });

export async function getCroppedImageBlob(
    imageSrc: string,
    pixelCrop: Area,
    maxWidth: number = 800,
    quality: number = 0.85
): Promise<Blob> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
        throw new Error("No se pudo obtener el contexto del canvas");
    }

    const scale = pixelCrop.width > maxWidth ? maxWidth / pixelCrop.width : 1;
    canvas.width = Math.round(pixelCrop.width * scale);
    canvas.height = Math.round(pixelCrop.height * scale);

    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        canvas.width,
        canvas.height
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Error al recortar la imagen"));
            },
            "image/webp",
            quality
        );
    });
};

export async function getCroppedImagePreviewUrl(
    imageSrc: string,
    pixelCrop: Area,
    maxWidth: number = 400
): Promise<string> {
    const blob = await getCroppedImageBlob(imageSrc, pixelCrop, maxWidth, 0.75);
    return URL.createObjectURL(blob);
}
