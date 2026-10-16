require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

if (!process.env.SESSION_SECRET || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error("Missing SESSION_SECRET, ADMIN_EMAIL, or ADMIN_PASSWORD. Copy .env.example to .env and set them.");
  process.exit(1);
}
if (process.env.ADMIN_PASSWORD.length < 12) {
  console.error("ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "bitcoin-wealth.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
  investment_cents INTEGER NOT NULL DEFAULT 0,
  earnings_cents INTEGER NOT NULL DEFAULT 0,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('credit','debit')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Admin-entered',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER REFERENCES users(id),
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const setSetting = db.prepare(`
  INSERT INTO settings(key,value) VALUES(?,?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value
`);
for (const [key, value] of [
  ["wallet_address", ""],
  ["tawk_property_id", ""],
  ["tawk_widget_id", "default"]
]) {
  if (!getSetting.get(key)) setSetting.run(key, value);
}

const adminEmail = process.env.ADMIN_EMAIL.trim().toLowerCase();
const existingAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
if (!existingAdmin) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
  db.prepare("INSERT INTO users(full_name,email,password_hash,role) VALUES(?,?,?,'admin')")
    .run("Bitcoin Wealth Admin", adminEmail, hash);
}

app.set("trust proxy", isProduction ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://embed.tawk.to", "https://*.tawk.to"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://*.tawk.to", "wss://*.tawk.to"],
      frameSrc: ["https://*.tawk.to"],
      objectSrc: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "30kb" }));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));
app.use(session({
  name: "bw.sid",
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dataDir }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false });
app.use("/api/register", authLimiter);
app.use("/api/login", authLimiter);

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Please log in first." });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Administrator access required." });
  }
  next();
}
function centsToNumber(cents) { return Number((cents / 100).toFixed(2)); }
function numberToCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000000000) throw new Error("Enter a valid non-negative amount.");
  return Math.round(n * 100);
}
function safeUser(row) {
  return {
    id: row.id, fullName: row.full_name, email: row.email, role: row.role,
    investment: centsToNumber(row.investment_cents),
    earnings: centsToNumber(row.earnings_cents),
    balance: centsToNumber(row.balance_cents),
    createdAt: row.created_at
  };
}
function logAudit(adminId, userId, action, details) {
  db.prepare("INSERT INTO audit_log(admin_id,user_id,action,details) VALUES(?,?,?,?)")
    .run(adminId, userId || null, action, JSON.stringify(details));
}
function getTransactions(userId) {
  return db.prepare(`
    SELECT t.id,t.kind,t.amount_cents,t.description,t.status,t.created_at,u.full_name AS entered_by
    FROM transactions t LEFT JOIN users u ON u.id=t.created_by
    WHERE t.user_id=? ORDER BY t.id DESC LIMIT 100
  `).all(userId).map(t => ({
    id: t.id, kind: t.kind, amount: centsToNumber(t.amount_cents),
    description: t.description, status: t.status, createdAt: t.created_at,
    enteredBy: t.entered_by || "System"
  }));
}

app.get("/api/config", (req, res) => {
  res.json({
    walletAddress: getSetting.get("wallet_address")?.value || "",
    tawkPropertyId: getSetting.get("tawk_property_id")?.value || "",
    tawkWidgetId: getSetting.get("tawk_widget_id")?.value || "default"
  });
});

app.post("/api/register", async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ error: "Enter your full name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "Password must be at least 10 characters." });
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare("INSERT INTO users(full_name,email,password_hash) VALUES(?,?,?)").run(fullName, email, hash);
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: "Could not create session." });
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
      req.session.user = { id: user.id, role: user.role, email: user.email };
      res.json({ user: safeUser(user), transactions: [] });
    });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) return res.status(409).json({ error: "An account with this email already exists." });
    console.error(err);
    res.status(500).json({ error: "Could not register. Please try again." });
  }
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not create session." });
    req.session.user = { id: user.id, role: user.role, email: user.email };
    res.json({ user: safeUser(user), transactions: getTransactions(user.id) });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("bw.sid", { httpOnly: true, sameSite: "lax", secure: isProduction });
    res.json({ ok: true });
  });
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.user.id);
  if (!user) return res.status(401).json({ error: "Account not found." });
  res.json({ user: safeUser(user), transactions: getTransactions(user.id) });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all().map(safeUser);
  res.json({ users });
});

app.patch("/api/admin/users/:id", requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const target = db.prepare("SELECT * FROM users WHERE id=? AND role='user'").get(id);
    if (!target) return res.status(404).json({ error: "User not found." });
    const investment = numberToCents(req.body.investment);
    const earnings = numberToCents(req.body.earnings);
    const balance = numberToCents(req.body.balance);
    db.prepare("UPDATE users SET investment_cents=?,earnings_cents=?,balance_cents=? WHERE id=?")
      .run(investment, earnings, balance, id);
    logAudit(req.session.user.id, id, "manual_account_figures_update", {
      investment: centsToNumber(investment), earnings: centsToNumber(earnings),
      balance: centsToNumber(balance), note: "Administrator-entered figures"
    });
    res.json({ user: safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(id)) });
  } catch (err) {
    res.status(400).json({ error: err.message || "Invalid figures." });
  }
});

app.post("/api/admin/users/:id/transactions", requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const target = db.prepare("SELECT * FROM users WHERE id=? AND role='user'").get(id);
    if (!target) return res.status(404).json({ error: "User not found." });
    const kind = String(req.body.kind || "");
    if (!["credit", "debit"].includes(kind)) return res.status(400).json({ error: "Choose credit or debit." });
    const amount = numberToCents(req.body.amount);
    if (amount <= 0) return res.status(400).json({ error: "Amount must be greater than zero." });
    const description = String(req.body.description || "").trim().slice(0, 240);
    if (!description) return res.status(400).json({ error: "Enter a description." });
    const transaction = db.transaction(() => {
      db.prepare("INSERT INTO transactions(user_id,kind,amount_cents,description,status,created_by) VALUES(?,?,?,?,?,?)")
        .run(id, kind, amount, description, "Admin-entered — not independently verified", req.session.user.id);
      const delta = kind === "credit" ? amount : -amount;
      db.prepare("UPDATE users SET balance_cents=MAX(0,balance_cents+?) WHERE id=?").run(delta, id);
      logAudit(req.session.user.id, id, "admin_entered_transaction", {
        kind, amount: centsToNumber(amount), description,
        note: "Manual record; not independently verified"
      });
    });
    transaction();
    res.json({ transactions: getTransactions(id), user: safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(id)) });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Could not add transaction." });
  }
});

app.get("/api/admin/settings", requireAdmin, (req, res) => {
  res.json({
    walletAddress: getSetting.get("wallet_address")?.value || "",
    tawkPropertyId: getSetting.get("tawk_property_id")?.value || "",
    tawkWidgetId: getSetting.get("tawk_widget_id")?.value || "default"
  });
});

app.put("/api/admin/settings", requireAdmin, (req, res) => {
  const walletAddress = String(req.body.walletAddress || "").trim().slice(0, 200);
  const tawkPropertyId = String(req.body.tawkPropertyId || "").trim().slice(0, 100);
  const tawkWidgetId = String(req.body.tawkWidgetId || "default").trim().slice(0, 100) || "default";
  if (walletAddress && !/^[a-zA-Z0-9:._-]+$/.test(walletAddress)) {
    return res.status(400).json({ error: "Wallet address contains unsupported characters." });
  }
  if (tawkPropertyId && !/^[a-fA-F0-9]+$/.test(tawkPropertyId)) {
    return res.status(400).json({ error: "Check the Tawk.to Property ID." });
  }
  if (tawkWidgetId && !/^[a-zA-Z0-9_-]+$/.test(tawkWidgetId)) {
    return res.status(400).json({ error: "Check the Tawk.to Widget ID." });
  }
  setSetting.run("wallet_address", walletAddress);
  setSetting.run("tawk_property_id", tawkPropertyId);
  setSetting.run("tawk_widget_id", tawkWidgetId);
  logAudit(req.session.user.id, null, "site_settings_update", { walletAddressChanged: !!walletAddress, tawkConfigured: !!tawkPropertyId });
  res.json({ ok: true });
});

app.get("/api/admin/audit", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT a.id,a.action,a.details,a.created_at,admin.full_name AS admin_name,target.full_name AS target_name
    FROM audit_log a LEFT JOIN users admin ON admin.id=a.admin_id
    LEFT JOIN users target ON target.id=a.user_id ORDER BY a.id DESC LIMIT 200
  `).all();
  res.json({ logs: rows });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`Bitcoin Wealth is running at http://localhost:${PORT}`);
});
