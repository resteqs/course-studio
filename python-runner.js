"use strict";
// Loaded by python-runner.html inside an opaque-origin sandbox frame. Kept external
// so the frame CSP needs no 'unsafe-inline'.
function pythonWorker() {
  const base = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
  self.onmessage = async ({data}) => {
    try {
      importScripts(base + "pyodide.js");
      const python = await loadPyodide({ indexURL: base });
      await python.loadPackage("numpy");
      const stdout = [], stderr = [];
      python.setStdout({ batched: (line) => { if (stdout.length < 200) stdout.push(line.slice(0, 1024)); } });
      python.setStderr({ batched: (line) => { if (stderr.length < 200) stderr.push(line.slice(0, 1024)); } });
      self.postMessage({ ready: true });
      const results = [];
      const detail = (error) => String(error).trim().split("\n").at(-1);
      try {
        await python.runPythonAsync(data.code, { filename: "solution.py" });
        for (const check of data.checks) {
          try {
            await python.runPythonAsync(check.code);
            results.push({ name: check.name, passed: true });
          } catch (error) {
            results.push({ name: check.name, passed: false, detail: detail(error) });
            stderr.push(String(error).slice(0, 4096));
            break;
          }
        }
      } catch (error) {
        results.push({ name: "Loads without errors", passed: false, detail: detail(error) });
        stderr.push(String(error).slice(0, 4096));
      }
      self.postMessage({ passed: results.length === data.checks.length && results.every((r) => r.passed),
        checks: results, stdout: stdout.join("\n"), stderr: stderr.join("\n") });
    } catch {
      self.postMessage({ error: "Could not start browser Python. Check your connection or open Local Studio." });
    }
  };
}

if (self !== parent && self.origin === "null") {
  addEventListener("message", (event) => {
    if (event.source !== parent || !event.ports.length) return;
    const port = event.ports[0];
    const script = "(" + pythonWorker.toString() + ")()";
    const url = URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
    const runner = new Worker(url);
    URL.revokeObjectURL(url);
    runner.onmessage = (message) => port.postMessage(message.data);
    runner.onerror = (error) => {
      error.preventDefault();
      port.postMessage({ error: "Browser Python could not start." });
    };
    runner.postMessage(event.data);
  }, { once: true });
}
