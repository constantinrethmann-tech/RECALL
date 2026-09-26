import JSZip from "jszip";
import { fetchAll } from "./data";
import { IMAGE_BUCKET } from "./images";
import { getSupabase } from "./supabase";

const README = `RECALL backup
=============
backup.json  everything: settings, subjects, units, cards (text, tags, pictures, review progress),
             every rating you made (review_logs) and your brain dump attempts.
images/      all card pictures. A card's "front_image"/"back_image" ends with the file name used here.
`;

/** Builds a zip with all your data and pictures. */
export async function createBackup(onProgress: (message: string) => void): Promise<Blob> {
  const sb = getSupabase();
  onProgress("Reading your data…");
  const all = (table: string, order: string) =>
    fetchAll<Record<string, unknown>>(table, (from, to) => sb.from(table).select("*").order(order).range(from, to));
  const [settings, subjects, units, cards, reviewLogs, brainDumps] = await Promise.all([
    all("settings", "user_id"),
    all("subjects", "position"),
    all("units", "position"),
    all("cards", "id"),
    all("review_logs", "review"),
    all("brain_dumps", "created_at"),
  ]);

  const zip = new JSZip();
  zip.file("README.txt", README);
  zip.file(
    "backup.json",
    JSON.stringify(
      { format: "recall-backup-v1", exported_at: new Date().toISOString(), settings: settings[0] ?? null, subjects, units, cards, review_logs: reviewLogs, brain_dumps: brainDumps },
      null,
      1,
    ),
  );

  const paths = [...new Set(cards.flatMap((c) => [c.front_image, c.back_image]).filter((p): p is string => typeof p === "string" && !!p))];
  let done = 0;
  const queue = [...paths];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const { data } = await sb.storage.from(IMAGE_BUCKET).download(p);
      if (data) zip.file(`images/${p.split("/").pop()}`, data);
      onProgress(`Downloading pictures ${++done}/${paths.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, worker));

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" }, (meta) => onProgress(`Packing ${Math.round(meta.percent)}%`));
}

/** Saves a file: the share sheet on iPhone ("Save to Files"), a normal download elsewhere. Must run in a tap handler. */
export async function saveFile(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: blob.type || "application/zip" });
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: name });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
