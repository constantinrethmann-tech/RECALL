import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span className={`font-display tracking-[0.32em] text-frost ${size === "lg" ? "text-2xl" : "text-[13px]"}`}>
      RECALL<span className="text-ion">.</span>
    </span>
  );
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background,border-color,color,transform] duration-150 active:scale-[.98] disabled:opacity-40 disabled:active:scale-100";
const variants = {
  primary: "bg-ion text-void hover:bg-[#a4c1ff] h-12 px-6 text-[15px]",
  ghost: "border border-seam-2 text-frost hover:border-seam-3 hover:bg-hull-2 h-12 px-5 text-[14px]",
  text: "text-mist hover:text-frost h-10 px-3 text-[13.5px]",
};

type Variant = keyof typeof variants;

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ href, variant = "primary", className = "", children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function IconButton({ label, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-hull-2 hover:text-frost disabled:opacity-30 disabled:hover:bg-transparent ${className}`}
      {...props}
    />
  );
}

export function IconLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link href={href} aria-label={label} title={label} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-hull-2 hover:text-frost">
      {children}
    </Link>
  );
}

export function Splash({ label }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-5">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 rounded-full border border-seam-2" />
          <div className="absolute inset-0 animate-spin rounded-full border border-transparent border-t-ion" />
        </div>
        {label && <p className="eyebrow">{label}</p>}
      </div>
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-down/30 bg-down/[.06] px-4 py-3 text-[14px] text-frost">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-down" />
      <div className="min-w-0 flex-1">{children}</div>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 text-[13px] text-ion hover:underline">
          Retry
        </button>
      )}
    </div>
  );
}

/** Anki's three numbers: new (accent) · learning (amber) · due (green). */
export function Counts({ fresh, learning, due, className = "" }: { fresh: number; learning: number; due: number; className?: string }) {
  const n = (value: number, color: string, title: string) => (
    <span title={title} className={value ? color : "text-seam-3"}>
      {value}
    </span>
  );
  return (
    <span className={`inline-flex gap-2.5 font-mono text-[12px] tabular-nums ${className}`}>
      {n(fresh, "text-ion", "New")}
      {n(learning, "text-flare", "Learning")}
      {n(due, "text-up", "Due")}
    </span>
  );
}
