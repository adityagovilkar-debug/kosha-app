"use client";

// Downscales a photo client-side before it ever touches the network —
// mandatory per KOSHA-PLAN.md §2.1/§8: receipts are the only storage-heavy
// item in the shared Supabase project's free tier, so every upload is
// capped around ~1600px / ~250KB.

export async function downscaleImage(file: File, maxDimension = 1600, quality = 0.8): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that image"));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("Couldn't process that image");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
