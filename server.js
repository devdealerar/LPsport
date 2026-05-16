// LP Sport — backend API (Node.js + Express + JSON file store)
// Single-file server. Serves the frontend HTML and exposes /api/* endpoints.
//
// Required env vars:
//   APP_PASSWORD   — your login password
//   JWT_SECRET     — random string for signing session cookies
//   PORT           — port to listen on (default 3000)
//   DATA_DIR       — where to put the data file (default ./data)

import express from "express";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3000", 10);
const PASSWORD = process.env.APP_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

if (!PASSWORD || !JWT_SECRET) {
  console.error("FATAL: APP_PASSWORD and JWT_SECRET environment variables are required.");
  console.error("Example: APP_PASSWORD=miclave JWT_SECRET=$(openssl rand -hex 32) node server.js");
  process.exit(1);
}

// ── JSON file store ──────────────────────────────────────────────
// Simple but durable: write to .tmp then atomic rename. Debounced.
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const dbPath = path.join(DATA_DIR, "lpsport-data.json");
let store = {};
try {
  if (fs.existsSync(dbPath)) store = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
} catch (e) {
  console.error("[lp-sport] Failed to read data file, starting empty:", e.message);
  store = {};
}
console.log(`[lp-sport] Data file: ${dbPath} (${Object.keys(store).length} keys)`);

let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const tmp = dbPath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(store));
      fs.renameSync(tmp, dbPath);  // atomic on POSIX
    } catch (e) {
      console.error("[lp-sport] Failed to persist data:", e.message);
    }
  }, 50);
}

// ── App ──────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "60mb" }));
app.use(cookieParser());

function requireAuth(req, res, next) {
  const token = req.cookies?.lpsport_session;
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try { jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Sesión expirada" }); }
}

// ── Auth routes ──────────────────────────────────────────────────
app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || password !== PASSWORD) {
    return setTimeout(() => res.status(401).json({ error: "Contraseña incorrecta" }), 400);
  }
  const token = jwt.sign({ user: "lp-sport" }, JWT_SECRET, { expiresIn: "30d" });
  res.cookie("lpsport_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.protocol === "https" || req.headers["x-forwarded-proto"] === "https",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("lpsport_session");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const token = req.cookies?.lpsport_session;
  if (!token) return res.status(401).json({ authenticated: false });
  try { jwt.verify(token, JWT_SECRET); res.json({ authenticated: true }); }
  catch { res.status(401).json({ authenticated: false }); }
});

// ── KV data API ──────────────────────────────────────────────────
app.get("/api/data/:key", requireAuth, (req, res) => {
  res.json({ key: req.params.key, value: store[req.params.key] ?? null });
});

app.post("/api/data/:key", requireAuth, (req, res) => {
  const { value } = req.body || {};
  if (typeof value !== "string") return res.status(400).json({ error: "value must be a string" });
  store[req.params.key] = value;
  persist();
  res.json({ ok: true });
});

app.delete("/api/data/:key", requireAuth, (req, res) => {
  delete store[req.params.key];
  persist();
  res.json({ ok: true });
});

app.get("/api/list", requireAuth, (req, res) => {
  const prefix = req.query.prefix || "";
  res.json({ keys: Object.keys(store).filter(k => k.startsWith(prefix)) });
});

// Full snapshot for server-side backups
app.get("/api/snapshot", requireAuth, (_req, res) => {
  res.json({ snapshot: store, exportedAt: new Date().toISOString() });
});

// Health probe (no auth)
app.get("/api/health", (_req, res) => res.json({ ok: true, time: Date.now() }));

// ── Static frontend ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1h",
  setHeaders: (res, filePath) => { if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); }
}));

// SPA fallback
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`[lp-sport] Listening on http://localhost:${PORT}`));

// Save on graceful exit
const flushAndExit = () => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    const tmp = dbPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, dbPath);
    console.log("[lp-sport] Data flushed on exit");
  } catch {}
  process.exit(0);
};
process.on("SIGINT", flushAndExit);
process.on("SIGTERM", flushAndExit);
