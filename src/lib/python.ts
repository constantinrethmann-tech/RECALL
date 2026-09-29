import type { RunResult } from "./drill";
import { asset } from "./env";

/** One program run: the given lines, then the code, with fake input() answers. */
export interface PythonJob {
  setup: string;
  code: string;
  inputs?: string[];
  /** Variables whose repr() should be returned. */
  names?: string[];
}

export class PythonTimeout extends Error {}

type Handler = (results: RunResult[]) => void;

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let seq = 0;
const handlers = new Map<number, Handler>();

function start(): Promise<void> {
  const w = new Worker(asset("/py-worker.js"), { type: "module" });
  worker = w;
  ready = new Promise<void>((resolve, reject) => {
    w.onmessage = (e: MessageEvent) => {
      const data = e.data as { type: string; id?: number; results?: RunResult[]; error?: string };
      if (data.type === "ready") resolve();
      else if (data.type === "failed") reject(new Error(`Python couldn't start: ${data.error}`));
      else if (data.type === "result" && data.id !== undefined) handlers.get(data.id)?.(data.results ?? []);
    };
    w.onerror = () => reject(new Error("Python couldn't be loaded. Check your internet connection (it's downloaded once)."));
  });
  ready.catch(() => stop());
  return ready;
}

function stop() {
  worker?.terminate();
  worker = null;
  ready = null;
  handlers.clear();
}

/** Starts downloading Python in the background (the first time takes a few seconds). */
export function preloadPython(): Promise<void> {
  return ready ?? start();
}

export const pythonReady = () => ready !== null;

/**
 * Runs the jobs one after another. If they take longer than `timeoutMs` (an endless loop), Python is
 * stopped and restarted, and PythonTimeout is thrown.
 */
export async function runPython(jobs: PythonJob[], timeoutMs = 5000): Promise<RunResult[]> {
  await preloadPython();
  const w = worker!;
  return new Promise<RunResult[]>((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      handlers.delete(id);
      stop();
      reject(new PythonTimeout("Your code ran for more than 5 seconds, so it was stopped. Probably an endless loop."));
    }, timeoutMs);
    handlers.set(id, (results) => {
      clearTimeout(timer);
      handlers.delete(id);
      resolve(results);
    });
    w.postMessage({ id, jobs });
  });
}
