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

interface Handler {
  /** Libraries are loaded and the code starts running (the time limit starts now). */
  started: () => void;
  done: (results: RunResult[]) => void;
}

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
      else if (data.type === "started" && data.id !== undefined) handlers.get(data.id)?.started();
      else if (data.type === "result" && data.id !== undefined) handlers.get(data.id)?.done(data.results ?? []);
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
    const fail = (error: Error) => {
      handlers.delete(id);
      stop();
      reject(error);
    };
    // Downloading a library (pandas) the first time can take a while; after that the normal limit applies.
    let timer = setTimeout(() => fail(new Error("Loading the Python libraries took too long. Check your internet connection.")), 60000);
    handlers.set(id, {
      started: () => {
        clearTimeout(timer);
        timer = setTimeout(
          () => fail(new PythonTimeout("Your code ran for more than 5 seconds, so it was stopped. Probably an endless loop.")),
          timeoutMs,
        );
      },
      done: (results) => {
        clearTimeout(timer);
        handlers.delete(id);
        resolve(results);
      },
    });
    w.postMessage({ id, jobs });
  });
}
