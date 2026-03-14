import { useEffect, useRef, useState } from "react";

function App() {
  const [dsn, setDsn] = useState("");
  const [message, setMessage] = useState("");
  const [queueJobs, setQueueJobs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    loadQueue();

    const interval = setInterval(() => {
      loadQueue();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  function normalizeDsn(value) {
    return String(value || "").trim().toUpperCase();
  }

  function looksLikeOrbcommDsn(value) {
    return /^[0-9A-Z]{10,20}$/.test(value);
  }

  async function loadQueue() {
    try {
      const response = await fetch("http://192.168.11.80:3001/queue");
      const data = await response.json();
      if (response.ok) {
        setQueueJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Could not load queue:", error);
    }
  }
async function queueDeactivation(scannedValue) {
  const cleaned = normalizeDsn(scannedValue ?? dsn);

  if (!cleaned) {
    setMessage("Please scan a DSN first.");
    inputRef.current?.focus();
    return;
  }

  if (!looksLikeOrbcommDsn(cleaned)) {
    setMessage(`That does not look like a valid DSN: ${cleaned}`);
    inputRef.current?.focus();
    return;
  }

  const duplicateJob = queueJobs.find(
    (job) =>
      job.dsn === cleaned &&
      job.type === "deactivate" &&
      (job.status === "queued" || job.status === "running")
  );

  if (duplicateJob) {
    setMessage(`Device already queued for deactivation: ${cleaned}`);
    inputRef.current?.focus();
    return;
  }

  try {
    setSubmitting(true);
    setMessage("Adding deactivation to queue...");

    const response = await fetch("http://192.168.11.80:3001/queue/deactivate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ dsn: cleaned })
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.message || "Deactivation queue request failed.");
      inputRef.current?.focus();
      return;
    }

    setMessage(`Deactivation queued: ${data.job.dsn}`);
    setDsn("");
    inputRef.current?.focus();
    loadQueue();
  } catch (error) {
    console.error(error);
    setMessage("Could not reach the server.");
    inputRef.current?.focus();
  } finally {
    setSubmitting(false);
  }
}
  async function queueActivation(scannedValue) {
    const cleaned = normalizeDsn(scannedValue ?? dsn);

    if (!cleaned) {
      setMessage("Please scan a DSN first.");
      inputRef.current?.focus();
      return;
    }

    if (!looksLikeOrbcommDsn(cleaned)) {
      setMessage(`That does not look like a valid DSN: ${cleaned}`);
      inputRef.current?.focus();
      return;
    }
const duplicateJob = queueJobs.find(
  (job) =>
    job.dsn === cleaned &&
    (job.status === "queued" || job.status === "running")
);

if (duplicateJob) {
  setMessage(`Device already queued: ${cleaned}`);
  inputRef.current?.focus();
  return;
}
    try {
      setSubmitting(true);
      setMessage("Adding activation to queue...");

      const response = await fetch("http://192.168.11.80:3001/queue/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ dsn: cleaned })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Queue request failed.");
        inputRef.current?.focus();
        return;
      }

      setMessage(`Queued: ${data.job.dsn}`);
      setDsn("");
      inputRef.current?.focus();
      loadQueue();
    } catch (error) {
      console.error(error);
      setMessage("Could not reach the server.");
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      queueActivation();
    }
  }

  function statusLabel(status) {
    if (status === "queued") return "Queued";
    if (status === "running") return "Running";
    if (status === "done") return "Done";
    if (status === "failed") return "Failed";
    return status;
  }

  return (
    <div style={{ padding: 24, fontFamily: "Arial", maxWidth: 520, margin: "0 auto" }}>
     <h1 style={{ fontSize: 34, marginBottom: 12 }}>
  ORBCOMM Activation Queue
</h1>

      <p style={{ marginBottom: 16 }}>
        Tap the box below, then scan terminals with the Netum scanner. Jobs will process one at a time.
      </p>

      <input
        ref={inputRef}
        placeholder="Scan or enter DSN"
        value={dsn}
        onChange={(e) => setDsn(e.target.value.toUpperCase())}
        onKeyDown={handleKeyDown}
        autoFocus
        style={{
          fontSize: 20,
          padding: 14,
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 16
        }}
      />

      <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
  <button
    onClick={() => queueActivation()}
    disabled={submitting}
    style={{ fontSize: 18, padding: "14px 20px" }}
  >
    {submitting ? "Queueing..." : "Add to Activation Queue"}
  </button>

  <button
    onClick={() => queueDeactivation()}
    disabled={submitting}
    style={{ fontSize: 18, padding: "14px 20px", background: "#f3f3f3" }}
  >
    {submitting ? "Queueing..." : "Add to Deactivation Queue"}
  </button>
</div>

      {message ? <p>{message}</p> : null}

      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 24, marginBottom: 12 }}>Queue</h2>

        {queueJobs.length === 0 ? (
          <p>No jobs yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {queueJobs
              .slice()
              .reverse()
              .map((job) => (
                <div
                  key={job.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    padding: 12,
                    background: "#fafafa"
                  }}
                >
                  <div><strong>DSN:</strong> {job.dsn}</div>
                  <div><strong>Type:</strong> {job.type}</div>
                  <div><strong>Status:</strong> {statusLabel(job.status)}</div>
                  <div><strong>Job ID:</strong> {job.id}</div>
                  {job.error ? <div><strong>Error:</strong> {job.error}</div> : null}
                </div>
              ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, color: "#555" }}>
        <p><strong>Scanner workflow:</strong></p>
        <p>1. Tap in the DSN box</p>
        <p>2. Scan the ORBCOMM barcode</p>
        <p>3. Press Enter or tap Add to Activation Queue</p>
      </div>
    </div>
  );
}

export default App;