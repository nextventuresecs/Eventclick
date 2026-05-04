const MAX_LONG_EDGE = 1280;
const TARGET_BYTES = 500 * 1024;
const MIN_QUALITY = 0.5;

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image"));
    };
    img.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      quality,
    );
  });

export const compressImage = async (file: File): Promise<Blob> => {
  const img = await loadImage(file);

  let { width, height } = img;
  if (width > MAX_LONG_EDGE || height > MAX_LONG_EDGE) {
    const scale = MAX_LONG_EDGE / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.85;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }

  return blob;
};
