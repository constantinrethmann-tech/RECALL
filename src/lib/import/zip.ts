import JSZip from "jszip";
import { normalizePath, parseDeck, type ParseResult } from "./deck";

export interface DeckFile {
  result: ParseResult;
  /** Loads a picture from the zip by the path stored on the parsed cards. */
  readImage: (path: string) => Promise<Blob>;
  imageCount: number;
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
};

export function mimeFromPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_TYPES[ext] ?? null;
}

const isJunk = (path: string) => path.startsWith("__MACOSX/") || /(^|\/)\._/.test(path) || /(^|\/)\.DS_Store$/.test(path);

function parseJson(text: string): { value: unknown; error?: string } {
  try {
    return { value: JSON.parse(text.replace(/^﻿/, "")) };
  } catch (e) {
    return { value: null, error: `cards.json is not valid JSON: ${(e as Error).message}` };
  }
}

/** Reads a .zip (cards.json + images/) or a bare cards.json. */
export async function readDeckFile(file: Blob, fileName: string): Promise<DeckFile> {
  if (/\.json$/i.test(fileName)) {
    const { value, error } = parseJson(await file.text());
    const result = error ? { deck: null, errors: [error], warnings: [] } : parseDeck(value);
    return { result, readImage: () => Promise.reject(new Error("No pictures in a .json file")), imageCount: 0 };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { result: { deck: null, errors: ["This file is not a valid .zip."], warnings: [] }, readImage: () => Promise.reject(), imageCount: 0 };
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir && !isJunk(f.name));
  // cards.json may sit at the top of the zip or inside one folder (e.g. when a folder was zipped).
  const cardsEntry = entries
    .filter((f) => /(^|\/)cards\.json$/i.test(f.name))
    .sort((a, b) => a.name.length - b.name.length)[0];
  if (!cardsEntry) {
    return { result: { deck: null, errors: ["No cards.json found in the zip."], warnings: [] }, readImage: () => Promise.reject(), imageCount: 0 };
  }
  const base = cardsEntry.name.slice(0, cardsEntry.name.length - "cards.json".length);

  // Index pictures by their path relative to cards.json (case-insensitive).
  const images = new Map<string, JSZip.JSZipObject>();
  const byLower = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const f of entries) {
    if (!f.name.startsWith(base) || !mimeFromPath(f.name)) continue;
    const rel = f.name.slice(base.length);
    images.set(rel, f);
    byLower.set(rel.toLowerCase(), rel);
    const name = rel.split("/").pop()!.toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), rel]);
  }

  const resolveImage = (path: string): string | null => {
    const p = normalizePath(path).toLowerCase();
    const direct = byLower.get(p) ?? byLower.get(`images/${p}`);
    if (direct) return direct;
    const sameName = byName.get(p.split("/").pop() ?? "");
    return sameName?.length === 1 ? sameName[0] : null;
  };

  const { value, error } = parseJson(await cardsEntry.async("string"));
  const result = error ? { deck: null, errors: [error], warnings: [] } : parseDeck(value, resolveImage);

  const readImage = async (path: string) => {
    const entry = images.get(path);
    if (!entry) throw new Error(`Picture ${path} is missing from the zip`);
    const data = await entry.async("arraybuffer");
    return new Blob([data], { type: mimeFromPath(path) ?? "application/octet-stream" });
  };

  return { result, readImage, imageCount: images.size };
}
