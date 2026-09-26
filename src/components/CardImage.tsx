"use client";

import { useEffect, useState } from "react";
import { Close } from "./icons";

/** A picture on a card. Tap to zoom. The white backdrop only shows behind transparent pictures. */
export function CardImage({ url, onZoom }: { url: string | undefined; onZoom: (url: string) => void }) {
  if (!url) return <div className="mt-6 h-48 animate-pulse rounded-2xl bg-hull-2" />;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onZoom(url);
      }}
      className="mt-6 block w-full cursor-zoom-in"
      aria-label="Zoom picture"
    >
      <img src={url} alt="" className="mx-auto max-h-[42vh] max-w-full rounded-2xl bg-white object-contain lg:max-h-[48vh]" />
    </button>
  );
}

/** Full-screen picture. Tap the picture to switch between "fit" and "zoomed"; Esc or ✕ closes. */
export function ImageZoom({ url, onClose }: { url: string; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-void/95 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal>
      <div className={`h-full w-full ${zoomed ? "overflow-auto" : "grid place-items-center p-4 pt-[max(1rem,env(safe-area-inset-top))]"}`}>
        <img
          src={url}
          alt=""
          onClick={(e) => {
            e.stopPropagation();
            setZoomed((z) => !z);
          }}
          className={
            zoomed
              ? "max-w-none cursor-zoom-out bg-white"
              : "max-h-full max-w-full cursor-zoom-in rounded-xl bg-white object-contain"
          }
          style={zoomed ? { width: "220%" } : undefined}
        />
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="fixed right-3 top-[max(12px,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full border border-seam-2 bg-hull/90 text-frost"
      >
        <Close />
      </button>
    </div>
  );
}
