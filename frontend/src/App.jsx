import { useEffect, useRef, useState } from "react";

const API_BASE = "http://192.168.11.80:3001";

function App() {
  const [dsn, setDsn] = useState("");
  const [message, setMessage] = useState("");
  const [queueJobs, setQueueJobs] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("queue");
  const [selectedAction, setSelectedAction] = useState("activate");
  const [historySearch, setHistorySearch] = useState("");
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("orbcommUser");
    return saved ? JSON.parse(saved) : null;
  });
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    inputRef.current?.focus();
    loadQueue();
    loadHistory();

    const interval = setInterval(() => {
      loadQueue();
      loadHistory();
    }, 3000);

    return () => clearInterval(interval);
  }, [user]);

  function normalizeDsn(value) {
    return String(value || "").trim().toUpperCase();
  }

  function looksLikeOrbcommDsn(value) {
    return /^[0-9A-Z]{10,20}$/.test(value);
  }

  function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  async function login() {
    try {
      setMessage("Signing in...");

      const response = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Login failed.");
        return;
      }

      setUser(data.user);
      localStorage.setItem("orbcommUser", JSON.stringify(data.user));
      setLoginUsername("");
      setLoginPassword("");
      setMessage(`Signed in as ${data.user.fullName}`);
    } catch (error) {
      console.error(error);
      setMessage("Could not reach the server.");
    }
  }

  function logout() {
    setUser(null);
    localStorage.removeItem("orbcommUser");
    setMessage("Signed out.");
    setQueueJobs([]);
    setHistoryItems([]);
    setHistorySearch("");
  }

  async function loadQueue() {
    try {
      const response = await fetch(`${API_BASE}/queue`);
      const data = await response.json();

      if (response.ok) {
        setQueueJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Could not load queue:", error);
    }
  }

  async function loadHistory() {
    try {
      const response = await fetch(`${API_BASE}/history`);
      const data = await response.json();

      if (response.ok) {
        setHistoryItems(data.history || []);
      }
    } catch (error) {
      console.error("Could not load history:", error);
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
        job.type === "activate" &&
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

      const response = await fetch(`${API_BASE}/queue/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dsn: cleaned,
          user: user.username
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Queue request failed.");
        inputRef.current?.focus();
        return;
      }

      setMessage(`Queued activation: ${data.job.dsn}`);
      setDsn("");
      inputRef.current?.focus();
      loadQueue();
      setActiveTab("queue");
    } catch (error) {
      console.error(error);
      setMessage("Could not reach the server.");
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
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

      const response = await fetch(`${API_BASE}/queue/deactivate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dsn: cleaned,
          user: user.username
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Deactivation queue request failed.");
        inputRef.current?.focus();
        return;
      }

      setMessage(`Queued deactivation: ${data.job.dsn}`);
      setDsn("");
      inputRef.current?.focus();
      loadQueue();
      setActiveTab("queue");
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

    if (selectedAction === "deactivate") {
      queueDeactivation();
    } else {
      queueActivation();
    }
  }
}

  function statusLabel(status) {
    if (status === "queued") return "Queued";
    if (status === "running") return "Running";
    if (status === "done") return "Done";
    if (status === "failed") return "Failed";
    return status;
  }

  function statusColor(status) {
    if (status === "done") return "#1f7a1f";
    if (status === "failed") return "#b00020";
    if (status === "running") return "#8a6d00";
    return "#333";
  }

  function typeLabel(type) {
    if (type === "activate") return "Activate";
    if (type === "deactivate") return "Deactivate";
    return type;
  }

  const recentHistory = historyItems.slice().reverse().slice(0, 200);

  const filteredHistory = recentHistory.filter((item) => {
    const search = historySearch.trim().toUpperCase();
    if (!search) return true;

    return (
      String(item.dsn || "").toUpperCase().includes(search) ||
      String(item.user || "").toUpperCase().includes(search) ||
      String(item.type || "").toUpperCase().includes(search) ||
      String(item.status || "").toUpperCase().includes(search)
    );
  });

  if (!user) {
    return (
      <div style={{ padding: 24, fontFamily: "Arial", maxWidth: 420, margin: "40px auto" }}>
        <h1 style={{ fontSize: 30, marginBottom: 16 }}>ORBCOMM Sign In</h1>

        <input
          placeholder="Username"
          value={loginUsername}
          onChange={(e) => setLoginUsername(e.target.value)}
          style={{
            fontSize: 18,
            padding: 12,
            width: "100%",
            boxSizing: "border-box",
            marginBottom: 12
          }}
        />

        <input
          placeholder="Password"
          type="password"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          style={{
            fontSize: 18,
            padding: 12,
            width: "100%",
            boxSizing: "border-box",
            marginBottom: 12
          }}
        />

        <button
          onClick={login}
          style={{ fontSize: 18, padding: "12px 18px", width: "100%" }}
        >
          Sign In
        </button>

        {message ? <p style={{ marginTop: 16 }}>{message}</p> : null}
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "Arial", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ fontSize: 34, margin: 0 }}>ORBCOMM Queue</h1>
        <button onClick={logout} style={{ padding: "10px 14px" }}>
          Sign Out
        </button>
      </div>

      <p style={{ marginBottom: 6 }}>
        Signed in as <strong>{user.fullName}</strong> ({user.username})
      </p>

      <p style={{ marginBottom: 16 }}>
        Tap the box below, then scan terminals with the Netum scanner.
      </p>

<p style={{ marginBottom: 8 }}>
  Current action: <strong>{selectedAction === "activate" ? "Activate" : "Deactivate"}</strong>
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
    onClick={() => setSelectedAction("activate")}
    style={{
      fontSize: 18,
      padding: "14px 20px",
      background: selectedAction === "activate" ? "#1f7a1f" : "#f3f3f3",
      color: selectedAction === "activate" ? "#fff" : "#111",
      border: "1px solid #ccc",
      borderRadius: 8
    }}
  >
    Activate Mode
  </button>

  <button
    onClick={() => setSelectedAction("deactivate")}
    style={{
      fontSize: 18,
      padding: "14px 20px",
      background: selectedAction === "deactivate" ? "#b00020" : "#f3f3f3",
      color: selectedAction === "deactivate" ? "#fff" : "#111",
      border: "1px solid #ccc",
      borderRadius: 8
    }}
  >
    Deactivate Mode
  </button>

  <button
    onClick={() => {
      if (selectedAction === "activate") {
        queueActivation();
      } else {
        queueDeactivation();
      }
    }}
    disabled={submitting}
    style={{
      fontSize: 18,
      padding: "14px 20px"
    }}
  >
    {submitting ? "Queueing..." : "Queue Job"}
  </button>
</div>

{message ? <p>{message}</p> : null}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20, marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab("queue")}
          style={{
            fontSize: 16,
            padding: "12px 16px",
            background: activeTab === "queue" ? "#111" : "#f3f3f3",
            color: activeTab === "queue" ? "#fff" : "#111",
            border: "1px solid #ccc",
            borderRadius: 8
          }}
        >
          Queue
        </button>

        <button
          onClick={() => setActiveTab("history")}
          style={{
            fontSize: 16,
            padding: "12px 16px",
            background: activeTab === "history" ? "#111" : "#f3f3f3",
            color: activeTab === "history" ? "#fff" : "#111",
            border: "1px solid #ccc",
            borderRadius: 8
          }}
        >
          History
        </button>
      </div>

      {activeTab === "queue" ? (
        <div style={{ marginTop: 8 }}>
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
                    <div><strong>User:</strong> {job.user}</div>
                    <div><strong>Type:</strong> {typeLabel(job.type)}</div>
                    <div>
                      <strong>Status:</strong>{" "}
                      <span style={{ color: statusColor(job.status) }}>
                        {statusLabel(job.status)}
                      </span>
                    </div>
                    <div><strong>Job ID:</strong> {job.id}</div>
                    {job.error ? <div><strong>Error:</strong> {job.error}</div> : null}
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              gap: 12,
              flexWrap: "wrap"
            }}
          >
            <h2 style={{ fontSize: 24, margin: 0 }}>Recent Actions</h2>

            <a
              href={`${API_BASE}/history/export`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                padding: "10px 14px",
                background: "#f3f3f3",
                border: "1px solid #ccc",
                borderRadius: 8,
                textDecoration: "none",
                color: "#111",
                fontSize: 16
              }}
            >
              Download History CSV
            </a>
          </div>

          <input
            placeholder="Search by DSN, user, type, or status"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            style={{
              fontSize: 16,
              padding: 12,
              width: "100%",
              boxSizing: "border-box",
              marginBottom: 12
            }}
          />

          {filteredHistory.length === 0 ? (
            <p>No matching history found.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filteredHistory.map((item) => (
                <div
                  key={`${item.id}-${item.finishedAt || item.createdAt}`}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    padding: 12,
                    background: "#fafafa"
                  }}
                >
                  <div><strong>DSN:</strong> {item.dsn}</div>
                  <div><strong>User:</strong> {item.user || "—"}</div>
                  <div><strong>Type:</strong> {typeLabel(item.type)}</div>
                  <div>
                    <strong>Status:</strong>{" "}
                    <span style={{ color: statusColor(item.status) }}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <div><strong>Created:</strong> {formatDateTime(item.createdAt)}</div>
                  <div><strong>Finished:</strong> {formatDateTime(item.finishedAt)}</div>
                  {item.error ? (
                    <div style={{ color: "#b00020" }}>
                      <strong>Error:</strong> {item.error}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, color: "#555" }}>
        <p><strong>Scanner workflow:</strong></p>
        <p>1. Tap in the DSN box</p>
        <p>2. Scan the ORBCOMM barcode</p>
        <p>3. Press Enter or tap a queue button</p>
      </div>
    </div>
  );
}

export default App;