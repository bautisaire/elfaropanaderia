import { useCallback, useEffect, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { FaCheck, FaTimes } from "react-icons/fa";
import { getCroppedImageBlob, getCroppedImagePreviewUrl } from "../utils/imageUtils";
import "./ProductCard.css";
import "./ProductImageEditor.css";

const CARD_ASPECT = 4 / 3;

interface ProductImageEditorProps {
  imageFile: File;
  productName: string;
  productPrice: number;
  productDiscount?: number;
  stockQuantity?: number;
  onConfirm: (blob: Blob) => void | Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
  queueLabel?: string;
  maxWidth?: number;
  quality?: number;
}

export default function ProductImageEditor({
  imageFile,
  productName,
  productPrice,
  productDiscount = 0,
  stockQuantity = 0,
  onConfirm,
  onCancel,
  isSaving = false,
  queueLabel,
  maxWidth = 800,
  quality = 0.85,
}: ProductImageEditorProps) {
  const [imageSrc, setImageSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!imageSrc || !croppedAreaPixels) return;

    let cancelled = false;

    const updatePreview = async () => {
      try {
        const nextUrl = await getCroppedImagePreviewUrl(imageSrc, croppedAreaPixels, 480);
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      } catch (error) {
        console.error("Error generating preview:", error);
      }
    };

    updatePreview();

    return () => {
      cancelled = true;
    };
  }, [imageSrc, croppedAreaPixels]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels || isSaving || isProcessing) return;

    setIsProcessing(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, maxWidth, quality);
      await onConfirm(blob);
    } catch (error) {
      console.error("Error cropping image:", error);
      alert("No se pudo procesar la imagen.");
    } finally {
      setIsProcessing(false);
    }
  };

  const hasDiscount = productDiscount > 0;
  const finalPrice = hasDiscount
    ? productPrice * (1 - productDiscount / 100)
    : productPrice;

  return (
    <div className="pie-overlay" onClick={onCancel}>
      <div className="pie-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pie-header">
          <div>
            <h3>Editor de imagen</h3>
            <p>Recortá y ajustá la foto. La vista previa muestra cómo se verá en la tienda.</p>
            {queueLabel && <span className="pie-queue-label">{queueLabel}</span>}
          </div>
          <button type="button" className="pie-close" onClick={onCancel} disabled={isSaving || isProcessing}>
            <FaTimes />
          </button>
        </div>

        <div className="pie-content">
          <div className="pie-editor-panel">
            <div className="pie-crop-container">
              {imageSrc && (
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={CARD_ASPECT}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              )}
            </div>

            <div className="pie-controls">
              <label htmlFor="pie-zoom">Zoom</label>
              <input
                id="pie-zoom"
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                disabled={isSaving || isProcessing}
              />
            </div>
          </div>

          <div className="pie-preview-panel">
            <h4>Vista previa ProductCard</h4>
            <div className="pie-preview-frame">
              <div className="product-card pie-product-card-preview">
                <div className="image-wrapper">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={productName || "Vista previa"}
                      className="product-image"
                    />
                  ) : (
                    <div className="pie-preview-placeholder">Ajustando vista previa...</div>
                  )}

                  {hasDiscount && (
                    <div className="discount-badge">
                      -{productDiscount}% OFF
                    </div>
                  )}
                </div>

                <div className="card-body">
                  <h3 className="product-title">{productName || "Nombre del producto"}</h3>
                  <div className="card-footer">
                    <div className="price-container">
                      {hasDiscount && (
                        <span className="original-price">${Math.floor(productPrice)}</span>
                      )}
                      <span className={`product-price ${hasDiscount ? "discounted" : ""}`}>
                        ${Math.floor(finalPrice)}
                      </span>
                      <span className="stock-display">Stock: {stockQuantity}</span>
                    </div>
                    <button type="button" className="btn-add" disabled>
                      Agregar
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <p className="pie-preview-note">Proporción 4:3, igual que en el catálogo.</p>
          </div>
        </div>

        <div className="pie-actions">
          <button type="button" className="pie-btn-cancel" onClick={onCancel} disabled={isSaving || isProcessing}>
            Cancelar
          </button>
          <button
            type="button"
            className="pie-btn-confirm"
            onClick={handleConfirm}
            disabled={!croppedAreaPixels || isSaving || isProcessing}
          >
            <FaCheck /> {isSaving || isProcessing ? "Guardando..." : "Usar imagen"}
          </button>
        </div>
      </div>
    </div>
  );
}
