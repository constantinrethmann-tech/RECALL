"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft } from "./icons";
import { IconButton } from "./ui";

/** Header with a back button + a centered column. Used by the secondary screens. */
export function PageShell({ title, action, wide = false, children }: { title: string; action?: ReactNode; wide?: boolean; children: ReactNode }) {
  const router = useRouter();
  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-20 border-b border-seam bg-void/90 backdrop-blur">
        <div className={`mx-auto flex h-14 items-center gap-2 px-2 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>
          <IconButton
            label="Back"
            onClick={() => {
              if (window.history.length > 1) router.back();
              else router.push("/");
            }}
          >
            <ArrowLeft />
          </IconButton>
          <h1 className="min-w-0 flex-1 truncate text-[15px] text-frost">{title}</h1>
          {action}
        </div>
      </header>
      <main className={`pb-safe mx-auto px-5 py-6 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>{children}</main>
    </div>
  );
}
