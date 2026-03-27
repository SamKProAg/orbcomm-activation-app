const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const HISTORY_FILE = path.join(__dirname, "history.json");
const USERS_FILE = path.join(__dirname, "users.json");

const activationQueue = [];
let nextJobId = 1;
const COMPLETED_JOB_TTL_MS = 5 * 60 * 1000; // 5 minutes

function requireWorkerAuth(req, res, next) {
  const workerSecret = process.env.WORKER_SECRET;

  if (!workerSecret) {
    return res.status(500).json({
      success: false,
      message: "WORKER_SECRET is not configured on server"
    });
  }

  const providedSecret = req.headers["x-worker-secret"];

  if (providedSecret !== workerSecret) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized worker"
    });
  }

  next();
}

app.get("/", (req, res) => {
  res.send("ORBCOMM Activation Server Running");
});

app.get("/queue", (req, res) => {
  cleanupOldJobs();

  res.json({
    success: true,
    jobs: activationQueue
  });
});

app.get("/history", (req, res) => {
  const history = loadHistory();

  res.json({
    success: true,
    history
  });
});

app.get("/history/export", (req, res) => {
  const history = loadHistory();

  const headers = [
    "id",
    "dsn",
    "user",
    "type",
    "status",
    "createdAt",
    "startedAt",
    "finishedAt",
    "error"
  ];

  const rows = history.map((item) =>
    [
      item.id,
      item.dsn,
      item.user,
      item.type,
      item.status,
      item.createdAt,
      item.startedAt,
      item.finishedAt,
      item.error
    ]
      .map(escapeCsv)
      .join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="orbcomm-history.csv"');
  res.send(csv);
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Username and password are required"
    });
  }

  const normalizedUsername = String(username).trim().toLowerCase();
  const normalizedPassword = String(password).trim();

  const users = loadUsers();

  console.log("USERS_FILE:", USERS_FILE);
  console.log("Loaded usernames:", users.map((u) => u.username));

  const matchedUser = users.find((user) => {
    return (
      String(user.username).trim().toLowerCase() === normalizedUsername &&
      String(user.password).trim() === normalizedPassword
    );
  });

  if (!matchedUser) {
    return res.status(401).json({
      success: false,
      message: "Invalid username or password"
    });
  }

  res.json({
    success: true,
    user: {
      username: matchedUser.username,
      fullName: matchedUser.fullName
    }
  });
});

app.post("/queue/activate", (req, res) => {
  const { dsn, user } = req.body;

  if (!dsn) {
    return res.status(400).json({
      success: false,
      message: "DSN is required"
    });
  }

  if (!user) {
    return res.status(400).json({
      success: false,
      message: "User is required"
    });
  }

  const normalizedDsn = String(dsn).trim().toUpperCase();

  const existingJob = activationQueue.find(
    (job) =>
      job.dsn === normalizedDsn &&
      job.type === "activate" &&
      (job.status === "queued" || job.status === "running")
  );

  if (existingJob) {
    return res.status(409).json({
      success: false,
      message: `Device already queued: ${normalizedDsn}`,
      job: existingJob
    });
  }

  const job = {
    id: nextJobId++,
    dsn: normalizedDsn,
    user,
    type: "activate",
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null
  };

  activationQueue.push(job);

  res.json({
    success: true,
    message: "Activation queued",
    job
  });
});

app.post("/queue/deactivate", (req, res) => {
  const { dsn, user } = req.body;

  if (!dsn) {
    return res.status(400).json({
      success: false,
      message: "DSN is required"
    });
  }

  if (!user) {
    return res.status(400).json({
      success: false,
      message: "User is required"
    });
  }

  const normalizedDsn = String(dsn).trim().toUpperCase();

  const existingJob = activationQueue.find(
    (job) =>
      job.dsn === normalizedDsn &&
      job.type === "deactivate" &&
      (job.status === "queued" || job.status === "running")
  );

  if (existingJob) {
    return res.status(409).json({
      success: false,
      message: `Device already queued for deactivation: ${normalizedDsn}`,
      job: existingJob
    });
  }

  const job = {
    id: nextJobId++,
    dsn: normalizedDsn,
    user,
    type: "deactivate",
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null
  };

  activationQueue.push(job);

  res.json({
    success: true,
    message: "Deactivation queued",
    job
  });
});

app.get("/worker/next-job", requireWorkerAuth, (req, res) => {
  cleanupOldJobs();

  const nextJob = activationQueue.find((job) => job.status === "queued");

  if (!nextJob) {
    return res.json({
      success: true,
      job: null
    });
  }

  nextJob.status = "running";
  nextJob.startedAt = new Date().toISOString();

  console.log(
    `Worker claimed ${nextJob.type} job ${nextJob.id} for ${nextJob.dsn} by ${nextJob.user}`
  );

  res.json({
    success: true,
    job: nextJob
  });
});

app.post("/worker/job-result", requireWorkerAuth, (req, res) => {
  const { jobId, status, error } = req.body;

  const job = activationQueue.find((item) => item.id === jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Job not found"
    });
  }

  if (job.status !== "running") {
    return res.status(409).json({
      success: false,
      message: `Job is not running. Current status: ${job.status}`
    });
  }

  job.finishedAt = new Date().toISOString();

  if (status === "done") {
    job.status = "done";
    job.error = null;
    appendHistory(job);
    cleanupOldJobs();

    console.log(`${job.type} job ${job.id} completed by worker`);

    return res.json({
      success: true,
      message: "Job marked done",
      job
    });
  }

  if (status === "failed") {
    job.status = "failed";
    job.error = error || "Unknown error";
    appendHistory(job);
    cleanupOldJobs();

    console.log(`${job.type} job ${job.id} failed by worker: ${job.error}`);

    return res.json({
      success: true,
      message: "Job marked failed",
      job
    });
  }

  return res.status(400).json({
    success: false,
    message: "Status must be 'done' or 'failed'"
  });
});

function cleanupOldJobs() {
  const now = Date.now();

  for (let i = activationQueue.length - 1; i >= 0; i--) {
    const job = activationQueue[i];

    const isFinished = job.status === "done" || job.status === "failed";
    if (!isFinished || !job.finishedAt) continue;

    const ageMs = now - new Date(job.finishedAt).getTime();
    if (ageMs > COMPLETED_JOB_TTL_MS) {
      activationQueue.splice(i, 1);
    }
  }
}

function loadUsers() {
  const users = [];

  function addUser(prefix) {
    const username = process.env[`${prefix}_USERNAME`];
    const password = process.env[`${prefix}_PASSWORD`];
    const name = process.env[`${prefix}_NAME`];

    if (username && password) {
      users.push({
        username,
        password,
        fullName: name || username
      });
    }
  }

  addUser("ADMIN");

  for (let i = 1; i <= 10; i++) {
    addUser(`TECH${i}`);
  }

  return users;
}

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return [];
    }

    const data = fs.readFileSync(HISTORY_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Could not read history file:", err);
    return [];
  }
}

function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error("Could not write history file:", err);
  }
}

function appendHistory(job) {
  const history = loadHistory();

  history.push({
    id: job.id,
    dsn: job.dsn,
    user: job.user,
    type: job.type,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error
  });

  saveHistory(history);
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

console.log("QUEUE + LOGIN VERSION OF SERVER.JS LOADED");

const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});