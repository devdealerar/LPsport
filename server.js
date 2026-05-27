// LP Sport — backend API (Node.js + Express + PostgreSQL)
// Single-file server. Serves the frontend HTML and exposes /api/* endpoints.
//
// Required env vars:
//   DATABASE_URL   — PostgreSQL connection string (postgres://user:pass@host:5432/db)
//   JWT_SECRET     — random string for signing session cookies (32+ chars)
//   PORT           — port to listen on (default 3000)
//
// First-run only (creates initial admin user if no users exist):
//   ADMIN_USERNAME — initial admin username (default: admin)
//   ADMIN_PASSWORD — initial admin password (required on first run)
//
// Optional:
//   DATABASE_SSL   — set to "true" if PostgreSQL requires SSL (e.g. external hosts)

import express from "express";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3000", 10);
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is required.");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is required.");
  process.exit(1);
}

// ── PostgreSQL pool ──────────────────────────────────────────────
const sslConfig = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false;
const pool = new Pool({ connectionString: DATABASE_URL, ssl: sslConfig });

// ── Database init ────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'empleado',
        active        BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS kv_store (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Seed initial admin if no users exist
    const { rowCount } = await client.query("SELECT 1 FROM users LIMIT 1");
    if (rowCount === 0) {
      const adminUsername = process.env.ADMIN_USERNAME || "admin";
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        console.error("FATAL: No users in DB. Set ADMIN_PASSWORD to create the first admin.");
        process.exit(1);
      }
      const hash = await bcrypt.hash(adminPassword, 12);
      await client.query(
        "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
        [adminUsername, hash]
      );
      console.log(`[lp-sport] Admin user created: ${adminUsername}`);
    }

    console.log("[lp-sport] Database ready");
  } finally {
    client.release();
  }
}

// ── App ──────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "60mb" }));
app.use(cookieParser());

// ── Auth middleware ──────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.cookies?.lpsport_session;
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Sesión expirada" });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") return res.status(403).json({ error: "Solo administradores" });
    next();
  });
}

// ── Auth routes ──────────────────────────────────────────────────
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return setTimeout(() => res.status(401).json({ error: "Credenciales inválidas" }), 400);
  }
  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND active = TRUE",
      [username.trim()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return setTimeout(() => res.status(401).json({ error: "Usuario o contraseña incorrectos" }), 400);
    }
    const token = jwt.sign(
      { user: user.username, role: user.role, id: user.id },
      JWT_SECRET,
      { expiresIn: "30d" }
    );
    res.cookie("lpsport_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.protocol === "https" || req.headers["x-forwarded-proto"] === "https",
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    res.json({ ok: true, role: user.role, username: user.username });
  } catch (err) {
    console.error("[lp-sport] Login error:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("lpsport_session");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const token = req.cookies?.lpsport_session;
  if (!token) return res.status(401).json({ authenticated: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true, role: decoded.role, username: decoded.user });
  } catch {
    res.status(401).json({ authenticated: false });
  }
});

// ── KV data API ──────────────────────────────────────────────────
app.get("/api/data/:key", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT value FROM kv_store WHERE key = $1", [req.params.key]);
    res.json({ key: req.params.key, value: rows[0]?.value ?? null });
  } catch (err) {
    console.error("[lp-sport] DB error:", err.message);
    res.status(500).json({ error: "Error de base de datos" });
  }
});

app.post("/api/data/:key", requireAuth, async (req, res) => {
  const { value } = req.body || {};
  if (typeof value !== "string") return res.status(400).json({ error: "value must be a string" });
  try {
    await pool.query(
      `INSERT INTO kv_store (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [req.params.key, value]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[lp-sport] DB error:", err.message);
    res.status(500).json({ error: "Error de base de datos" });
  }
});

app.delete("/api/data/:key", requireAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM kv_store WHERE key = $1", [req.params.key]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error de base de datos" });
  }
});

app.get("/api/list", requireAuth, async (req, res) => {
  const prefix = req.query.prefix || "";
  try {
    const { rows } = await pool.query(
      "SELECT key FROM kv_store WHERE key LIKE $1 ORDER BY key",
      [prefix + "%"]
    );
    res.json({ keys: rows.map(r => r.key) });
  } catch (err) {
    res.status(500).json({ error: "Error de base de datos" });
  }
});

app.get("/api/snapshot", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM kv_store ORDER BY key");
    const snapshot = {};
    rows.forEach(r => { snapshot[r.key] = r.value; });
    res.json({ snapshot, exportedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: "Error de base de datos" });
  }
});

// ── Admin: user management ───────────────────────────────────────
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, username, role, active, created_at FROM users ORDER BY created_at"
  );
  res.json({ users: rows });
});

app.post("/api/admin/users", requireAdmin, async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !["admin", "empleado"].includes(role)) {
    return res.status(400).json({ error: "username, password y role (admin/empleado) requeridos" });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at",
      [username.trim(), hash, role]
    );
    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "El usuario ya existe" });
    console.error("[lp-sport] Create user error:", err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const { password, role, active } = req.body || {};
  const updates = [];
  const values = [];
  let idx = 1;
  if (password) {
    updates.push(`password_hash = $${idx++}`);
    values.push(await bcrypt.hash(password, 12));
  }
  if (role && ["admin", "empleado"].includes(role)) {
    updates.push(`role = $${idx++}`);
    values.push(role);
  }
  if (typeof active === "boolean") {
    updates.push(`active = $${idx++}`);
    values.push(active);
  }
  if (!updates.length) return res.status(400).json({ error: "Nada que actualizar" });
  values.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, username, role, active`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: "No podés eliminar tu propia cuenta" });
  }
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

// Health probe (no auth) — Easypanel / uptime checks
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: true, time: Date.now() });
  } catch (err) {
    console.error("[lp-sport] Health check failed:", err.message);
    res.status(503).json({ ok: false, db: false, time: Date.now() });
  }
});

// ── Static frontend ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1h",
  setHeaders: (res, filePath) => { if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); }
}));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start ────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`[lp-sport] Listening on http://localhost:${PORT}`));
}).catch(err => {
  console.error("[lp-sport] Database init failed:", err.message);
  process.exit(1);
});
