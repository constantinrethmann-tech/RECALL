import { getSupabase } from "./supabase";

export const IMAGE_BUCKET = "card-images";
const MAX_DIMENSION = 1600;
const QUALITY = 0.85;
const SIGNED_URL_SECONDS = 12 * 60 * 60;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * Shrinks a picture to at most 1600px on its longest side and re-encodes it (WebP, or JPEG where
 * the browser can't write WebP). Small pictures, GIFs and SVGs are kept as they are.
 */
export async function compressImage(blob: Blob): Promise<Blob> {
  if (blob.type === "image/gif" || blob.type === "image/svg+xml") return blob;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob; // Unknown format: upload as-is.
  }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && blob.size < 400_000) {
    bitmap.close();
    return blob;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  let out = await canvasToBlob(canvas, "image/webp");
  const webp = out?.type === "image/webp";
  if (!webp) {
    // JPEG has no transparency: paint white behind the picture first.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  out = await canvasToBlob(canvas, webp ? "image/webp" : "image/jpeg");
  if (!out || (scale === 1 && out.size >= blob.size)) return blob;
  return out;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Uploads a picture into the user's private folder and returns its storage path.
 * The name comes from the picture's content, so importing the same picture twice stores it once.
 */
export async function uploadImage(userId: string, original: Blob): Promise<string> {
  const hash = (await sha256Hex(await original.arrayBuffer())).slice(0, 32);
  const blob = await compressImage(original);
  const ext = EXT[blob.type] ?? "bin";
  const path = `${userId}/${hash}.${ext}`;
  const { error } = await getSupabase()
    .storage.from(IMAGE_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: "31536000" });
  if (error && !/exist|duplicate/i.test(error.message)) throw new Error(`Picture upload failed: ${error.message}`);
  return path;
}

const urlCache = new Map<string, { url: string; expires: number }>();

/** Private pictures are shown through temporary links (valid 12 hours). */
export async function signedImageUrls(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const result = new Map<string, string>();
  const missing: string[] = [];
  for (const p of new Set(paths)) {
    const hit = urlCache.get(p);
    if (hit && hit.expires > now + 60_000) result.set(p, hit.url);
    else missing.push(p);
  }
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const { data, error } = await getSupabase().storage.from(IMAGE_BUCKET).createSignedUrls(chunk, SIGNED_URL_SECONDS);
    if (error) throw new Error(`Couldn't load pictures: ${error.message}`);
    for (const item of data ?? []) {
      if (!item.path || !item.signedUrl) continue;
      urlCache.set(item.path, { url: item.signedUrl, expires: now + SIGNED_URL_SECONDS * 1000 });
      result.set(item.path, item.signedUrl);
    }
  }
  return result;
}
