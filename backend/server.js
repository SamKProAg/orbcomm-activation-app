const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { activateOrbcommDevice, deactivateOrbcommDevice } = require("./orbcommAutomation");

const app = express();

app.use(cors());
app.use(express.json());

const HISTORY_FILE = path.join(__dirname, "history.json");

const activationQueue = [];
let isProcessingQueue = false;
let nextJobId = 1;
const COMPLETED_JOB_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

app.post("/queue/activate", (req, res) => {
  const { dsn } = req.body;

  if (!dsn) {
    return res.status(400).json({
      success: false,
      message: "DSN is required"
    });
  }

  const normalizedDsn = String(dsn).trim().toUpperCase();

  const existingJob = activationQueue.find(
    (job) =>
      job.dsn === normalizedDsn &&
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
    type: "activate",
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null
  };

  activationQueue.push(job);
  processQueue().catch((err) => console.error("Queue processor error:", err));

  res.json({
    success: true,
    message: "Activation queued",
    job
  });
});

app.post("/queue/deactivate", (req, res) => {
  const { dsn } = req.body;

  if (!dsn) {
    return res.status(400).json({
      success: false,
      message: "DSN is required"
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
    type: "deactivate",
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null
  };

  activationQueue.push(job);
  processQueue().catch((err) => console.error("Queue processor error:", err));

  res.json({
    success: true,
    message: "Deactivation queued",
    job
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
    type: job.type,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error
  });

  saveHistory(history);
}

async function processQueue() {
  if (isProcessingQueue) return;

  isProcessingQueue = true;

  try {
    while (true) {
      const nextJob = activationQueue.find((job) => job.status === "queued");
      if (!nextJob) break;

      nextJob.status = "running";
      nextJob.startedAt = new Date().toISOString();

      console.log(`Processing activation job ${nextJob.id} for ${nextJob.dsn}`);

      try {
        if (nextJob.type === "activate") {
  await activateOrbcommDevice(nextJob.dsn);
} else if (nextJob.type === "deactivate") {
  await deactivateOrbcommDevice(nextJob.dsn);
} else {
  throw new Error(`Unsupported job type: ${nextJob.type}`);
}

        nextJob.status = "done";
        nextJob.finishedAt = new Date().toISOString();

        appendHistory(nextJob);

        console.log(`Activation job ${nextJob.id} completed`);
        cleanupOldJobs();
      } catch (error) {
        console.error(`Activation job ${nextJob.id} failed:`, error);

        nextJob.status = "failed";
        nextJob.finishedAt = new Date().toISOString();
        nextJob.error = error.message || "Unknown error";

        appendHistory(nextJob);

        cleanupOldJobs();
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

console.log("QUEUE VERSION OF SERVER.JS LOADED");

app.listen(3001, "0.0.0.0", () => {
  console.log("Server running on port 3001");
});