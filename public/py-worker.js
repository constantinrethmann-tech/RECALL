/* RECALL code drills: runs Python (Pyodide) off the main thread, so an endless loop can be stopped.
   A module worker (Pyodide no longer supports classic workers). */
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

const RUNNER = `
import sys, traceback

class _Out:
    def __init__(self):
        self.parts = []
        self.size = 0
    def write(self, s):
        self.size += len(s)
        if self.size > 20000:
            raise RuntimeError("Too much output (more than 20,000 characters). Is a loop printing forever?")
        self.parts.append(s)
        return len(s)
    def flush(self):
        pass

def __recall_run(setup, code, inputs, names):
    out = _Out()
    feed = list(inputs)
    def fake_input(prompt=""):
        # The prompt text isn't compared, only what your program prints.
        if not feed:
            raise EOFError("input() was called more often than there are test inputs")
        return feed.pop(0)
    ns = {"__name__": "__main__", "input": fake_input}
    old = sys.stdout
    sys.stdout = out
    error = None
    try:
        exec(compile(setup, "<given>", "exec"), ns)
        exec(compile(code, "<your code>", "exec"), ns)
    except BaseException as e:
        line = None
        if isinstance(e, SyntaxError) and e.filename == "<your code>":
            line = e.lineno
        else:
            for f in reversed(traceback.extract_tb(e.__traceback__)):
                if f.filename == "<your code>":
                    line = f.lineno
                    break
        msg = e.msg if isinstance(e, SyntaxError) else str(e)
        error = {"type": type(e).__name__, "message": msg, "line": line}
    finally:
        sys.stdout = old
    values = {}
    for n in names:
        values[n] = repr(ns[n]) if n in ns else None
    return {"stdout": "".join(out.parts), "error": error, "values": values}
`;

const ready = loadPyodide({ indexURL: PYODIDE }).then((py) => {
  py.runPython(RUNNER);
  return py;
});
ready.then(
  () => postMessage({ type: "ready" }),
  (e) => postMessage({ type: "failed", error: String(e && e.message ? e.message : e) }),
);

self.onmessage = async (event) => {
  const { id, jobs } = event.data;
  const py = await ready;
  const run = py.globals.get("__recall_run");
  const results = jobs.map((job) => {
    const res = run(job.setup, job.code, py.toPy(job.inputs || []), py.toPy(job.names || []));
    const js = res.toJs({ dict_converter: Object.fromEntries });
    res.destroy();
    return js;
  });
  run.destroy();
  postMessage({ type: "result", id, results });
};
