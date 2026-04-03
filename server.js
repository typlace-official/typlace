// server.js
require("dotenv").config({ path: __dirname + "/.env", override: true });

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const express = require("express");
const path = require("path");
const multer = require("multer");
const { readJson, writeJson } = require("./services/json-store.service");

const supportService = require("./services/support.service");

const sharp = require("sharp");
const fs = require("fs");
const SUPPORT_CONFIG = require("./config/support.config");

const rateLimitPkg = require("express-rate-limit");
const rateLimit = rateLimitPkg.rateLimit || rateLimitPkg;
const { ipKeyGenerator } = rateLimitPkg;

// ===== FILE UPLOAD CONFIG =====
const UPLOADS_DIR = path.join(__dirname, "uploads");
const DATA_DIR = path.join(__dirname, "data");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const SUPPORTED_LANGS = ["ru", "uk", "en"];
const DEFAULT_LANG = "ru";
const LOCALES_DIR = path.join(__dirname, "public", "locales");

let serverTranslations = Object.create(null);

function readLocaleJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) {
      return {};
    }

    return JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to read locale file: ${filePath}`, err.message);
    return {};
  }
}

function deepGet(obj, key) {
  return String(key || "")
    .split(".")
    .reduce((acc, part) => acc?.[part], obj);
}

function interpolateText(template, params = {}) {
  if (typeof template !== "string") {
    return template;
  }

  return template.replace(/{{\s*([\w.-]+)\s*}}/g, (_, key) => {
    const value = params[key];
    return value == null ? "" : String(value);
  });
}

function loadServerTranslations() {
  const next = {};

  for (const lang of SUPPORTED_LANGS) {
    next[lang] = readLocaleJsonSafe(
      path.join(LOCALES_DIR, lang, "server.json")
    );
  }

  serverTranslations = next;
}

function tServer(lang, key, params = {}, fallback = key) {
  const safeLang = normalizeLang(lang);

  let value = deepGet(serverTranslations[safeLang], key);

  if (value == null && safeLang !== DEFAULT_LANG) {
    value = deepGet(serverTranslations[DEFAULT_LANG], key);
  }

  if (value == null) {
    return fallback;
  }

  if (typeof value !== "string") {
    return String(value);
  }

  return interpolateText(value, params);
}

function getRequestLang(req, fallback = DEFAULT_LANG) {
  return normalizeLang(
    req?.user?.lang ||
    req?.body?.lang ||
    req?.query?.lang ||
    req?.headers?.["x-tp-lang"] ||
    fallback
  );
}

function getAttachmentFallback(lang = DEFAULT_LANG) {
  return tServer(lang, "common.attachmentFallback");
}

function tReq(req, key, params = {}) {
  return tServer(getRequestLang(req), key, params, key);
}

function tUser(user, key, params = {}) {
  return tServer(normalizeLang(user?.lang || DEFAULT_LANG), key, params, key);
}

function tLang(lang, key, params = {}) {
  return tServer(normalizeLang(lang), key, params, key);
}

function tDefault(key, params = {}) {
  return tServer(DEFAULT_LANG, key, params, key);
}

const SERVER_I18N_KEY_PREFIXES = [
  "responses.",
  "common.",
  "official.",
  "email.",
  "telegram.",
  "notifications."
];

function isServerI18nKey(value) {
  if (typeof value !== "string") return false;
  return SERVER_I18N_KEY_PREFIXES.some(prefix => value.startsWith(prefix));
}

function translateResponsePayload(req, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const next = { ...payload };

  if (isServerI18nKey(next.message)) {
    next.message = tReq(req, next.message, next.messageParams || {});
    delete next.messageParams;
  }

  return next;
}

loadServerTranslations();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || "");
    cb(null, uniqueName + ext);
  }
});

function makeUpload({
  fileSize,
  allowedPrefixes = [],
  allowedExact = [],
  errorMessageKey = "responses.upload.unsupportedFileType"
}) {
  return multer({
    storage,
    limits: { fileSize },
    fileFilter: (req, file, cb) => {
      const mime = String(file.mimetype || "").toLowerCase();

      const byPrefix = allowedPrefixes.some(prefix => mime.startsWith(prefix));
      const byExact = allowedExact.includes(mime);

      if (!byPrefix && !byExact) {
        return cb(new Error(errorMessageKey));
      }

      cb(null, true);
    }
  });
}

const uploadImages = makeUpload({
  fileSize: 5 * 1024 * 1024,
  allowedPrefixes: ["image/"],
  errorMessageKey: "responses.upload.onlyImages"
});

const uploadChatFiles = makeUpload({
  fileSize: 25 * 1024 * 1024,
  allowedPrefixes: ["image/", "video/"],
  errorMessageKey: "responses.upload.onlyImagesAndVideos"
});

const uploadSupportAttachments = makeUpload({
  fileSize: 10 * 1024 * 1024,
  allowedPrefixes: ["image/", "video/"],
  allowedExact: ["application/pdf"],
  errorMessageKey: "responses.upload.onlyImagesVideosAndPdf"
});

// чтобы сервер раздавал картинки
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const prisma = require("./lib/prisma");

const app = express();

app.set("trust proxy", 1);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

const SITE_LOCK_ENABLED = String(process.env.SITE_LOCK_ENABLED || "").trim() === "true";
const SITE_LOCK_USER = String(process.env.SITE_LOCK_USER || "").trim();
const SITE_LOCK_PASS = String(process.env.SITE_LOCK_PASS || "").trim();

const SITE_LOCK_COOKIE_NAME = "tp_preview";
const SITE_LOCK_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

if (SITE_LOCK_ENABLED && (!SITE_LOCK_USER || !SITE_LOCK_PASS)) {
  throw new Error("SITE_LOCK_ENABLED=true requires SITE_LOCK_USER and SITE_LOCK_PASS");
}

function safeEqualStrings(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function parseCookies(cookieHeader = "") {
  const result = Object.create(null);

  String(cookieHeader)
    .split(";")
    .forEach(part => {
      const trimmed = part.trim();
      if (!trimmed) return;

      const eqIndex = trimmed.indexOf("=");
      const key = eqIndex >= 0 ? trimmed.slice(0, eqIndex).trim() : trimmed;
      const value = eqIndex >= 0 ? trimmed.slice(eqIndex + 1).trim() : "";

      if (!key) return;

      try {
        result[key] = decodeURIComponent(value);
      } catch {
        result[key] = value;
      }
    });

  return result;
}

function isSecureRequest(req) {
  if (req.secure) return true;

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

  return forwardedProto === "https";
}

function normalizeSiteLockNextPath(value) {
  const raw = String(value || "").trim();

  if (!raw) return "/";

  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (raw.startsWith("/site-lock")) return "/";

  return raw;
}

function signSiteLockPayload(payload) {
  return crypto
    .createHmac("sha256", SITE_LOCK_PASS)
    .update(payload)
    .digest("hex");
}

function createSiteLockCookieValue() {
  const expiresAt = Date.now() + SITE_LOCK_SESSION_TTL_MS;
  const payload = `${SITE_LOCK_USER}\t${expiresAt}`;
  const signature = signSiteLockPayload(payload);

  return Buffer.from(`${payload}\t${signature}`, "utf8").toString("base64url");
}

function getSiteLockSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const rawValue = cookies[SITE_LOCK_COOKIE_NAME];

  if (!rawValue) {
    return null;
  }

  let decoded = "";
  try {
    decoded = Buffer.from(rawValue, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const parts = decoded.split("\t");
  if (parts.length !== 3) {
    return null;
  }

  const [username, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  const payload = `${username}\t${expiresAt}`;
  const expectedSignature = signSiteLockPayload(payload);

  if (!safeEqualStrings(signature, expectedSignature)) {
    return null;
  }

  if (!safeEqualStrings(username, SITE_LOCK_USER)) {
    return null;
  }

  return {
    username,
    expiresAt
  };
}

function setSiteLockCookie(req, res) {
  res.cookie(SITE_LOCK_COOKIE_NAME, createSiteLockCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    maxAge: SITE_LOCK_SESSION_TTL_MS,
    path: "/"
  });
}

function clearSiteLockCookie(req, res) {
  res.clearCookie(SITE_LOCK_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/"
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSiteLockPage({ nextPath = "/", errorMessage = "", username = "" } = {}) {
  const safeNextPath = escapeHtml(normalizeSiteLockNextPath(nextPath));
  const safeErrorMessage = escapeHtml(errorMessage);
  const safeUsername = escapeHtml(username);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TyPlace Preview</title>
  <style>
    :root{
      --bg:#f6f7f9;
      --card:#ffffff;
      --text:#111827;
      --muted:#6b7280;
      --border:#e5e7eb;
      --primary:#1e63d5;
      --primary-hover:#174eb0;
      --danger-bg:#fef2f2;
      --danger-border:#fecaca;
      --danger-text:#b91c1c;
    }

    *{box-sizing:border-box}

    html,body{
      margin:0;
      min-height:100%;
      font-family:Inter,Arial,sans-serif;
      background:var(--bg);
      color:var(--text);
    }

    body{
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
    }

    .card{
      width:100%;
      max-width:420px;
      background:var(--card);
      border:1px solid var(--border);
      border-radius:20px;
      padding:24px;
      box-shadow:0 20px 60px rgba(0,0,0,.08);
    }

    .brand{
      font-size:34px;
      font-weight:800;
      color:var(--primary);
      margin:0 0 18px;
    }

    h1{
      font-size:22px;
      margin:0 0 8px;
    }

    .text{
      color:var(--muted);
      line-height:1.5;
      margin:0 0 18px;
    }

    .error{
      margin:0 0 16px;
      padding:12px 14px;
      border-radius:12px;
      background:var(--danger-bg);
      border:1px solid var(--danger-border);
      color:var(--danger-text);
      font-size:14px;
    }

    .field{
      display:flex;
      flex-direction:column;
      gap:8px;
      margin-bottom:14px;
    }

    .label{
      font-size:14px;
      font-weight:600;
    }

    .input{
      width:100%;
      padding:12px 14px;
      border-radius:12px;
      border:1px solid var(--border);
      font:inherit;
      outline:none;
      background:#fff;
    }

    .input:focus{
      border-color:var(--primary);
      box-shadow:0 0 0 3px rgba(30,99,213,.12);
    }

    .button{
      width:100%;
      border:none;
      border-radius:12px;
      padding:13px 16px;
      font:inherit;
      font-weight:700;
      cursor:pointer;
      background:var(--primary);
      color:#fff;
      transition:.15s ease;
    }

    .button:hover{
      background:var(--primary-hover);
    }

    .hint{
      margin-top:14px;
      color:var(--muted);
      font-size:13px;
      line-height:1.45;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">TyPlace</div>
    <h1>Доступ к preview</h1>
    <p class="text">Сайт сейчас закрыт для общего доступа. Введите логин и пароль, чтобы продолжить.</p>
    ${safeErrorMessage ? `<div class="error">${safeErrorMessage}</div>` : ""}
    <form method="POST" action="/site-lock/login">
      <input type="hidden" name="next" value="${safeNextPath}" />

      <div class="field">
        <label class="label" for="siteLockUsername">Логин</label>
        <input
          class="input"
          id="siteLockUsername"
          name="username"
          type="text"
          value="${safeUsername}"
          autocomplete="username"
          autocapitalize="off"
          autocorrect="off"
          required
        />
      </div>

      <div class="field">
        <label class="label" for="siteLockPassword">Пароль</label>
        <input
          class="input"
          id="siteLockPassword"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>

      <button class="button" type="submit">Войти</button>
    </form>

    <div class="hint">
      После успешного входа доступ сохранится в cookie и сайт не будет заново показывать системные окна браузера.
    </div>
  </main>
</body>
</html>`;
}

function sendSiteLockPage(res, options = {}) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(renderSiteLockPage(options));
}

function requestWantsHtml(req) {
  const accept = String(req.headers.accept || "").toLowerCase();
  const secFetchDest = String(req.headers["sec-fetch-dest"] || "").toLowerCase();

  if (secFetchDest === "document") {
    return true;
  }

  if (accept.includes("text/html")) {
    return true;
  }

  if (req.path === "/" || /\.html?$/i.test(req.path)) {
    return true;
  }

  return false;
}

app.get("/site-lock", (req, res) => {
  if (!SITE_LOCK_ENABLED) {
    return res.redirect(normalizeSiteLockNextPath(req.query.next));
  }

  if (getSiteLockSession(req)) {
    return res.redirect(normalizeSiteLockNextPath(req.query.next));
  }

  return sendSiteLockPage(res, {
    nextPath: normalizeSiteLockNextPath(req.query.next)
  });
});

app.post("/site-lock/login", (req, res) => {
  if (!SITE_LOCK_ENABLED) {
    return res.redirect(normalizeSiteLockNextPath(req.body.next));
  }

  const nextPath = normalizeSiteLockNextPath(req.body.next);
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  const isValid =
    safeEqualStrings(username, SITE_LOCK_USER) &&
    safeEqualStrings(password, SITE_LOCK_PASS);

  if (!isValid) {
    clearSiteLockCookie(req, res);

    return sendSiteLockPage(res, {
      nextPath,
      username,
      errorMessage: "Неверный логин или пароль."
    });
  }

  setSiteLockCookie(req, res);
  return res.redirect(nextPath);
});

app.post("/site-lock/logout", (req, res) => {
  clearSiteLockCookie(req, res);
  return res.redirect("/site-lock");
});

if (SITE_LOCK_ENABLED) {
  app.use((req, res, next) => {
    if (req.path === "/favicon.ico" || req.path.startsWith("/site-lock")) {
      return next();
    }

    if (getSiteLockSession(req)) {
      return next();
    }

    const nextPath = normalizeSiteLockNextPath(req.originalUrl || req.url || "/");

    if (requestWantsHtml(req)) {
      return sendSiteLockPage(res, { nextPath });
    }

    return res.status(401).json({
      success: false,
      message: "responses.auth.previewAccessRequired"
    });
  });
}

app.use("/uploads", express.static(UPLOADS_DIR));
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server);

const onlineSockets = new Map(); // email -> last socket.id
const socketIdsByEmail = new Map(); // email -> Set<socket.id>
const socketIdsByToken = new Map(); // token -> Set<socket.id>

supportService.setSocket(io, emitToUserSockets);

function emitToUserSockets(email, event, payload) {
  const safeEmail = String(email || "").trim().toLowerCase();
  if (!safeEmail) return;

  const set = socketIdsByEmail.get(safeEmail);
  if (!set || set.size === 0) return;

  for (const socketId of set) {
    io.to(socketId).emit(event, payload);
  }
}

function addSocketToToken(token, socketId) {
  const safeToken = String(token || "").trim();
  const safeSocketId = String(socketId || "").trim();

  if (!safeToken || !safeSocketId) return;

  let set = socketIdsByToken.get(safeToken);

  if (!set) {
    set = new Set();
    socketIdsByToken.set(safeToken, set);
  }

  set.add(safeSocketId);
}

function removeSocketFromToken(token, socketId) {
  const safeToken = String(token || "").trim();
  const safeSocketId = String(socketId || "").trim();

  if (!safeToken || !safeSocketId) return;

  const set = socketIdsByToken.get(safeToken);
  if (!set) return;

  set.delete(safeSocketId);

  if (set.size === 0) {
    socketIdsByToken.delete(safeToken);
  }
}

function disconnectSocketsForToken(token) {
  const safeToken = String(token || "").trim();
  if (!safeToken) return;

  const set = socketIdsByToken.get(safeToken);
  if (!set || set.size === 0) {
    socketIdsByToken.delete(safeToken);
    return;
  }

  for (const socketId of Array.from(set)) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.disconnect(true);
    }
  }

  socketIdsByToken.delete(safeToken);
}

function setUserOnlineState(email, isOnline) {
  const safeEmail = String(email || "").trim().toLowerCase();
  if (!safeEmail) return;

  const user = users.get(safeEmail);
  const lastSeen = Date.now();

  if (user) {
    user.online = Boolean(isOnline);

    if (!isOnline) {
      user.lastSeen = lastSeen;
    }
  }

  prisma.user.update({
    where: { email: safeEmail },
    data: {
      online: Boolean(isOnline),
      ...(isOnline ? {} : { lastSeenAt: new Date(lastSeen) })
    }
  }).catch(err => {
    console.error("setUserOnlineState prisma error:", err.message);
  });
}

function addOnlineSocket(email, socketId) {
  const safeEmail = String(email || "").trim().toLowerCase();
  const safeSocketId = String(socketId || "").trim();

  if (!safeEmail || !safeSocketId) return;

  let set = socketIdsByEmail.get(safeEmail);

  if (!set) {
    set = new Set();
    socketIdsByEmail.set(safeEmail, set);
  }

  set.add(safeSocketId);
  onlineSockets.set(safeEmail, safeSocketId);
  setUserOnlineState(safeEmail, true);
}

function removeOnlineSocket(email, socketId) {
  const safeEmail = String(email || "").trim().toLowerCase();
  const safeSocketId = String(socketId || "").trim();

  if (!safeEmail || !safeSocketId) return;

  const set = socketIdsByEmail.get(safeEmail);
  if (!set) return;

  set.delete(safeSocketId);

  if (set.size === 0) {
    socketIdsByEmail.delete(safeEmail);
    onlineSockets.delete(safeEmail);
    setUserOnlineState(safeEmail, false);
    return;
  }

  const nextSocketId = set.values().next().value;
  if (nextSocketId) {
    onlineSockets.set(safeEmail, nextSocketId);
  }
}

function cleanupUploadedFile(file) {
  const filePath = String(file?.path || "").trim();
  if (!filePath) return;

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("cleanupUploadedFile error:", err.message);
  }
}

function cleanupUploadedFiles(files) {
  if (!files) return;

  const list = Array.isArray(files) ? files : [files];

  for (const file of list) {
    cleanupUploadedFile(file);
  }
}

const PORT = process.env.PORT || 3000;

const authRequestCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "responses.auth.tooManyRequests"
  }
});

const authVerifyCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "responses.auth.tooManyVerifyRequests"
  }
});

const supportCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.email ||
    ipKeyGenerator(req.ip || req.socket?.remoteAddress || ""),
  message: {
    success: false,
    message: "responses.support.tooManyCreateRequests"
  }
});

const supportMessageLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.email ||
    ipKeyGenerator(req.ip || req.socket?.remoteAddress || ""),
  message: {
    success: false,
    message: "responses.support.tooManyMessageRequests"
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    return originalJson(translateResponsePayload(req, payload));
  };

  next();
});
/* ================== EMAIL (GMAIL) ================== */
const MAIL_USER = process.env.TYPLACE_GMAIL;
const MAIL_PASS = process.env.TYPLACE_GMAIL_PASS;

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "")
  .split(",")
  .map(v => v.trim().toLowerCase())
  .filter(Boolean);

const ROLE = Object.freeze({
  USER: "user",
  MODERATOR: "moderator",
  SUPPORT: "support",
  RESOLUTION: "resolution",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin"
});

const OFFICIAL_ACCOUNT = Object.freeze({
  email: "__official__@typlace.local",
  userId: "TP000001",
  username: "TyPlace",
  role: "official",
  verified: true
});

const RESOLUTION_ENTITY = Object.freeze({
  email: "__resolution__@typlace.local",
  userId: "TP000002",
  username: "TyPlace Resolution",
  role: "resolution_entity",
  verified: true
});

function getOfficialWelcomeMessage(lang) {
  const safeLang = normalizeLang(lang);

  return [
    tLang(safeLang, "official.welcome.line1"),
    tLang(safeLang, "official.welcome.line2"),
    tLang(safeLang, "official.welcome.line3")
  ].join("\n");
}

const ORDER_COMPLETED_APPEAL_WINDOW_MS = 72 * 60 * 60 * 1000;

function canBuyerOpenCompletedOrderAppeal(order, user) {
  if (!order || !user) return false;
  if (order.status !== "completed") return false;
  if (order.buyerEmail !== user.email) return false;
  if (!order.completedAt) return false;

  return Date.now() <= Number(order.completedAt) + ORDER_COMPLETED_APPEAL_WINDOW_MS;
}

function hasRole(user, ...roles) {
  return Boolean(user && roles.includes(user.role));
}

function isAdminPanelRole(user) {
  return hasRole(user, ROLE.ADMIN, ROLE.SUPER_ADMIN);
}

function isSupportRole(user) {
  return hasRole(user, ROLE.SUPPORT, ROLE.ADMIN, ROLE.SUPER_ADMIN);
}

function isResolutionRole(user) {
  return hasRole(user, ROLE.RESOLUTION, ROLE.SUPER_ADMIN);
}

function isProtectedStaffRole(role) {
  return [
    ROLE.MODERATOR,
    ROLE.SUPPORT,
    ROLE.RESOLUTION,
    ROLE.ADMIN,
    ROLE.SUPER_ADMIN
  ].includes(role);
}

function isModeratorRole(user) {
  return hasRole(user, ROLE.MODERATOR, ROLE.ADMIN, ROLE.SUPER_ADMIN);
}

function isOfferModerationRole(user) {
  return hasRole(user, ROLE.MODERATOR, ROLE.ADMIN, ROLE.SUPER_ADMIN);
}

function isOfficialEmail(email) {
  return String(email || "").trim().toLowerCase() === OFFICIAL_ACCOUNT.email;
}

function isResolutionEntityEmail(email) {
  return String(email || "").trim().toLowerCase() === RESOLUTION_ENTITY.email;
}

function isOfficialChat(chat) {
  return Boolean(chat && chat.official === true);
}

function canWriteOfficial(user) {
  return hasRole(user, ROLE.SUPPORT, ROLE.ADMIN, ROLE.SUPER_ADMIN);
}

function isOfficialScopeRequest(req) {
  return String(req.query.scope || "").trim().toLowerCase() === "official";
}

function isStaffLikeUser(user) {
  if (!user) return false;

  return [
    ROLE.MODERATOR,
    ROLE.SUPPORT,
    ROLE.RESOLUTION,
    ROLE.ADMIN,
    ROLE.SUPER_ADMIN
  ].includes(user.role);
}

function canWriteOfficialFromStaffPanel(user, chat) {
  if (!user || !chat) return false;
  if (!isOfficialChat(chat)) return false;

  return canWriteOfficial(user);
}

function canAccessOfficialChat(user, chat) {
  if (!user || !chat || !isOfficialChat(chat)) return false;

  if (isChatParticipant(user, chat)) {
    return true;
  }

  return canWriteOfficial(user);
}

function getUserByEmailSafe(email) {
  const safeEmail = String(email || "").trim().toLowerCase();

  if (safeEmail === OFFICIAL_ACCOUNT.email) {
    return {
      email: OFFICIAL_ACCOUNT.email,
      username: OFFICIAL_ACCOUNT.username,
      userId: OFFICIAL_ACCOUNT.userId,
      role: OFFICIAL_ACCOUNT.role,
      verified: true,
      avatarUrl: "",
      avatarDataUrl: "",
      online: true,
      lastSeen: null
    };
  }

  if (safeEmail === RESOLUTION_ENTITY.email) {
    return {
      email: RESOLUTION_ENTITY.email,
      username: RESOLUTION_ENTITY.username,
      userId: RESOLUTION_ENTITY.userId,
      role: RESOLUTION_ENTITY.role,
      verified: true,
      avatarUrl: "",
      avatarDataUrl: "",
      online: true,
      lastSeen: null
    };
  }

  return users.get(safeEmail) || null;
}

function buildPublicUserPayload(user, lang = DEFAULT_LANG) {
  if (!user) return null;

  return {
    email: user.email,
    username: user.username || tLang(lang, "common.userFallback"),
    userId: user.userId || null,
    role: user.role || ROLE.USER,
    verified: Boolean(user.verified),
    avatarUrl: user.avatarUrl || null,
    avatarDataUrl: user.avatarDataUrl || null,
    online: Boolean(user.online),
    lastSeen: user.lastSeen || null,
    rating: user.rating || 0,
    reviewsCount: user.reviewsCount || 0,
    createdAt: user.createdAt || null
  };
}

function makeChatMessage({
  chatId,
  fromEmail = "",
  fromUserId = "",
  fromUsername = "",
  fromRole = ROLE.USER,
  kind = "user",
  messageType = "user",
  staffRole = null,
  text = "",
  media = [],
  officialType = null,
  systemType = null,
  meta = {}
}) {
  return {
    id: crypto.randomUUID(),
    chatId,
    fromEmail,
    fromUserId,
    fromUsername,
    fromRole,
    kind,
    messageType,
    staffRole,
    text: String(text || "").trim(),
    media: Array.isArray(media) ? media : [],
    officialType,
    systemType,
    meta,
    createdAt: Date.now(),
    read: false
  };
}

function getOrderByChatId(chatId) {
  return orders.find(o => o.chatId === chatId) || null;
}

function isDisputeChatOpen(order) {
  if (!order) return false;

  return (
    order.disputeStatus === "requested" ||
    order.disputeStatus === "in_review"
  );
}

function isChatParticipant(user, chat) {
  if (!user || !chat) return false;

  return (
    chat.buyerEmail === user.email ||
    chat.sellerEmail === user.email
  );
}

function canViewChat(user, chat) {
  if (!user || !chat) return false;

  if (isOfficialChat(chat)) {
    return canAccessOfficialChat(user, chat);
  }

  if (isChatParticipant(user, chat)) {
    return true;
  }

  const order = getOrderByChatId(chat.id);
  if (!order) return false;

  // super_admin видит любой order chat
  if (user.role === ROLE.SUPER_ADMIN) {
    return true;
  }

  // resolution видит только активный спор, назначенный ему
  if (
    user.role === ROLE.RESOLUTION &&
    isDisputeChatOpen(order) &&
    order.resolutionAssignedTo === user.email
  ) {
    return true;
  }

  return false;
}

function canWriteResolutionToOrder(user, order) {
  if (!user || !order) return false;
  if (!isDisputeChatOpen(order)) return false;

  if (user.role === ROLE.SUPER_ADMIN) {
    return true;
  }

  if (
    user.role === ROLE.RESOLUTION &&
    order.resolutionAssignedTo === user.email
  ) {
    return true;
  }

  return false;
}

function getRealtimeEmailsForChat(chat) {
  const set = new Set();

  if (!chat) return [];

  if (chat.buyerEmail) set.add(chat.buyerEmail);
  if (chat.sellerEmail) set.add(chat.sellerEmail);

  if (isOfficialChat(chat)) {
    users.forEach(user => {
      if (canWriteOfficial(user)) {
        set.add(user.email);
      }
    });

    return Array.from(set);
  }

  const order = getOrderByChatId(chat.id);

  if (order && isDisputeChatOpen(order) && order.resolutionAssignedTo) {
    set.add(order.resolutionAssignedTo);
  }

  return Array.from(set);
}

async function getOrCreateOfficialChat(userEmail) {
  const safeUserEmail = String(userEmail || "").trim().toLowerCase();
  if (!safeUserEmail) return null;

  let chat = chats.find(c =>
    c.official === true &&
    (
      (c.buyerEmail === safeUserEmail && c.sellerEmail === OFFICIAL_ACCOUNT.email) ||
      (c.sellerEmail === safeUserEmail && c.buyerEmail === OFFICIAL_ACCOUNT.email)
    )
  );

  if (chat) {
    return chat;
  }

  const dbChat = await prisma.chat.findFirst({
    where: {
      official: true,
      OR: [
        {
          buyerEmail: safeUserEmail,
          sellerEmail: OFFICIAL_ACCOUNT.email
        },
        {
          sellerEmail: safeUserEmail,
          buyerEmail: OFFICIAL_ACCOUNT.email
        }
      ]
    }
  });

  if (dbChat) {
    return syncChatToArray(dbChat);
  }

  return await createDbChatRecord({
    buyerEmail: safeUserEmail,
    sellerEmail: OFFICIAL_ACCOUNT.email,
    blocked: false,
    official: true,
    deletedBy: []
  });
}

function hasMessagesInChat(chatId) {
  return messages.some(m => m.chatId === chatId);
}

function getLastMessageForChat(chatId) {
  return messages
    .filter(m => m.chatId === chatId)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}

function getOfficialTargetEmail(chat) {
  if (!chat || !isOfficialChat(chat)) return "";

  const buyerEmail = String(chat.buyerEmail || "").trim().toLowerCase();
  const sellerEmail = String(chat.sellerEmail || "").trim().toLowerCase();

  if (buyerEmail && !isOfficialEmail(buyerEmail)) {
    return buyerEmail;
  }

  if (sellerEmail && !isOfficialEmail(sellerEmail)) {
    return sellerEmail;
  }

  return "";
}

function getChatOtherEmailForViewer(chat, viewerEmail) {
  if (!chat) return "";

  const safeViewerEmail = String(viewerEmail || "").trim().toLowerCase();
  const buyerEmail = String(chat.buyerEmail || "").trim().toLowerCase();
  const sellerEmail = String(chat.sellerEmail || "").trim().toLowerCase();

  if (buyerEmail === safeViewerEmail) {
    return sellerEmail;
  }

  if (sellerEmail === safeViewerEmail) {
    return buyerEmail;
  }

  // staff смотрит официальный чат со стороны панели
  if (isOfficialChat(chat)) {
    return getOfficialTargetEmail(chat);
  }

  return "";
}

async function sendOfficialNoticeToUser({ userEmail, text, officialType = "notice", actor }) {
  const safeUserEmail = String(userEmail || "").trim().toLowerCase();
  let chat = await getOrCreateOfficialChat(safeUserEmail);
  if (!chat) return null;

  if (Array.isArray(chat.deletedBy) && chat.deletedBy.includes(safeUserEmail)) {
    chat = await updateDbChatRecord(chat.id, {
      deletedBy: chat.deletedBy.filter(email => email !== safeUserEmail)
    });
  }

  return await pushOfficialMessage({
    chatId: chat.id,
    text,
    officialType,
    actor
  });
}

function canSetRole(actor, target, nextRole) {
  if (!actor || !target) return false;
  if (!Object.values(ROLE).includes(nextRole)) return false;
  if (actor.email === target.email) return false;

  const targetRole = target.role || ROLE.USER;

  if (actor.role === ROLE.SUPER_ADMIN) {
    if (targetRole === ROLE.SUPER_ADMIN) return false;
    return true;
  }

  if (actor.role === ROLE.ADMIN) {
    if ([ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(targetRole)) return false;
    if ([ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(nextRole)) return false;

    return [
      ROLE.USER,
      ROLE.MODERATOR,
      ROLE.SUPPORT,
      ROLE.RESOLUTION
    ].includes(nextRole);
  }

  return false;
}

function canBanUser(actor, target) {
  if (!actor || !target) return false;
  if (actor.email === target.email) return false;

  const targetRole = target.role || ROLE.USER;

  if (actor.role === ROLE.SUPER_ADMIN) {
    return targetRole !== ROLE.SUPER_ADMIN;
  }

  if (actor.role === ROLE.ADMIN) {
    return ![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(targetRole);
  }

  return false;
}

function emitChatMessageToParticipants(chatId, message) {
  const chat = chats.find(c => c.id === chatId);
  if (!chat) return;

  const participants = getRealtimeEmailsForChat(chat);

  participants.forEach(email => {
    emitToUserSockets(email, "new-message", message);
  });
}

async function pushOfficialMessage({ chatId, text, officialType = "notice", actor }) {
  const safeText = String(text || "").trim();
  if (!safeText) return null;

  const message = await createDbChatMessageRecord({
    chatId,
    fromEmail: OFFICIAL_ACCOUNT.email,
    fromUserId: OFFICIAL_ACCOUNT.userId,
    fromUsername: OFFICIAL_ACCOUNT.username,
    fromRole: OFFICIAL_ACCOUNT.role,
    kind: "official",
    messageType: "official",
    staffRole: null,
    text: safeText,
    media: [],
    officialType,
    systemType: null,
    meta: {
      actorEmail: actor?.email || "",
      actorUserId: actor?.userId || "",
      actorUsername: actor?.username || "",
      actorRole: actor?.role || "",
      actorVerified: Boolean(actor?.verified)
    },
    read: false
  });

  emitChatMessageToParticipants(chatId, message);

  const chat = chats.find(c => c.id === chatId);
  const targetEmail = getOfficialTargetEmail(chat);
  const targetUser = users.get(targetEmail);

  if (targetUser && targetUser.email !== actor?.email) {
    notifyUser(targetUser, "official_message", {
      text: safeText,
      chatId,
      officialType
    });
  }

  return message;
}

const TURNSTILE_ENABLED = process.env.TURNSTILE_ENABLED === "true";
const TURNSTILE_SITE_KEY = String(process.env.TURNSTILE_SITE_KEY || "").trim();

const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || "")
  .trim()
  .replace(/^@/, "");

const TELEGRAM_POLL_TIMEOUT_SEC = 25;
const TELEGRAM_LINK_TTL_MS = 10 * 60 * 1000;

const TELEGRAM_STATE_FILE = path.join(__dirname, "data", "telegram-state.json");
const rawTelegramState = readJson(TELEGRAM_STATE_FILE, { offset: 0 }) || {};

let telegramState = {
  offset: Number(rawTelegramState.offset || 0)
};

const telegramLinkCodes = new Map(); // email -> { code, expiresAt }
let telegramPollingStarted = false;

if (!MAIL_USER || !MAIL_PASS) {
  console.log("❌ Нет TYPLACE_GMAIL или TYPLACE_GMAIL_PASS в .env");
  console.log("✅ Создай файл .env рядом с server.js и добавь туда переменные");
}

const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.TYPLACE_GMAIL,
    pass: process.env.TYPLACE_GMAIL_PASS
  }
});

/* ================== STORAGE BRIDGE (Prisma + legacy Map) ================== */
const users = new Map();
const pendingCodes = new Map();
const sessions = new Map();

const lastChatActionAt = new Map();

function getChatActionCooldownSeconds(chatId, userEmail, minMs = 1500) {
  const key = `${chatId}:${String(userEmail || "").trim().toLowerCase()}`;
  const nowMs = Date.now();
  const lastAt = Number(lastChatActionAt.get(key) || 0);

  if (lastAt && nowMs - lastAt < minMs) {
    return Math.max(1, Math.ceil((minMs - (nowMs - lastAt)) / 1000));
  }

  lastChatActionAt.set(key, nowMs);
  return 0;
}

setInterval(() => {
  const nowMs = Date.now();

  for (const [key, lastAt] of lastChatActionAt.entries()) {
    if (nowMs - Number(lastAt || 0) > 5 * 60 * 1000) {
      lastChatActionAt.delete(key);
    }
  }
}, 60 * 1000).unref();

function dbUserToLegacy(dbUser) {
  if (!dbUser) return null;

  return {
    email: dbUser.email,
    username: dbUser.username,
    userId: dbUser.userId,
    avatarDataUrl: dbUser.avatarDataUrl || "",
    avatarUrl: dbUser.avatarUrl || "",
    createdAt: dbUser.createdAt ? dbUser.createdAt.toISOString() : null,
    usernameChangedAt: dbUser.usernameChangedAt
      ? dbUser.usernameChangedAt.getTime()
      : null,
    online: Boolean(dbUser.online),
    lastSeen: dbUser.lastSeenAt ? dbUser.lastSeenAt.getTime() : 0,
    banned: Boolean(dbUser.banned),
    role: dbUser.role || ROLE.USER,
    verified: Boolean(dbUser.verified),
    blockedUsers: Array.isArray(dbUser.blockedUsers) ? dbUser.blockedUsers : [],
    notify: {
      site: Boolean(dbUser.notifySite),
      email: Boolean(dbUser.notifyEmail),
      telegram: Boolean(dbUser.notifyTelegram)
    },
    telegramChatId: dbUser.telegramChatId || null,
    telegramUsername: dbUser.telegramUsername || "",
    telegramFirstName: dbUser.telegramFirstName || "",
    telegramLinkedAt: dbUser.telegramLinkedAt
      ? dbUser.telegramLinkedAt.getTime()
      : null,
    lang: normalizeLang(dbUser.lang || "ru"),
    rating: Number(dbUser.rating || 0),
    reviewsCount: Number(dbUser.reviewsCount || 0)
  };
}

function syncUserToMap(dbUser) {
  const legacyUser = dbUserToLegacy(dbUser);
  if (!legacyUser) return null;

  users.set(legacyUser.email, legacyUser);
  return legacyUser;
}

async function updateDbUserRecord(email, data) {
  const dbUser = await prisma.user.update({
    where: { email },
    data
  });

  return syncUserToMap(dbUser);
}

function dbPendingCodeToLegacy(dbCode) {
  if (!dbCode) return null;

  return {
    code: dbCode.code,
    mode: dbCode.mode,
    tempUsername: dbCode.tempUsername || "",
    expiresAt: dbCode.expiresAt.getTime(),
    lastSentAt: dbCode.lastSentAt.getTime(),
    tries: Number(dbCode.tries || 0)
  };
}

function dbSessionToLegacy(dbSession) {
  if (!dbSession) return null;

  return {
    email: dbSession.email,
    expiresAt: dbSession.expiresAt.getTime()
  };
}

async function generateUniqueUserIdForDb() {
  while (true) {
    const candidate = Math.floor(10000000 + Math.random() * 90000000).toString();

    const exists = await prisma.user.findUnique({
      where: { userId: candidate },
      select: { id: true }
    });

    if (!exists) {
      return candidate;
    }
  }
}

async function loadAuthCacheFromDb() {
  const nowDate = new Date();

  const [dbUsers, dbSessions, dbPendingCodes] = await Promise.all([
    prisma.user.findMany(),
    prisma.session.findMany({
      where: {
        expiresAt: {
          gt: nowDate
        }
      }
    }),
    prisma.pendingCode.findMany({
      where: {
        expiresAt: {
          gt: nowDate
        }
      }
    })
  ]);

  users.clear();
  sessions.clear();
  pendingCodes.clear();

  dbUsers.forEach(syncUserToMap);

  dbSessions.forEach(session => {
    sessions.set(session.token, dbSessionToLegacy(session));
  });

  dbPendingCodes.forEach(code => {
    pendingCodes.set(code.email, dbPendingCodeToLegacy(code));
  });

  console.log(
    `🔐 Auth cache loaded: users=${users.size}, sessions=${sessions.size}, pendingCodes=${pendingCodes.size}`
  );
}

async function cleanupExpiredAuthData() {
  const nowDate = new Date();
  const nowMs = Date.now();

  await Promise.all([
    prisma.session.deleteMany({
      where: {
        expiresAt: {
          lte: nowDate
        }
      }
    }),
    prisma.pendingCode.deleteMany({
      where: {
        expiresAt: {
          lte: nowDate
        }
      }
    })
  ]);

for (const [token, session] of sessions.entries()) {
  if (!session?.expiresAt || session.expiresAt <= nowMs) {
    disconnectSocketsForToken(token);
    sessions.delete(token);
  }
}

  for (const [email, code] of pendingCodes.entries()) {
    if (!code?.expiresAt || code.expiresAt <= nowMs) {
      pendingCodes.delete(email);
    }
  }
}

setInterval(() => {
  cleanupExpiredAuthData().catch(err => {
    console.error("cleanupExpiredAuthData error:", err.message);
  });
}, 60 * 1000);

/* ================== MARKET STORAGE ================== */

function toDateOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;

  const num = Number(value);
  if (Number.isFinite(num)) {
    return new Date(num);
  }

  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function dbOrderToLegacy(dbOrder) {
  if (!dbOrder) return null;

  return {
    id: dbOrder.id,
    orderNumber: dbOrder.orderNumber,
    offerId: dbOrder.offerId,
    buyerEmail: dbOrder.buyerEmail,
    sellerEmail: dbOrder.sellerEmail,
    chatId: dbOrder.chatId,
    price: Number(dbOrder.price || 0),
    commission: Number(dbOrder.commission || 0),
    status: dbOrder.status || "pending",
    disputeStatus: dbOrder.disputeStatus || "none",
    disputeTicketId: dbOrder.disputeTicketId || null,
    resolutionAssignedTo: dbOrder.resolutionAssignedTo || null,
    resolutionRequestedAt: dbOrder.resolutionRequestedAt
      ? dbOrder.resolutionRequestedAt.getTime()
      : null,
    resolutionAssignedAt: dbOrder.resolutionAssignedAt
      ? dbOrder.resolutionAssignedAt.getTime()
      : null,
    completedAt: dbOrder.completedAt ? dbOrder.completedAt.getTime() : null,
    refundedAt: dbOrder.refundedAt ? dbOrder.refundedAt.getTime() : null,
    createdAt: dbOrder.createdAt ? dbOrder.createdAt.getTime() : Date.now(),
    offerSnapshot: dbOrder.offerSnapshot || null
  };
}

function syncOrderToArray(dbOrder) {
  const legacyOrder = dbOrderToLegacy(dbOrder);
  if (!legacyOrder) return null;

  const index = orders.findIndex(o => o.id === legacyOrder.id);

  if (index === -1) {
    orders.push(legacyOrder);
  } else {
    orders[index] = {
      ...orders[index],
      ...legacyOrder
    };
  }

  return legacyOrder;
}

async function loadOrdersCacheFromDb() {
  const dbOrders = await prisma.order.findMany({
    orderBy: { createdAt: "asc" }
  });

  orders.length = 0;
  dbOrders.forEach(syncOrderToArray);

  console.log(`📦 Orders cache loaded: orders=${orders.length}`);
}

function normalizeOrderDbData(data = {}) {
  const dbData = { ...data };

  [
    "createdAt",
    "completedAt",
    "refundedAt",
    "resolutionRequestedAt",
    "resolutionAssignedAt"
  ].forEach(key => {
    if (key in dbData) {
      dbData[key] = toDateOrNull(dbData[key]);
    }
  });

  return dbData;
}

async function createDbOrderRecord(data) {
  const dbOrder = await prisma.order.create({
    data: normalizeOrderDbData(data)
  });

  return syncOrderToArray(dbOrder);
}

async function updateDbOrderRecord(orderId, data) {
  const dbOrder = await prisma.order.update({
    where: { id: orderId },
    data: normalizeOrderDbData(data)
  });

  return syncOrderToArray(dbOrder);
}

function dbReviewToLegacy(dbReview) {
  if (!dbReview) return null;

  return {
    id: dbReview.id,
    orderId: dbReview.orderId,
    sellerEmail: dbReview.sellerEmail,
    buyerEmail: dbReview.buyerEmail,
    rating: Number(dbReview.rating || 0),
    text: dbReview.text || "",
    createdAt: dbReview.createdAt ? dbReview.createdAt.getTime() : Date.now()
  };
}

function syncReviewToArray(dbReview) {
  const legacyReview = dbReviewToLegacy(dbReview);
  if (!legacyReview) return null;

  const index = reviews.findIndex(r => r.id === legacyReview.id);

  if (index === -1) {
    reviews.push(legacyReview);
  } else {
    reviews[index] = {
      ...reviews[index],
      ...legacyReview
    };
  }

  return legacyReview;
}

async function loadReviewsCacheFromDb() {
  const dbReviews = await prisma.review.findMany({
    orderBy: { createdAt: "asc" }
  });

  reviews.length = 0;
  dbReviews.forEach(syncReviewToArray);

  console.log(`⭐ Reviews cache loaded: reviews=${reviews.length}`);
}

async function createDbReviewRecord(data) {
  const dbReview = await prisma.review.create({
    data: {
      orderId: data.orderId,
      sellerEmail: data.sellerEmail,
      buyerEmail: data.buyerEmail,
      rating: Number(data.rating || 0),
      text: String(data.text || ""),
      createdAt: toDateOrNull(data.createdAt) || new Date()
    }
  });

  return syncReviewToArray(dbReview);
}

async function deleteDbReviewByOrderId(orderId) {
  await prisma.review.deleteMany({
    where: { orderId }
  });

  const index = reviews.findIndex(r => r.orderId === orderId);
  if (index !== -1) {
    reviews.splice(index, 1);
  }
}

async function recalcSellerRating(sellerEmail) {
  const seller = users.get(sellerEmail);
  if (!seller) return null;

  const sellerReviews = reviews.filter(r => r.sellerEmail === sellerEmail);
  const reviewsCount = sellerReviews.length;

  let rating = 0;

  if (reviewsCount > 0) {
    const avg =
      sellerReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviewsCount;

    rating = Math.round(avg * 10) / 10;
  }

  return await updateDbUserRecord(sellerEmail, {
    reviewsCount,
    rating
  });
}

function dbAdminLogToLegacy(dbLog) {
  if (!dbLog) return null;

  return {
    id: dbLog.id,
    actorEmail: dbLog.actorEmail || "",
    actorUsername: dbLog.actorUsername || tDefault("common.adminFallback"),
    action: dbLog.action || "action",
    targetType: dbLog.targetType || "",
    targetId: dbLog.targetId || "",
    text: dbLog.text || "",
    createdAt: dbLog.createdAt ? dbLog.createdAt.getTime() : Date.now()
  };
}

function syncAdminLogToArray(dbLog) {
  const legacyLog = dbAdminLogToLegacy(dbLog);
  if (!legacyLog) return null;

  const index = adminLogs.findIndex(l => l.id === legacyLog.id);

  if (index === -1) {
    adminLogs.unshift(legacyLog);
  } else {
    adminLogs[index] = {
      ...adminLogs[index],
      ...legacyLog
    };
  }

  adminLogs.sort((a, b) => b.createdAt - a.createdAt);

  if (adminLogs.length > 1000) {
    adminLogs.length = 1000;
  }

  return legacyLog;
}

async function loadAdminLogsCacheFromDb() {
  const dbLogs = await prisma.adminLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000
  });

  adminLogs.length = 0;
  dbLogs.forEach(syncAdminLogToArray);

  console.log(`🧾 Admin logs cache loaded: logs=${adminLogs.length}`);
}

function addAdminLog({ actor, action, targetType, targetId, text = "", textKey = "", textParams = {} }) {
  const resolvedText = textKey
    ? tDefault(textKey, textParams)
    : text;

  const legacyLog = {
    id: crypto.randomUUID(),
    actorEmail: actor?.email || "",
    actorUsername: actor?.username || tDefault("common.adminFallback"),
    action: action || "action",
    targetType: targetType || "",
    targetId: targetId || "",
    text: resolvedText || "",
    createdAt: Date.now()
  };

  adminLogs.unshift(legacyLog);

  if (adminLogs.length > 1000) {
    adminLogs.length = 1000;
  }

  prisma.adminLog.create({
    data: {
      id: legacyLog.id,
      actorEmail: legacyLog.actorEmail,
      actorUsername: legacyLog.actorUsername,
      action: legacyLog.action,
      targetType: legacyLog.targetType,
      targetId: legacyLog.targetId,
      text: legacyLog.text,
      createdAt: new Date(legacyLog.createdAt)
    }
  }).catch(err => {
    console.error("addAdminLog prisma error:", err.message);
  });

  return legacyLog;
}

const offers = [];
const chats = [];
const messages = [];
const orders = [];
const reviews = [];
const adminLogs = [];

function dbOfferToLegacy(dbOffer) {
  if (!dbOffer) return null;

  return {
    id: dbOffer.id,
    offerId: dbOffer.offerId,
    game: dbOffer.game,
    mode: dbOffer.mode,
    category: dbOffer.category || null,

    title: dbOffer.title || { ru: "", uk: "", en: "" },
    description: dbOffer.description || { ru: "", uk: "", en: "" },
    extra: dbOffer.extra || {},

    priceNet: Number(dbOffer.priceNet || 0),
    price: Number(dbOffer.price || 0),
    amount: dbOffer.amount == null ? null : Number(dbOffer.amount),

    method: dbOffer.method || null,
    country: dbOffer.country || null,
    accountType: dbOffer.accountType || null,
    accountRegion: dbOffer.accountRegion || null,
    voiceChat: dbOffer.voiceChat == null ? null : Boolean(dbOffer.voiceChat),

    images: Array.isArray(dbOffer.images) ? dbOffer.images : [],
    imageUrl: dbOffer.imageUrl || null,

    sellerEmail: dbOffer.sellerEmail,
    sellerName: dbOffer.sellerName,

    status: dbOffer.status,
    createdAt: dbOffer.createdAt ? dbOffer.createdAt.getTime() : Date.now(),
    activeUntil: dbOffer.activeUntil ? dbOffer.activeUntil.getTime() : null
  };
}

function syncOfferToArray(dbOffer) {
  const legacyOffer = dbOfferToLegacy(dbOffer);
  if (!legacyOffer) return null;

  const index = offers.findIndex(o => o.id === legacyOffer.id);

  if (index === -1) {
    offers.push(legacyOffer);
  } else {
    offers[index] = {
      ...offers[index],
      ...legacyOffer
    };
  }

  return legacyOffer;
}

async function loadOffersCacheFromDb() {
  const dbOffers = await prisma.offer.findMany({
    orderBy: { createdAt: "asc" }
  });

  offers.length = 0;
  dbOffers.forEach(syncOfferToArray);

  console.log(`🛒 Offers cache loaded: offers=${offers.length}`);
}

function normalizeOfferDbData(data = {}) {
  const dbData = { ...data };

  if ("priceNet" in dbData) {
    dbData.priceNet = Number(dbData.priceNet || 0);
  }

  if ("price" in dbData) {
    dbData.price = Number(dbData.price || 0);
  }

  if ("amount" in dbData) {
    dbData.amount =
      dbData.amount == null || dbData.amount === ""
        ? null
        : Number(dbData.amount);
  }

  if ("voiceChat" in dbData) {
    dbData.voiceChat =
      dbData.voiceChat == null
        ? null
        : Boolean(dbData.voiceChat);
  }

  if ("images" in dbData) {
    dbData.images = Array.isArray(dbData.images)
      ? dbData.images.map(v => String(v))
      : [];
  }

  if ("imageUrl" in dbData) {
    dbData.imageUrl = dbData.imageUrl || null;
  }

  if ("category" in dbData) {
    dbData.category = dbData.category || null;
  }

  if ("method" in dbData) {
    dbData.method = dbData.method || null;
  }

  if ("country" in dbData) {
    dbData.country = dbData.country || null;
  }

  if ("accountType" in dbData) {
    dbData.accountType = dbData.accountType || null;
  }

  if ("accountRegion" in dbData) {
    dbData.accountRegion = dbData.accountRegion || null;
  }

  if ("extra" in dbData) {
    dbData.extra = dbData.extra || {};
  }

  if ("title" in dbData) {
    dbData.title = dbData.title || { ru: "", uk: "", en: "" };
  }

  if ("description" in dbData) {
    dbData.description = dbData.description || { ru: "", uk: "", en: "" };
  }

  ["createdAt", "activeUntil"].forEach(key => {
    if (key in dbData) {
      dbData[key] = toDateOrNull(dbData[key]);
    }
  });

  return dbData;
}

async function createDbOfferRecord(data) {
  const dbOffer = await prisma.offer.create({
    data: normalizeOfferDbData(data)
  });

  return syncOfferToArray(dbOffer);
}

async function updateDbOfferRecord(offerId, data) {
  const dbOffer = await prisma.offer.update({
    where: { id: offerId },
    data: normalizeOfferDbData(data)
  });

  return syncOfferToArray(dbOffer);
}

function dbChatToLegacy(dbChat) {
  if (!dbChat) return null;

  return {
    id: dbChat.id,
    buyerEmail: dbChat.buyerEmail,
    sellerEmail: dbChat.sellerEmail,
    offerId: dbChat.offerId || null,
    createdAt: dbChat.createdAt ? dbChat.createdAt.getTime() : Date.now(),
    blocked: Boolean(dbChat.blocked),
    official: Boolean(dbChat.official),
    deletedBy: Array.isArray(dbChat.deletedBy) ? dbChat.deletedBy : []
  };
}

function dbChatMessageToLegacy(dbMessage) {
  if (!dbMessage) return null;

  return {
    id: dbMessage.id,
    chatId: dbMessage.chatId,
    fromEmail: dbMessage.fromEmail || "",
    fromUserId: dbMessage.fromUserId || "",
    fromUsername: dbMessage.fromUsername || "",
    fromRole: dbMessage.fromRole || ROLE.USER,
    kind: dbMessage.kind || "user",
    messageType: dbMessage.messageType || "user",
    staffRole: dbMessage.staffRole || null,
    text: dbMessage.text || "",
    media: Array.isArray(dbMessage.media) ? dbMessage.media : [],
    officialType: dbMessage.officialType || null,
    systemType: dbMessage.systemType || null,
    meta: dbMessage.meta || {},
    createdAt: dbMessage.createdAt ? dbMessage.createdAt.getTime() : Date.now(),
    read: Boolean(dbMessage.read)
  };
}

function syncChatToArray(dbChat) {
  const legacyChat = dbChatToLegacy(dbChat);
  if (!legacyChat) return null;

  const index = chats.findIndex(c => c.id === legacyChat.id);

  if (index === -1) {
    chats.push(legacyChat);
  } else {
    chats[index] = {
      ...chats[index],
      ...legacyChat
    };
  }

  return legacyChat;
}

function syncChatMessageToArray(dbMessage) {
  const legacyMessage = dbChatMessageToLegacy(dbMessage);
  if (!legacyMessage) return null;

  const index = messages.findIndex(m => m.id === legacyMessage.id);

  if (index === -1) {
    messages.push(legacyMessage);
  } else {
    messages[index] = {
      ...messages[index],
      ...legacyMessage
    };
  }

  return legacyMessage;
}

async function loadChatCacheFromDb() {
  const [dbChats, dbMessages] = await Promise.all([
    prisma.chat.findMany({
      orderBy: { createdAt: "asc" }
    }),
    prisma.chatMessage.findMany({
      orderBy: { createdAt: "asc" }
    })
  ]);

  chats.length = 0;
  messages.length = 0;

  dbChats.forEach(syncChatToArray);
  dbMessages.forEach(syncChatMessageToArray);

  console.log(`💬 Chat cache loaded: chats=${chats.length}, messages=${messages.length}`);
}

async function createDbChatRecord(data) {
  const dbChat = await prisma.chat.create({
    data
  });

  return syncChatToArray(dbChat);
}

async function updateDbChatRecord(chatId, data) {
  const dbChat = await prisma.chat.update({
    where: { id: chatId },
    data
  });

  return syncChatToArray(dbChat);
}

async function createDbChatMessageRecord(data) {
  const dbMessage = await prisma.chatMessage.create({
    data: {
      chatId: data.chatId,
      fromEmail: data.fromEmail || "",
      fromUserId: data.fromUserId || null,
      fromUsername: data.fromUsername || "",
      fromRole: data.fromRole || ROLE.USER,
      kind: data.kind || "user",
      messageType: data.messageType || "user",
      staffRole: data.staffRole || null,
      text: String(data.text || "").trim(),
      media: Array.isArray(data.media) ? data.media.map(v => String(v)) : [],
      officialType: data.officialType || null,
      systemType: data.systemType || null,
      meta: data.meta ?? null,
      read: Boolean(data.read)
    }
  });

  return syncChatMessageToArray(dbMessage);
}

async function markDbChatMessagesRead(chatId, myEmail) {
  await prisma.chatMessage.updateMany({
    where: {
      chatId,
      fromEmail: { not: myEmail },
      read: false
    },
    data: {
      read: true
    }
  });

  messages.forEach(m => {
    if (m.chatId === chatId && m.fromEmail !== myEmail && m.read === false) {
      m.read = true;
    }
  });
}

async function pushSystemMessage({
  chatId,
  systemType,
  actorEmail = "",
  orderId = "",
  orderNumber = "",
  actorUserId = "",
  actorUsername = "",
  actorRole = ""
}) {
  const message = await createDbChatMessageRecord({
    chatId,
    fromEmail: "system",
    fromUserId: "",
    fromUsername: tDefault("common.systemName"),
    fromRole: "system",
    kind: "system",
    messageType: "system",
    staffRole: null,
    text: "",
    media: [],
    officialType: null,
    systemType,
    meta: {
      actorEmail,
      orderId,
      orderNumber,
      actorUserId,
      actorUsername,
      actorRole
    },
    read: false
  });

  emitChatMessageToParticipants(chatId, message);

  return message;
}

function getActorMeta(actor, fallbackRole = "user") {
  return {
    actorEmail: actor?.email || "",
    actorUserId: actor?.userId || "",
    actorUsername: actor?.username || "",
    actorRole: actor?.role || fallbackRole
  };
}

async function applyOrderConfirm({ order, actor, systemType }) {
  if (!order || order.status !== "pending") {
    throw new Error("responses.orders.confirmImpossible");
  }

  const updatedOrder = await updateDbOrderRecord(order.id, {
    status: "completed",
    completedAt: Date.now(),
    disputeStatus: "closed"
  });

  Object.assign(order, updatedOrder);

  const chat = chats.find(c => c.id === order.chatId);

  if (chat) {
    await pushSystemMessage({
      chatId: chat.id,
      systemType,
      orderId: order.id,
      orderNumber: order.orderNumber,
      ...getActorMeta(actor)
    });
  }

  return order;
}

async function applyOrderRefund({ order, actor, systemType }) {
  if (!order || order.status !== "pending") {
    throw new Error("responses.orders.refundImpossible");
  }

  const updatedOrder = await updateDbOrderRecord(order.id, {
    status: "refunded",
    refundedAt: Date.now(),
    disputeStatus: "closed"
  });

  Object.assign(order, updatedOrder);

  const chat = chats.find(c => c.id === order.chatId);

  if (chat) {
    await pushSystemMessage({
      chatId: chat.id,
      systemType,
      orderId: order.id,
      orderNumber: order.orderNumber,
      ...getActorMeta(actor)
    });
  }

  const existingReview = reviews.find(r => r.orderId === order.id);
  if (existingReview) {
    await deleteDbReviewByOrderId(order.id);
    await recalcSellerRating(order.sellerEmail);
  }

  return order;
}

async function pushResolutionMessage({ order, actor, text, media = [] }) {
  if (!order?.chatId) return null;

  const message = await createDbChatMessageRecord({
    chatId: order.chatId,
    fromEmail: RESOLUTION_ENTITY.email,
    fromUserId: RESOLUTION_ENTITY.userId,
    fromUsername: RESOLUTION_ENTITY.username,
    fromRole: "resolution",
    kind: "staff",
    messageType: "resolution",
    staffRole: ROLE.RESOLUTION,
    text,
    media,
    officialType: null,
    systemType: null,
    meta: {
      actorEmail: actor?.email || "",
      actorUserId: actor?.userId || "",
      actorUsername: actor?.username || "",
      actorRole: actor?.role || ROLE.RESOLUTION,
      orderId: order.id,
      orderNumber: order.orderNumber
    },
    read: false
  });

  emitChatMessageToParticipants(order.chatId, message);

  return message;
}

const ADMIN_SETTINGS_FILE = path.join(__dirname, "data", "admin-settings.json");

const rawAdminSettings = readJson(ADMIN_SETTINGS_FILE, {}) || {};

let adminSettings = {
  marketplaceFeePercent: Number(rawAdminSettings.marketplaceFeePercent ?? 10),
  maintenanceText: String(
    rawAdminSettings.maintenanceText || tDefault("common.maintenanceTextDefault")
  )
};

function saveAdminSettings(){
  writeJson(ADMIN_SETTINGS_FILE, adminSettings);
}

/* ================== SETTINGS ================== */
const SESSION_DAYS = 2; // ✅ ты говорил максимум 2 дня, не 7

const BASE_CURRENCY = "UAH";

const CHECKOUT_MODE = ["disabled", "test", "live"].includes(
  String(process.env.CHECKOUT_MODE || "disabled").trim().toLowerCase()
)
  ? String(process.env.CHECKOUT_MODE || "disabled").trim().toLowerCase()
  : "disabled";

// поставь тут свои реальные лимиты в гривне

const MIN_OFFER_PRICE = 10;
const MAX_OFFER_PRICE = 100000;

let exchangeRates = {
  base: BASE_CURRENCY,
  rates: {
    UAH: 1,
    EUR: 1,
    USD: 1
  },
  updatedAt: 0
};

/* ================== HELPERS ================== */

function roundMoney(n){
  // если у тебя гривны целые — можешь заменить на Math.round(n)
  return Math.round((Number(n) || 0) * 100) / 100; // 2 знака
}

async function updateRates() {
  try {
    console.log("⏳ Загружаем курсы валют из НБУ...");

    const res = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json=");

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const data = await res.json();

    if (!Array.isArray(data) || !data.length) {
      throw new Error("Пустой ответ от НБУ");
    }

    const usdItem = data.find(item => String(item.cc || "").toUpperCase() === "USD");
    const eurItem = data.find(item => String(item.cc || "").toUpperCase() === "EUR");

    const usdUah = Number(usdItem?.rate || 0); // 1 USD = ? UAH
    const eurUah = Number(eurItem?.rate || 0); // 1 EUR = ? UAH

    if (!usdUah || !eurUah) {
      throw new Error("НБУ не вернул курс USD/EUR");
    }

    // ВАЖНО:
    // НБУ даёт курс в формате:
    // 1 USD = 44.0803 UAH
    // 1 EUR = 50.5777 UAH
    //
    // А твой текущий проект ожидает:
    // 1 UAH = 0.02268 USD
    // 1 UAH = 0.01977 EUR
    //
    // Поэтому переворачиваем курс, чтобы НЕ ломать остальную логику.

    exchangeRates = {
      base: "UAH",
      rates: {
        UAH: 1,
        USD: Number((1 / usdUah).toFixed(8)),
        EUR: Number((1 / eurUah).toFixed(8))
      },
      updatedAt: Date.now()
    };

    console.log(
      `💱 Курсы НБУ: 1 USD = ${usdUah} UAH, 1 EUR = ${eurUah} UAH`
    );

    console.log(
      "💱 Внутренние курсы проекта:",
      exchangeRates.rates
    );
  } catch (e) {
    console.error("❌ Ошибка загрузки курсов НБУ:", e.message);
  }
}

function calcGrossFromNet(net){
  const feeK = Number(adminSettings.marketplaceFeePercent ?? 10) / 100;
  return roundMoney(net * (1 + feeK));
}

function calcFee(gross, net){
  return roundMoney(gross - net); // комиссия маркетплейса
}

const APP_URL = String(process.env.APP_URL || "https://typlace.com")
  .trim()
  .replace(/\/+$/, "");

function getUserNotifyLang(user) {
  return normalizeLang(user?.lang || DEFAULT_LANG);
}

function trimNotifyText(value, maxLen = 180) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function buildAppUrl(pathname = "/") {
  const safePath = String(pathname || "/");
  return `${APP_URL}${safePath.startsWith("/") ? safePath : `/${safePath}`}`;
}

function joinNotifyLines(lines) {
  return lines.filter(Boolean).join("\n");
}

function buildNotificationMessage(type, payload = {}, lang = DEFAULT_LANG) {
  const safeLang = normalizeLang(lang);

  const brand = tLang(safeLang, "notifications.brand");
  const userFallback = tLang(safeLang, "notifications.userFallback");
  const manageHint = tLang(safeLang, "notifications.manageHint");

  switch (type) {
    case "chat_new_message": {
      const preview = trimNotifyText(payload.preview);

      return {
        subject: `${brand} — ${tLang(safeLang, "notifications.chat.subject")}`,
        text: joinNotifyLines([
          brand,
          "",
          tLang(safeLang, "notifications.chat.title"),
          `${tLang(safeLang, "notifications.chat.fromLabel")}: ${payload.senderName || userFallback}`,
          preview ? `${tLang(safeLang, "notifications.chat.messageLabel")}: ${preview}` : "",
          `${tLang(safeLang, "notifications.chat.openLabel")}: ${buildAppUrl(`/chats.html?chat=${encodeURIComponent(payload.chatId || "")}`)}`,
          "",
          manageHint
        ])
      };
    }

    case "official_message": {
      const preview = trimNotifyText(payload.text, 500);

      return {
        subject: `${brand} — ${tLang(safeLang, "notifications.official.subject")}`,
        text: joinNotifyLines([
          brand,
          "",
          tLang(safeLang, "notifications.official.title"),
          preview,
          `${tLang(safeLang, "notifications.official.openLabel")}: ${buildAppUrl("/chats.html")}`,
          "",
          manageHint
        ])
      };
    }

    case "support_ticket_created": {
      return {
        subject: `${brand} — ${tLang(safeLang, "notifications.supportCreated.subject")}`,
        text: joinNotifyLines([
          brand,
          "",
          tLang(safeLang, "notifications.supportCreated.title"),
          `${tLang(safeLang, "notifications.supportCreated.ticketLabel")}: #${payload.ticketShortId || ""}`,
          payload.subject
            ? `${tLang(safeLang, "notifications.supportCreated.subjectLabel")}: ${payload.subject}`
            : "",
          `${tLang(safeLang, "notifications.supportCreated.openLabel")}: ${buildAppUrl("/help.html")}`,
          "",
          manageHint
        ])
      };
    }

    case "support_new_reply": {
      const preview = trimNotifyText(payload.preview);

      return {
        subject: `${brand} — ${tLang(safeLang, "notifications.supportReply.subject")}`,
        text: joinNotifyLines([
          brand,
          "",
          tLang(safeLang, "notifications.supportReply.title"),
          `${tLang(safeLang, "notifications.supportReply.ticketLabel")}: #${payload.ticketShortId || ""}`,
          payload.subject
            ? `${tLang(safeLang, "notifications.supportReply.subjectLabel")}: ${payload.subject}`
            : "",
          preview
            ? `${tLang(safeLang, "notifications.supportReply.messageLabel")}: ${preview}`
            : "",
          `${tLang(safeLang, "notifications.supportReply.openLabel")}: ${buildAppUrl("/help.html")}`,
          "",
          manageHint
        ])
      };
    }

    case "support_new_user_message": {
      const preview = trimNotifyText(payload.preview);

      return {
        subject: `${brand} — ${tLang(safeLang, "notifications.supportUserMessage.subject")}`,
        text: joinNotifyLines([
          brand,
          "",
          tLang(safeLang, "notifications.supportUserMessage.title"),
          `${tLang(safeLang, "notifications.supportUserMessage.ticketLabel")}: #${payload.ticketShortId || ""}`,
          payload.subject
            ? `${tLang(safeLang, "notifications.supportUserMessage.subjectLabel")}: ${payload.subject}`
            : "",
          payload.senderName
            ? `${tLang(safeLang, "notifications.supportUserMessage.fromLabel")}: ${payload.senderName}`
            : "",
          preview
            ? `${tLang(safeLang, "notifications.supportUserMessage.messageLabel")}: ${preview}`
            : "",
          `${tLang(safeLang, "notifications.supportUserMessage.openLabel")}: ${buildAppUrl("/support.html")}`,
          "",
          manageHint
        ])
      };
    }

    case "support_ticket_closed": {
      return {
        subject: `${brand} — ${tLang(safeLang, "notifications.supportClosed.subject")}`,
        text: joinNotifyLines([
          brand,
          "",
          tLang(safeLang, "notifications.supportClosed.title"),
          `${tLang(safeLang, "notifications.supportClosed.ticketLabel")}: #${payload.ticketShortId || ""}`,
          payload.subject
            ? `${tLang(safeLang, "notifications.supportClosed.subjectLabel")}: ${payload.subject}`
            : "",
          `${tLang(safeLang, "notifications.supportClosed.openLabel")}: ${buildAppUrl("/help.html")}`,
          "",
          manageHint
        ])
      };
    }

    default:
      return null;
  }
}

function notifyUser(user, type, payload = {}) {
  if (!user || !user.notify) return;

  const lang = getUserNotifyLang(user);
  const built = buildNotificationMessage(type, payload, lang);
  if (!built) return;

  sendNotification(user, {
    type,
    subject: built.subject,
    text: built.text
  });
}

function sendNotification(user, { type, subject, text }) {
  if (!user || !user.notify) return;

  const safeSubject = String(
    subject || `${tUser(user, "notifications.brand")} — ${tUser(user, "notifications.defaultSubjectSuffix")}`
  ).trim();

  const safeText = String(text || "").trim();
  if (!safeText) return;

  if (user.notify.email && MAIL_USER && MAIL_PASS) {
    transporter.sendMail({
      from: MAIL_USER,
      to: user.email,
      subject: safeSubject,
      text: safeText
    }).catch(() => {});
  }

  if (user.notify.telegram && user.telegramChatId) {
    sendTelegramMessage(user.telegramChatId, safeText).catch(() => {});
  }
}

function genCode6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function now() {
  return Date.now();
}
function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function generateUserId() {
  let id;
  let exists = true;

  while (exists) {
    id = Math.floor(10000000 + Math.random() * 90000000).toString();
    exists = Array.from(users.values()).some(u => u.userId === id);
  }

  return id;
}

async function generateOfferId() {
  let id;
  let exists = true;

  while (exists) {
    id = Math.floor(10000000 + Math.random() * 90000000).toString();

    const dbOffer = await prisma.offer.findUnique({
      where: { offerId: id },
      select: { id: true }
    });

    exists = Boolean(dbOffer);
  }

  return id;
}

function generateOrderCode(){
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  let exists = true;

  while(exists){
    code = "#";

    for(let i = 0; i < 7; i++){
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    exists = orders.some(o => o.orderNumber === code);
  }

  return code;
}

function buildOfferSnapshot(offer, orderLang = DEFAULT_LANG) {
  if (!offer) return null;

  const safeOrderLang = normalizeLang(orderLang);

  return {
    id: offer.id,
    offerId: offer.offerId || null,
    game: offer.game || "",
    mode: offer.mode || "",
    category: offer.category || null,
    orderLang: safeOrderLang,
    title: offer.title || { ru: "", uk: "", en: "" },
    description: offer.description || { ru: "", uk: "", en: "" },
    images: Array.isArray(offer.images) ? offer.images : [],
    imageUrl: offer.imageUrl || null,
    price: Number(offer.price || 0),
    priceNet: Number(offer.priceNet || 0),
    amount: offer.amount == null ? null : Number(offer.amount),
    sellerEmail: offer.sellerEmail || "",
    sellerName: offer.sellerName || "",
    createdAt: offer.createdAt || Date.now()
  };
}

function extractPrefixedDigits(value, prefix) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";

  if (raw.startsWith(prefix + ":")) {
    return raw.slice(prefix.length + 1).replace(/\D/g, "").slice(0, 8);
  }

  return raw.replace(/\D/g, "").slice(0, 8);
}

function formatPrefixedId(value, prefix) {
  const digits = extractPrefixedDigits(value, prefix);
  return digits ? `${prefix}:${digits}` : "";
}

function normalizeOrderLookup(value) {
  let raw = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return "";

  raw = raw.replace(/[^A-Z0-9#]/g, "");

  if (raw && raw[0] !== "#") {
    raw = "#" + raw.replace(/#/g, "");
  }

  return raw.slice(0, 8);
}

function normalizeLang(value) {
  const lang = String(value || "").trim().toLowerCase();
  return SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
}

function parseBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function cleanOfferText(value, maxLen) {
  return String(value || "").trim().slice(0, maxLen);
}

function getRequiredOfferLangs(interfaceLang) {
  const lang = normalizeLang(interfaceLang);

  if (lang === "ru") return ["ru", "uk"];
  if (lang === "uk") return ["uk", "ru"];
  return ["en"];
}

function getLangLabel(lang, uiLang = DEFAULT_LANG) {
  const safeLang = normalizeLang(lang);
  const safeUiLang = normalizeLang(uiLang);

  return tLang(safeUiLang, `common.languageNames.${safeLang}`);
}

function validateOfferTranslations({ interfaceLang, title, description }) {
  const safeUiLang = normalizeLang(interfaceLang);
  const requiredLangs = getRequiredOfferLangs(safeUiLang);

  for (const lang of requiredLangs) {
    const titleValue = String(title?.[lang] || "").trim();
    const descValue = String(description?.[lang] || "").trim();
    const langLabel = getLangLabel(lang, safeUiLang);

    if (!titleValue) {
      return {
        success: false,
        message: "responses.offers.fillTitleForLanguage",
        messageParams: { language: langLabel }
      };
    }

    if (!descValue) {
      return {
        success: false,
        message: "responses.offers.fillDescriptionForLanguage",
        messageParams: { language: langLabel }
      };
    }
  }

  return { success: true };
}

function hasOfferLangContent(offer, lang) {
  const titleValue = String(offer?.title?.[lang] || "").trim();
  const descValue = String(offer?.description?.[lang] || "").trim();

  return Boolean(titleValue && descValue);
}

function isEmailValid(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_ALLOWED_REGEX = /^[A-Za-z0-9_.]+$/;

const RESERVED_USERNAMES = new Set(
  String(process.env.RESERVED_USERNAMES || "admin,support,moderator,system,typlace")
    .split(",")
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
);

function normalizeUsername(value) {
  return String(value || "").trim();
}

function usernameHasLetterOrDigit(value) {
  return /[A-Za-z0-9]/.test(String(value || ""));
}

function getUsernameValidationErrorKey(value) {
  const username = normalizeUsername(value);

  if (!username || username.length < USERNAME_MIN_LENGTH) {
    return "responses.auth.usernameTooShort";
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return "responses.auth.usernameTooLong";
  }

  if (!USERNAME_ALLOWED_REGEX.test(username)) {
    return "responses.auth.usernameInvalid";
  }

  if (!usernameHasLetterOrDigit(username)) {
    return "responses.auth.usernameLettersOrDigits";
  }

  if (RESERVED_USERNAMES.has(username.toLowerCase())) {
    return "responses.auth.usernameReserved";
  }

  return "";
}

function normalizeUsernameKey(value) {
  return normalizeUsername(value).toLowerCase();
}

async function findUserByUsernameNormalized(username, excludeEmail = "") {
  const usernameKey = normalizeUsernameKey(username);

  if (!usernameKey) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      usernameNormalized: usernameKey
    },
    select: {
      id: true,
      email: true,
      username: true
    }
  });

  if (!user) {
    return null;
  }

  if (excludeEmail && user.email === String(excludeEmail || "").trim().toLowerCase()) {
    return null;
  }

  return user;
}

async function sendCodeEmail(email, code, lang = DEFAULT_LANG) {
  const safeLang = normalizeLang(lang);

  const subject = tLang(safeLang, "email.authCode.subject");
  const text = tLang(safeLang, "email.authCode.text", { code });

  await transporter.sendMail({
    from: MAIL_USER,
    to: email,
    subject,
    text,
  });
}

function saveTelegramState() {
  writeJson(TELEGRAM_STATE_FILE, telegramState);
}

function isTelegramConfigured() {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_USERNAME);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanupExpiredTelegramLinkCodes() {
  const nowTime = Date.now();

  for (const [email, record] of telegramLinkCodes.entries()) {
    if (!record?.expiresAt || nowTime >= record.expiresAt) {
      telegramLinkCodes.delete(email);
    }
  }
}

function makeTelegramLinkCode() {
  return "tp_" + crypto.randomBytes(16).toString("hex");
}

function getTelegramLinkRecordByEmail(email) {
  cleanupExpiredTelegramLinkCodes();

  const record = telegramLinkCodes.get(email);
  if (!record) return null;

  if (Date.now() >= record.expiresAt) {
    telegramLinkCodes.delete(email);
    return null;
  }

  return record;
}

function createTelegramLinkRecord(email) {
  const existing = getTelegramLinkRecordByEmail(email);
  if (existing) return existing;

  const record = {
    code: makeTelegramLinkCode(),
    expiresAt: Date.now() + TELEGRAM_LINK_TTL_MS
  };

  telegramLinkCodes.set(email, record);
  return record;
}

function findTelegramLinkByCode(code) {
  cleanupExpiredTelegramLinkCodes();

  for (const [email, record] of telegramLinkCodes.entries()) {
    if (record.code === code) {
      return {
        email,
        ...record
      };
    }
  }

  return null;
}

async function findUserByTelegramChatId(chatId) {
  const safeChatId = String(chatId || "").trim();
  if (!safeChatId) return null;

  const dbUser = await prisma.user.findFirst({
    where: {
      telegramChatId: safeChatId
    }
  });

  if (!dbUser) return null;
  return syncUserToMap(dbUser);
}

async function telegramApi(method, payload = {}) {
  if (!isTelegramConfigured()) {
    throw new Error("Telegram bot is not configured");
  }

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error: ${method}`);
  }

  return data.result;
}

async function sendTelegramMessage(chatId, text) {
  if (!chatId) return;
  if (!text) return;

  await telegramApi("sendMessage", {
    chat_id: String(chatId),
    text: String(text),
    disable_web_page_preview: true
  });
}

async function handleTelegramStartCommand(message, payload) {
  const chatId = String(message.chat?.id || "");
  const from = message.from || {};

  if (!chatId) return;

  if (!payload) {
    await sendTelegramMessage(
      chatId,
      tDefault("telegram.start.connected")
    );
    return;
  }

  const linkRecord = findTelegramLinkByCode(payload);

  if (!linkRecord) {
    await sendTelegramMessage(
      chatId,
      tDefault("telegram.start.invalidLink")
    );
    return;
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: linkRecord.email }
  });

  if (!dbUser) {
    telegramLinkCodes.delete(linkRecord.email);

    await sendTelegramMessage(
      chatId,
      tDefault("telegram.start.userNotFound")
    );
    return;
  }

  const safeLang = normalizeLang(dbUser.lang || DEFAULT_LANG);
  const alreadyLinkedUser = await findUserByTelegramChatId(chatId);

  if (alreadyLinkedUser && alreadyLinkedUser.email !== dbUser.email) {
    await sendTelegramMessage(
      chatId,
      tLang(safeLang, "telegram.start.alreadyLinked")
    );
    return;
  }

  const updatedUser = await prisma.user.update({
    where: { email: dbUser.email },
    data: {
      telegramChatId: chatId,
      telegramUsername: from.username ? String(from.username) : "",
      telegramFirstName: from.first_name ? String(from.first_name) : "",
      telegramLinkedAt: new Date(),
      notifyTelegram: true
    }
  });

  syncUserToMap(updatedUser);
  telegramLinkCodes.delete(linkRecord.email);

  await sendTelegramMessage(
    chatId,
    tLang(safeLang, "telegram.start.success")
  );
}

async function handleTelegramUpdate(update) {
  const message = update?.message;
  if (!message) return;

  const text = String(message.text || "").trim();

  if (text.startsWith("/start")) {
    const payload = text.split(/\s+/).slice(1).join(" ").trim();
    await handleTelegramStartCommand(message, payload);
  }
}

async function pollTelegramUpdatesLoop() {
  while (true) {
    try {
      const updates = await telegramApi("getUpdates", {
        offset: telegramState.offset,
        timeout: TELEGRAM_POLL_TIMEOUT_SEC,
        allowed_updates: ["message"]
      });

      for (const update of updates) {
        await handleTelegramUpdate(update);

        const nextOffset = Number(update.update_id || 0) + 1;
        if (nextOffset > telegramState.offset) {
          telegramState.offset = nextOffset;
        }
      }

      if (Array.isArray(updates) && updates.length > 0) {
        saveTelegramState();
      }
    } catch (e) {
      console.log("telegram polling error:", e.message);
      await delay(3000);
    }
  }
}

function startTelegramPolling() {
  if (!isTelegramConfigured()) {
    console.log("ℹ️ Telegram не настроен: TELEGRAM_BOT_TOKEN или TELEGRAM_BOT_USERNAME отсутствует");
    return;
  }

  if (telegramPollingStarted) return;

  telegramPollingStarted = true;
  console.log(`🤖 Telegram polling started: @${TELEGRAM_BOT_USERNAME}`);

  pollTelegramUpdatesLoop().catch(err => {
    telegramPollingStarted = false;
    console.log("telegram polling fatal error:", err.message);
  });
}

/* ================== AUTH MIDDLEWARE ================== */
function getToken(req) {
  const auth = String(req.headers.authorization || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return "";
}

async function authRequired(req, res, next) {
  try {
    const token = getToken(req);

    if (!token) {
      return res.status(401).json({ success: false, message: "responses.auth.noToken" });
    }

    let s = sessions.get(token);

    if (!s) {
      const dbSession = await prisma.session.findUnique({
        where: { token },
        include: { user: true }
      });

      if (!dbSession) {
        return res.status(401).json({ success: false, message: "responses.auth.sessionNotFound" });
      }

      s = dbSessionToLegacy(dbSession);
      sessions.set(token, s);

      if (dbSession.user) {
        syncUserToMap(dbSession.user);
      }
    }

if (now() > s.expiresAt) {
  disconnectSocketsForToken(token);
  sessions.delete(token);

  await prisma.session.deleteMany({
    where: { token }
  });

  return res.status(401).json({ success: false, message: "responses.auth.sessionExpired" });
}

    let u = users.get(s.email);

    if (!u) {
      const dbUser = await prisma.user.findUnique({
        where: { email: s.email }
      });

      if (!dbUser) {
        return res.status(401).json({
          success: false,
          message: "responses.common.userNotFound"
        });
      }

      u = syncUserToMap(dbUser);
    }

if (u.banned) {
  disconnectSocketsForToken(token);
  sessions.delete(token);

  await prisma.session.deleteMany({
    where: { token }
  });

  return res.status(403).json({
    success: false,
    message: "responses.auth.accountBanned"
  });
}

u.lastSeen = Date.now();

const isActuallyOnline = socketIdsByEmail.has(u.email);

u.online = isActuallyOnline;

prisma.user.update({
  where: { email: u.email },
  data: {
    online: isActuallyOnline,
    lastSeenAt: new Date(u.lastSeen)
  }
}).catch(err => {
  console.error("authRequired user.update error:", err.message);
});

    req.userEmail = s.email;
    req.user = u;
    req.token = token;

    next();
  } catch (e) {
    console.error("authRequired error:", e);
    return res.status(500).json({
      success: false,
      message: "responses.auth.internalError"
    });
  }
}

function supportRequired(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "responses.common.noAccess" });
  }

  if (!isSupportRole(req.user)) {
    return res.status(403).json({ success: false, message: "responses.support.onlySupport" });
  }

  next();
}

async function authRequiredOptional(req, res, next) {
  try {
    const token = getToken(req);

    if (!token) {
      req.user = null;
      return next();
    }

    let s = sessions.get(token);

    if (!s) {
      const dbSession = await prisma.session.findUnique({
        where: { token },
        include: { user: true }
      });

      if (!dbSession) {
        req.user = null;
        return next();
      }

      s = dbSessionToLegacy(dbSession);
      sessions.set(token, s);

      if (dbSession.user) {
        syncUserToMap(dbSession.user);
      }
    }

    if (Date.now() > s.expiresAt) {
      sessions.delete(token);

      await prisma.session.deleteMany({
        where: { token }
      });

      req.user = null;
      return next();
    }

    let u = users.get(s.email);

    if (!u) {
      const dbUser = await prisma.user.findUnique({
        where: { email: s.email }
      });

      if (!dbUser) {
        req.user = null;
        return next();
      }

      u = syncUserToMap(dbUser);
    }

    req.user = u;
    req.userEmail = u.email;

    return next();
  } catch (e) {
    console.error("authRequiredOptional error:", e);
    req.user = null;
    return next();
  }
}

/* ================== API ================== */

/**
 * POST /auth/request-code
 * body: { email, mode: "login" | "register", username?: string }
 */
app.post("/auth/request-code", authRequestCodeLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const mode = String(req.body.mode || "").trim();
    const username = normalizeUsername(req.body.username);

if (TURNSTILE_ENABLED) {
  const host = String(req.hostname || "").trim().toLowerCase();
  const ip = String(req.ip || "").trim();

  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.");

  const token = String(req.body["cf-turnstile-response"] || "").trim();

  if (!isLocal) {
    if (!token || token === "dev") {
      return res.json({
        success: false,
        message: "responses.auth.turnstileRequired"
      });
    }

    try {
      const verifyRes = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            secret: process.env.TURNSTILE_SECRET,
            response: token,
            remoteip: req.ip
          })
        }
      );

      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        return res.json({
          success: false,
          message: "responses.auth.turnstileFailed"
        });
      }
    } catch (e) {
      return res.json({
        success: false,
        message: "responses.auth.turnstileError"
      });
    }
  }
}

    if (!isEmailValid(email)) {
      return res.json({ success: false, message: "responses.auth.enterValidEmail" });
    }

    if (mode !== "login" && mode !== "register") {
      return res.json({ success: false, message: "responses.auth.invalidMode" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    const userExists = Boolean(existingUser);

    if (mode === "login" && !userExists) {
      return res.json({
        success: false,
        message: "responses.auth.accountNotFoundGoRegister"
      });
    }

if (mode === "register") {
  if (userExists) {
    return res.json({
      success: false,
      message: "responses.auth.emailAlreadyRegisteredGoLogin"
    });
  }

  const usernameErrorKey = getUsernameValidationErrorKey(username);

  if (usernameErrorKey) {
    return res.json({
      success: false,
      message: usernameErrorKey
    });
  }

const existingUsernameUser = await findUserByUsernameNormalized(username);

  if (existingUsernameUser) {
    return res.json({
      success: false,
      message: "responses.auth.usernameAlreadyTaken"
    });
  }
}

    const existingCode = await prisma.pendingCode.findUnique({
      where: { email }
    });

    if (
      existingCode &&
      existingCode.lastSentAt &&
      now() - existingCode.lastSentAt.getTime() < 30_000
    ) {
      const wait = Math.ceil(
        (30_000 - (now() - existingCode.lastSentAt.getTime())) / 1000
      );

return res.json({
  success: false,
  message: "responses.auth.waitBeforeRetry",
  messageParams: { seconds: wait }
});
    }

    const code = genCode6();

    const savedCode = await prisma.pendingCode.upsert({
      where: { email },
      update: {
        code,
        mode,
        tempUsername: mode === "register" ? username : "",
        expiresAt: new Date(now() + 10 * 60 * 1000),
        lastSentAt: new Date(),
        tries: 0,
        userId: existingUser?.id || null
      },
      create: {
        email,
        code,
        mode,
        tempUsername: mode === "register" ? username : "",
        expiresAt: new Date(now() + 10 * 60 * 1000),
        lastSentAt: new Date(),
        tries: 0,
        userId: existingUser?.id || null
      }
    });

    pendingCodes.set(email, dbPendingCodeToLegacy(savedCode));

    await sendCodeEmail(email, code, getRequestLang(req));

    return res.json({ success: true, message: "responses.auth.codeSent" });
  } catch (e) {
    console.log("request-code error:", e);
    return res.json({ success: false, message: "responses.auth.codeSendError" });
  }
});

/**
 * POST /auth/verify-code
 * body: { email, code, mode: "login"|"register" }
 */
app.post("/auth/verify-code", authVerifyCodeLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const mode = String(req.body.mode || "").trim();
    const lang = normalizeLang(req.body.lang || "ru");

    if (!isEmailValid(email)) {
      return res.json({ success: false, message: "responses.auth.invalidEmail" });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.json({ success: false, message: "responses.auth.codeMustBeSixDigits" });
    }

    if (mode !== "login" && mode !== "register") {
      return res.json({ success: false, message: "responses.auth.invalidMode" });
    }

    const rec = await prisma.pendingCode.findUnique({
      where: { email }
    });

    if (!rec) {
      return res.json({
        success: false,
        message: "responses.auth.requestCodeFirst"
      });
    }

    if (rec.mode !== mode) {
      return res.json({
        success: false,
        message: "responses.auth.codeSentForAnotherAction"
      });
    }

    if (now() > rec.expiresAt.getTime()) {
      await prisma.pendingCode.deleteMany({
        where: { email }
      });

      pendingCodes.delete(email);

      return res.json({
        success: false,
        message: "responses.auth.codeExpired"
      });
    }

    const nextTries = Number(rec.tries || 0) + 1;

    if (rec.code !== code) {
      if (nextTries > 7) {
        await prisma.pendingCode.deleteMany({
          where: { email }
        });

        pendingCodes.delete(email);

        return res.json({
          success: false,
          message: "responses.auth.tooManyAttempts"
        });
      }

      const updatedCode = await prisma.pendingCode.update({
        where: { email },
        data: {
          tries: nextTries
        }
      });

      pendingCodes.set(email, dbPendingCodeToLegacy(updatedCode));

      return res.json({ success: false, message: "responses.auth.invalidCode" });
    }

    await prisma.pendingCode.deleteMany({
      where: { email }
    });

    pendingCodes.delete(email);

    let dbUser = null;

    if (mode === "register") {
      const alreadyExists = await prisma.user.findUnique({
        where: { email },
        select: { id: true }
      });

      if (alreadyExists) {
        return res.json({
          success: false,
          message: "responses.auth.emailAlreadyRegisteredGoLogin"
        });
      }

const username = normalizeUsername(rec.tempUsername);
const usernameErrorKey = getUsernameValidationErrorKey(username);

if (usernameErrorKey) {
  return res.json({
    success: false,
    message: usernameErrorKey
  });
}

const existingUsernameUser = await findUserByUsernameNormalized(username);

if (existingUsernameUser) {
  return res.json({
    success: false,
    message: "responses.auth.usernameAlreadyTaken"
  });
}

const userId = await generateUniqueUserIdForDb();

dbUser = await prisma.user.create({
  data: {
    email,
    username,
    usernameNormalized: normalizeUsernameKey(username),
    userId,
    avatarDataUrl: "",
    avatarUrl: "",
    online: false,
    lastSeenAt: new Date(),
    banned: false,
    role: SUPER_ADMIN_EMAILS.includes(email)
      ? ROLE.SUPER_ADMIN
      : ROLE.USER,
    verified: false,
    blockedUsers: [],
    notifySite: true,
    notifyEmail: true,
    notifyTelegram: false,
    telegramChatId: null,
    telegramUsername: "",
    telegramFirstName: "",
    lang
  }
});

      syncUserToMap(dbUser);

try {
  await sendOfficialNoticeToUser({
    userEmail: email,
    text: getOfficialWelcomeMessage(lang),
    officialType: "welcome",
    actor: {
      email: OFFICIAL_ACCOUNT.email,
      userId: OFFICIAL_ACCOUNT.userId,
      username: OFFICIAL_ACCOUNT.username,
      role: OFFICIAL_ACCOUNT.role,
      verified: true
    }
  });
} catch (e) {
  console.log("official welcome message error:", e.message);
}
    } else {
      dbUser = await prisma.user.findUnique({
        where: { email }
      });

      if (!dbUser) {
        return res.json({
          success: false,
          message: "responses.auth.accountNotFoundGoRegister"
        });
      }

      syncUserToMap(dbUser);
    }

    const token = makeToken();
    const expiresAt = new Date(
      now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    );

    const dbSession = await prisma.session.create({
      data: {
        token,
        email,
        expiresAt,
        userId: dbUser.id
      }
    });

    sessions.set(token, dbSessionToLegacy(dbSession));

    const u = users.get(email) || syncUserToMap(dbUser);

    return res.json({
      success: true,
      token,
      user: {
        email: u.email,
        username: u.username,
        avatarDataUrl: u.avatarDataUrl || "",
        avatarUrl: u.avatarUrl || ""
      }
    });
  } catch (e) {
    console.log("verify-code error:", e);
    return res.json({
      success: false,
      message: "responses.auth.verifyCodeError"
    });
  }
});

/**
 * GET /auth/me (проверка токена)
 * header: Authorization: Bearer <token>
 */
app.get("/auth/me", authRequired, (req, res) => {
  const u = req.user;

  return res.json({
    success: true,
    user: {
      email: u.email,
      username: u.username,
      userId: u.userId || null,
      avatarDataUrl: u.avatarDataUrl || "",
      avatarUrl: u.avatarUrl || "",
      createdAt: u.createdAt || null,
      usernameChangedAt: u.usernameChangedAt || null,
      role: u.role || "user"
    }
  });
});

/**
 * POST /auth/logout
 * header: Authorization: Bearer <token>
 */
app.post("/auth/logout", authRequired, async (req, res) => {
  try {
    sessions.delete(req.token);

    await prisma.session.deleteMany({
      where: {
        token: req.token
      }
    });

    disconnectSocketsForToken(req.token);

    return res.json({ success: true });
  } catch (e) {
    console.error("logout error:", e);
    return res.json({
      success: false,
      message: "responses.auth.logoutError"
    });
  }
});

app.post("/api/official/messages", authRequired, async (req, res) => {
  if (!canWriteOfficial(req.user)) {
    return res.json({
      success: false,
      message: "responses.common.noAccess"
    });
  }

  const userEmail = String(req.body.userEmail || "").trim().toLowerCase();
  const text = String(req.body.text || "").trim();
  const officialType = String(req.body.officialType || "notice").trim();

  if (!userEmail || !users.has(userEmail)) {
    return res.json({
      success: false,
      message: "responses.common.userNotFound"
    });
  }

  if (!text) {
    return res.json({
      success: false,
      message: "responses.common.emptyMessage"
    });
  }

  const message = await sendOfficialNoticeToUser({
    userEmail,
    text,
    officialType,
    actor: req.user
  });

  if (!message) {
    return res.json({
      success: false,
      message: "responses.official.sendFailed"
    });
  }

addAdminLog({
  actor: req.user,
  action: "official_message",
  targetType: "user",
  targetId: userEmail,
  textKey: "adminLogs.officialMessage",
  textParams: { userEmail }
});

  return res.json({
    success: true,
    message
  });
});

app.post("/api/official/chat", authRequired, async (req, res) => {
  let chat = await getOrCreateOfficialChat(req.user.email);

  if (!chat) {
    return res.json({
      success: false,
      message: "responses.official.chatCreateFailed"
    });
  }

  if (Array.isArray(chat.deletedBy) && chat.deletedBy.includes(req.user.email)) {
    chat = await updateDbChatRecord(chat.id, {
      deletedBy: chat.deletedBy.filter(email => email !== req.user.email)
    });
  }

  return res.json({
    success: true,
    chat: {
      ...chat,
otherUser: buildPublicUserPayload(
  getUserByEmailSafe(OFFICIAL_ACCOUNT.email),
  getRequestLang(req)
)
    }
  });
});

app.post("/api/official/chat/by-user", authRequired, async (req, res) => {
  if (!canWriteOfficial(req.user)) {
    return res.json({
      success: false,
      message: "responses.common.noAccess"
    });
  }

  const userEmail = String(req.body.userEmail || "").trim().toLowerCase();

  if (!userEmail || !users.has(userEmail)) {
    return res.json({
      success: false,
      message: "responses.common.userNotFound"
    });
  }

  let chat = await getOrCreateOfficialChat(userEmail);

  if (!chat) {
    return res.json({
      success: false,
      message: "responses.official.chatCreateFailed"
    });
  }

  if (Array.isArray(chat.deletedBy) && chat.deletedBy.includes(userEmail)) {
    chat = await updateDbChatRecord(chat.id, {
      deletedBy: chat.deletedBy.filter(email => email !== userEmail)
    });
  }

  return res.json({
    success: true,
    chat: {
      ...chat,
otherUser: buildPublicUserPayload(
  getUserByEmailSafe(userEmail),
  getRequestLang(req)
)
    }
  });
});

app.post("/api/official/chats/:id/messages", authRequired, async (req, res) => {
  let chat = chats.find(c => c.id === req.params.id);

  if (!chat || !isOfficialChat(chat)) {
    return res.json({
      success: false,
      message: "responses.official.chatNotFound"
    });
  }

  if (!canWriteOfficialFromStaffPanel(req.user, chat)) {
    return res.json({
      success: false,
      message: "responses.common.noAccess"
    });
  }

  const text = String(req.body.text || "").trim();
  const officialType = String(req.body.officialType || "notice").trim() || "notice";

  if (!text) {
    return res.json({
      success: false,
      message: "responses.common.emptyMessage"
    });
  }

  if (Array.isArray(chat.deletedBy) && chat.deletedBy.includes(chat.buyerEmail)) {
    chat = await updateDbChatRecord(chat.id, {
      deletedBy: chat.deletedBy.filter(email => email !== chat.buyerEmail)
    });
  }

  const message = await pushOfficialMessage({
    chatId: chat.id,
    text,
    officialType,
    actor: req.user
  });

addAdminLog({
  actor: req.user,
  action: "official_chat_message",
  targetType: "chat",
  targetId: chat.id,
  textKey: "adminLogs.officialChatMessage",
  textParams: { chatId: chat.id }
});

  return res.json({
    success: true,
    message
  });
});

app.get("/api/support/users/search", authRequired, (req, res) => {
  if (!canWriteOfficial(req.user)) {
    return res.json({
      success: false,
      message: "responses.common.noAccess"
    });
  }

  const q = String(req.query.q || "").trim().toLowerCase();

  if (!q) {
    return res.json({
      success: true,
      users: []
    });
  }

  const list = Array.from(users.values())
    .filter(u =>
      String(u.email || "").toLowerCase().includes(q) ||
      String(u.username || "").toLowerCase().includes(q) ||
      String(u.userId || "").toLowerCase().includes(q)
    )
    .slice(0, 20)
    .map(u => ({
      email: u.email,
      username: u.username || tReq(req, "common.userFallback"),
      userId: u.userId || null,
      role: u.role || ROLE.USER,
      banned: Boolean(u.banned),
      verified: Boolean(u.verified),
      avatarUrl: u.avatarUrl || null,
      avatarDataUrl: u.avatarDataUrl || null,
      createdAt: u.createdAt || null
    }));

  return res.json({
    success: true,
    users: list
  });
});

// Назначить роль пользователю (только admin)

app.post("/api/admin/set-role", authRequired, async (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success: false, message: "responses.common.noAccess" });
  }

  const email = String(req.body.email || "").trim().toLowerCase();
  const role = String(req.body.role || "").trim();

  const target = users.get(email);
  if (!target) {
    return res.json({ success: false, message: "responses.common.userNotFound" });
  }

  if (!Object.values(ROLE).includes(role)) {
    return res.json({ success: false, message: "responses.admin.invalidRole" });
  }

  if (!canSetRole(req.user, target, role)) {
    return res.json({
      success: false,
      message: "responses.admin.cannotChangeToThisRole"
    });
  }

  const oldRole = target.role || ROLE.USER;
  const updatedTarget = await updateDbUserRecord(target.email, { role });

addAdminLog({
  actor: req.user,
  action: "set_role",
  targetType: "user",
  targetId: updatedTarget.userId || updatedTarget.email,
  textKey: "adminLogs.setRole",
  textParams: {
    target: updatedTarget.username || updatedTarget.email,
    oldRole,
    newRole: role
  }
});

  res.json({
    success: true,
    user: {
      email: updatedTarget.email,
      username: updatedTarget.username,
      userId: updatedTarget.userId || null,
      role: updatedTarget.role || ROLE.USER
    }
  });
});

/**
 * PUT /profile (обновление профиля)
 * header: Authorization: Bearer <token>
 * body: { username?, avatarUrl?, avatarDataUrl? }
 */
app.put("/profile", authRequired, async (req, res) => {
  try {
    const u = req.user;

    const username =
      typeof req.body.username === "string"
        ? req.body.username.trim()
        : "";

    const avatarUrl =
      typeof req.body.avatarUrl === "string"
        ? req.body.avatarUrl.trim()
        : "";

    const avatarDataUrl =
      typeof req.body.avatarDataUrl === "string"
        ? req.body.avatarDataUrl.trim()
        : "";

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const data = {};

const normalizedUsername = normalizeUsername(username);

if (normalizedUsername && normalizedUsername !== u.username) {
  const usernameErrorKey = getUsernameValidationErrorKey(normalizedUsername);

  if (usernameErrorKey) {
    return res.json({
      success: false,
      code: "USERNAME_INVALID",
      message: usernameErrorKey
    });
  }

const existingUsernameUser = await findUserByUsernameNormalized(
  normalizedUsername,
  u.email
);

  if (existingUsernameUser) {
    return res.json({
      success: false,
      code: "USERNAME_ALREADY_TAKEN",
      message: "responses.auth.usernameAlreadyTaken"
    });
  }

  const lastChangedAt = Number(u.usernameChangedAt || 0);
  const nextUsernameChangeAt = lastChangedAt
    ? lastChangedAt + THIRTY_DAYS_MS
    : 0;

  if (nextUsernameChangeAt && Date.now() < nextUsernameChangeAt) {
    return res.json({
      success: false,
      code: "USERNAME_CHANGE_TOO_EARLY",
      message: "responses.profile.usernameChangeTooEarly",
      nextUsernameChangeAt
    });
  }

data.username = normalizedUsername;
data.usernameNormalized = normalizeUsernameKey(normalizedUsername);
data.usernameChangedAt = new Date();
}

    if (avatarUrl) {
      data.avatarUrl = avatarUrl;
      data.avatarDataUrl = "";
    } else if (avatarDataUrl) {
      data.avatarDataUrl = avatarDataUrl;
      data.avatarUrl = "";
    }

    if (Object.keys(data).length === 0) {
      return res.json({
        success: true,
        user: {
          email: u.email,
          username: u.username,
          userId: u.userId || null,
          avatarDataUrl: u.avatarDataUrl || "",
          avatarUrl: u.avatarUrl || "",
          createdAt: u.createdAt || null,
          usernameChangedAt: u.usernameChangedAt || null
        }
      });
    }

    const updatedUser = await prisma.user.update({
      where: { email: u.email },
      data
    });

    const syncedUser = syncUserToMap(updatedUser);

    return res.json({
      success: true,
      user: {
        email: syncedUser.email,
        username: syncedUser.username,
        userId: syncedUser.userId || null,
        avatarDataUrl: syncedUser.avatarDataUrl || "",
        avatarUrl: syncedUser.avatarUrl || "",
        createdAt: syncedUser.createdAt || null,
        usernameChangedAt: syncedUser.usernameChangedAt || null
      }
    });
  } catch (e) {
    console.error("PUT /profile error:", e);
    return res.json({
      success: false,
      message: "responses.profile.updateFailed"
    });
  }
});

/**
 * GET /api/settings/notifications
 */
app.get("/api/settings/notifications", authRequired, async (req, res) => {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { email: req.user.email }
    });

    if (!dbUser) {
      return res.json({
        success: false,
        message: "responses.common.userNotFound"
      });
    }

    const user = syncUserToMap(dbUser);

    return res.json({
      success: true,
      notify: user.notify,
      telegramLinked: Boolean(user.telegramChatId),
      telegramUsername: user.telegramUsername || "",
      telegramBotUsername: TELEGRAM_BOT_USERNAME || ""
    });
  } catch (e) {
    console.error("GET /api/settings/notifications error:", e);
    return res.json({
      success: false,
      message: "responses.settings.notificationsLoadFailed"
    });
  }
});

/**
 * PUT /api/settings/notifications
 * body: { site?, email?, telegram? }
 */
app.put("/api/settings/notifications", authRequired, async (req, res) => {
  try {
    const { site, email, telegram } = req.body;

    const dbUser = await prisma.user.findUnique({
      where: { email: req.user.email }
    });

    if (!dbUser) {
      return res.json({
        success: false,
        message: "responses.common.userNotFound"
      });
    }

    if (typeof telegram === "boolean" && telegram && !dbUser.telegramChatId) {
      return res.json({
        success: false,
        code: "TELEGRAM_NOT_LINKED",
        message: "responses.settings.telegramLinkFirst"
      });
    }

    const data = {};

    if (typeof site === "boolean") {
      data.notifySite = site;
    }

    if (typeof email === "boolean") {
      data.notifyEmail = email;
    }

    if (typeof telegram === "boolean") {
      data.notifyTelegram = telegram;
    }

    const updatedUser = await prisma.user.update({
      where: { email: req.user.email },
      data
    });

    const user = syncUserToMap(updatedUser);

    return res.json({
      success: true,
      notify: user.notify,
      telegramLinked: Boolean(user.telegramChatId),
      telegramUsername: user.telegramUsername || "",
      telegramBotUsername: TELEGRAM_BOT_USERNAME || ""
    });
  } catch (e) {
    console.error("PUT /api/settings/notifications error:", e);
    return res.json({
      success: false,
      message: "responses.settings.notificationsSaveFailed"
    });
  }
});

app.post("/api/settings/telegram/link", authRequired, (req, res) => {
  if (!isTelegramConfigured()) {
    return res.json({
      success: false,
      message: "responses.settings.telegramNotConfigured"
    });
  }

  const existingRecord = createTelegramLinkRecord(req.user.email);

  return res.json({
    success: true,
    linked: Boolean(req.user.telegramChatId),
    telegramUsername: req.user.telegramUsername || "",
    botUsername: TELEGRAM_BOT_USERNAME,
    url: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${existingRecord.code}`,
    expiresInMs: Math.max(0, existingRecord.expiresAt - Date.now())
  });
});

app.post("/api/settings/telegram/unlink", authRequired, async (req, res) => {
  try {
    const updatedUser = await prisma.user.update({
      where: { email: req.user.email },
      data: {
        telegramChatId: null,
        telegramUsername: "",
        telegramFirstName: "",
        telegramLinkedAt: null,
        notifyTelegram: false
      }
    });

    const user = syncUserToMap(updatedUser);
    telegramLinkCodes.delete(req.user.email);

    return res.json({
      success: true,
      notify: user.notify
    });
  } catch (e) {
    console.error("POST /api/settings/telegram/unlink error:", e);
    return res.json({
      success: false,
      message: "responses.settings.telegramUnlinkFailed"
    });
  }
});

app.get("/api/rates", (req, res) => {
  res.json({
    success: true,
    base: exchangeRates.base,
    rates: exchangeRates.rates,
    updatedAt: exchangeRates.updatedAt
  });
});

app.get("/api/public/platform-capabilities", (req, res) => {
  res.json({
    success: true,
    capabilities: {
      paymentsEnabled: CHECKOUT_MODE === "live",
      cryptoEnabled: false,
      demoMode: CHECKOUT_MODE === "test",
      checkoutMode: CHECKOUT_MODE
    }
  });
});

app.get("/api/public/app-config", (req, res) => {
  res.json({
    success: true,
    config: {
      turnstileEnabled: TURNSTILE_ENABLED,
      turnstileSiteKey: TURNSTILE_SITE_KEY || ""
    }
  });
});

app.get("/api/public/platform-settings", (req, res) => {
  res.json({
    success: true,
    settings: {
      marketplaceFeePercent: Number(adminSettings.marketplaceFeePercent ?? 10),
      maintenanceText: String(adminSettings.maintenanceText ?? "")
    }
  });
});

/* ================== OFFERS ================== */
// мои офферы
app.get("/api/my-offers", authRequired, (req, res) => {
  const myOffers = offers.filter(o =>
    o.sellerEmail === req.user.email &&
    (o.status === "active" || o.status === "inactive" || o.status === "closed")
  );

  res.json({ success: true, offers: myOffers });
});
// активировать оффер
// ===== АКТИВИРОВАТЬ ОФФЕР =====
app.post("/api/offers/:id/activate", authRequired, async (req, res) => {
  const offer = offers.find(o => o.id === req.params.id);

  if (!offer) {
    return res.json({ success: false, message: "responses.offers.offerNotFound" });
  }

  if (offer.sellerEmail !== req.user.email) {
    return res.json({ success: false, message: "responses.common.noAccess" });
  }

  if (offer.status !== "inactive") {
    return res.json({
      success: false,
      message: "responses.offers.cannotActivate"
    });
  }

  const updatedOffer = await updateDbOfferRecord(offer.id, {
    status: "active",
    activeUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

  res.json({ success: true, offer: updatedOffer });
});

// ===== ДЕАКТИВИРОВАТЬ ОФФЕР =====
app.post("/api/offers/:id/deactivate", authRequired, async (req, res) => {
  const offer = offers.find(o => o.id === req.params.id);

  if (!offer) {
    return res.json({ success: false, message: "responses.offers.offerNotFound" });
  }

  if (offer.sellerEmail !== req.user.email) {
    return res.json({ success: false, message: "responses.common.noAccess" });
  }

  if (offer.status !== "active") {
    return res.json({
      success: false,
      message: "responses.offers.alreadyInactive"
    });
  }

  const updatedOffer = await updateDbOfferRecord(offer.id, {
    status: "inactive",
    activeUntil: null
  });

  res.json({ success: true, offer: updatedOffer });
});

// ===== КЛОНИРОВАТЬ ПРОДАННЫЙ ОФФЕР =====
app.post("/api/offers/:id/clone", authRequired, async (req, res) => {
  const oldOffer = offers.find(o => o.id === req.params.id);

  if (!oldOffer) {
    return res.json({
      success: false,
      message: "responses.offers.offerNotFound"
    });
  }

  if (oldOffer.sellerEmail !== req.user.email) {
    return res.json({
      success: false,
      message: "responses.common.noAccess"
    });
  }

  if (oldOffer.status !== "closed") {
    return res.json({
      success: false,
      message: "responses.offers.onlyClosedOfferCanBeCloned"
    });
  }

  try {
    // Сразу убираем старый оффер из "Проданных",
    // чтобы его нельзя было клонировать повторно
    await updateDbOfferRecord(oldOffer.id, {
      status: "relisted",
      activeUntil: null
    });

    const newOffer = await createDbOfferRecord({
      offerId: await generateOfferId(),
      game: oldOffer.game,
      mode: oldOffer.mode,
      category: oldOffer.category || null,
      title: oldOffer.title || { ru: "", uk: "", en: "" },
      description: oldOffer.description || { ru: "", uk: "", en: "" },
      extra: oldOffer.extra || {},
      priceNet: Number(oldOffer.priceNet || 0),
      price: Number(oldOffer.price || 0),
      amount: oldOffer.amount == null ? null : Number(oldOffer.amount),
      method: oldOffer.method || null,
      country: oldOffer.country || null,
      accountType: oldOffer.accountType || null,
      accountRegion: oldOffer.accountRegion || null,
      voiceChat:
        oldOffer.voiceChat == null
          ? null
          : Boolean(oldOffer.voiceChat),
      images: Array.isArray(oldOffer.images) ? [...oldOffer.images] : [],
      imageUrl: oldOffer.imageUrl || null,
      sellerEmail: oldOffer.sellerEmail,
      sellerName: oldOffer.sellerName,
      status: "active",
      createdAt: Date.now(),
      activeUntil: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      offer: newOffer
    });
  } catch (e) {
    console.error("clone offer error:", e);

    // если создание нового оффера не удалось —
    // возвращаем старый обратно в closed
    try {
      await updateDbOfferRecord(oldOffer.id, {
        status: "closed",
        activeUntil: null
      });
    } catch (restoreErr) {
      console.error("restore old offer after clone error:", restoreErr.message);
    }

    return res.status(500).json({
      success: false,
      message: "responses.common.internalError"
    });
  }
});

/* ================== CHATS ================== */

/**
 * POST /api/offers
 * создание объявления
 */
app.post("/api/offers", authRequired, uploadImages.array("images", 5), async (req, res) => {
  try {
    const {
      game,
      mode,
      price,
      amount,
      method,
      country,
      accountType,
      accountRegion,
      voiceChat,
      category,
      interfaceLang,

      title_ru,
      desc_ru,
      title_uk,
      desc_uk,
      title_en,
      desc_en
    } = req.body;

    let extra = {};

    Object.keys(req.body).forEach(key => {
      if (
        ![
          "game",
          "mode",
          "price",
          "amount",
          "method",
          "country",
          "accountType",
          "accountRegion",
          "voiceChat",
          "category",
          "interfaceLang",
          "title_ru",
          "desc_ru",
          "title_uk",
          "desc_uk",
          "title_en",
          "desc_en"
        ].includes(key)
      ) {
        extra[key] = req.body[key];
      }
    });

    if (!game || !mode || !price) {
      return res.json({ success: false, message: "responses.offers.requiredFields" });
    }

    const priceNumber = Number(price);

    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      return res.json({
        success: false,
        message: "responses.offers.invalidPrice"
      });
    }

    if (priceNumber < MIN_OFFER_PRICE) {
      return res.json({
        success: false,
        message: "responses.offers.minPrice",
messageParams: {
  price: MIN_OFFER_PRICE,
  currency: BASE_CURRENCY
}
      });
    }

    if (priceNumber > MAX_OFFER_PRICE) {
      return res.json({
        success: false,
        message: "responses.offers.maxPrice",
messageParams: {
  price: MAX_OFFER_PRICE,
  currency: BASE_CURRENCY
}
      });
    }

    const normalizedInterfaceLang = normalizeLang(interfaceLang);

    const title = {
      ru: cleanOfferText(title_ru, 70),
      uk: cleanOfferText(title_uk, 70),
      en: cleanOfferText(title_en, 70)
    };

    const description = {
      ru: cleanOfferText(desc_ru, 1000),
      uk: cleanOfferText(desc_uk, 1000),
      en: cleanOfferText(desc_en, 1000)
    };

    const translationValidation = validateOfferTranslations({
      interfaceLang: normalizedInterfaceLang,
      title,
      description
    });

    if (!translationValidation.success) {
      return res.json(translationValidation);
    }

    const priceNet = roundMoney(priceNumber);
    const priceGross = calcGrossFromNet(priceNet);

    let imageUrls = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const inputPath = file.path;

        const outputFilename =
          "optimized-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".jpg";

        const outputPath = path.join(__dirname, "uploads", outputFilename);

        await sharp(inputPath)
          .resize(600)
          .jpeg({ quality: 92 })
          .toFile(outputPath);

        fs.unlinkSync(inputPath);

        imageUrls.push("/uploads/" + outputFilename);
      }
    }

    const offer = await createDbOfferRecord({
      offerId: await generateOfferId(),
      game,
      mode,
      category: category || null,
      title,
      description,
      extra,
      priceNet,
      price: priceGross,
      amount: amount ? Number(amount) : null,
      method: method || null,
      country: country || null,
      accountType: accountType || null,
      accountRegion: accountRegion || null,
      voiceChat:
        voiceChat === "yes" ? true :
        voiceChat === "no" ? false :
        null,
      images: imageUrls,
      imageUrl: imageUrls[0] || null,
      sellerEmail: req.user.email,
      sellerName: req.user.username,
      status: "active",
      createdAt: Date.now(),
      activeUntil: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    return res.json({ success: true, offer });
  } catch (err) {
    console.error("Image processing error:", err);
    return res.json({
      success: false,
      message: "responses.offers.imageProcessingError"
    });
  }
});
/* ================== EDIT OFFER ================== */
app.put("/api/offers/:id", authRequired, uploadImages.array("images", 5), async (req, res) => {
  const offer = offers.find(o => o.id === req.params.id);
  if (!offer) {
    return res.json({ success:false, message:"responses.offers.offerNotFound" });
  }

  if (offer.sellerEmail !== req.user.email) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const {
    price,
    category,
    interfaceLang,
    title_ru,
    desc_ru,
    title_uk,
    desc_uk,
    title_en,
    desc_en
  } = req.body;

  const normalizedInterfaceLang = normalizeLang(interfaceLang);

  const title = {
    ru: cleanOfferText(title_ru, 70),
    uk: cleanOfferText(title_uk, 70),
    en: cleanOfferText(title_en, 70)
  };

  const description = {
    ru: cleanOfferText(desc_ru, 1000),
    uk: cleanOfferText(desc_uk, 1000),
    en: cleanOfferText(desc_en, 1000)
  };

  const translationValidation = validateOfferTranslations({
    interfaceLang: normalizedInterfaceLang,
    title,
    description
  });

  if (!translationValidation.success) {
    return res.json(translationValidation);
  }

  const updateData = {
    category: category || null,
    title,
    description
  };

  if (price !== undefined) {
    const net = roundMoney(Number(price));

    if (!Number.isFinite(net) || net <= 0) {
      return res.json({
        success: false,
        message: "responses.offers.invalidPrice"
      });
    }

    if (net < MIN_OFFER_PRICE) {
      return res.json({
        success: false,
        message: "responses.offers.minPrice",
messageParams: {
  price: MIN_OFFER_PRICE,
  currency: BASE_CURRENCY
}
      });
    }

    if (net > MAX_OFFER_PRICE) {
      return res.json({
        success: false,
        message: "responses.offers.maxPrice",
messageParams: {
  price: MAX_OFFER_PRICE,
  currency: BASE_CURRENCY
}
      });
    }

    updateData.priceNet = net;
    updateData.price = calcGrossFromNet(net);
  }

  const {
    amount,
    method,
    country,
    accountType,
    accountRegion,
    voiceChat
  } = req.body;

  if (amount !== undefined) {
    updateData.amount = amount ? Number(amount) : null;
  }

  if (method !== undefined) {
    updateData.method = method || null;
  }

  if (country !== undefined) {
    updateData.country = country || null;
  }

  if (accountType !== undefined) {
    updateData.accountType = accountType || null;
  }

  if (accountRegion !== undefined) {
    updateData.accountRegion = accountRegion || null;
  }

  if (voiceChat !== undefined) {
    updateData.voiceChat =
      voiceChat === "yes" ? true :
      voiceChat === "no" ? false :
      null;
  }

  const BASE_KEYS = [
    "game",
    "mode",
    "price",
    "amount",
    "method",
    "country",
    "accountType",
    "accountRegion",
    "voiceChat",
    "category",
    "interfaceLang",
    "title_ru",
    "desc_ru",
    "title_uk",
    "desc_uk",
    "title_en",
    "desc_en"
  ];

  let newExtra = {};

  Object.keys(req.body).forEach(key => {
    if (BASE_KEYS.includes(key)) return;
    newExtra[key] = req.body[key];
  });

  delete newExtra.game;
  delete newExtra.mode;
  delete newExtra.category;

  updateData.extra = newExtra;

  if (req.files && req.files.length > 0) {
    const imageUrls = [];

    for (const file of req.files) {
      const inputPath = file.path;
      const filename =
        "optimized-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".jpg";
      const outputPath = path.join(__dirname, "uploads", filename);

      await sharp(inputPath)
        .resize(600)
        .jpeg({ quality: 92 })
        .toFile(outputPath);

      fs.unlinkSync(inputPath);
      imageUrls.push("/uploads/" + filename);
    }

    updateData.images = imageUrls;
    updateData.imageUrl = imageUrls[0] || null;
  }

  const updatedOffer = await updateDbOfferRecord(offer.id, updateData);

  res.json({ success:true, offer: updatedOffer });
});

// 🗑️ УДАЛЕНИЕ ОФФЕРА
app.delete("/api/offers/:id", authRequired, async (req, res) => {
  const offer = offers.find(o => o.id === req.params.id);

  if (!offer) {
    return res.json({ success: false, message: "responses.offers.offerNotFound" });
  }

  if (offer.sellerEmail !== req.user.email) {
    return res.json({ success: false, message: "responses.common.noAccess" });
  }

  const updatedOffer = await updateDbOfferRecord(offer.id, {
    status: "deleted",
    activeUntil: null
  });

  res.json({ success: true, offer: updatedOffer });
});

/**
 * GET /api/offers
 * ?game=roblox&mode=Робуксы
 */
app.get("/api/offers", (req, res) => {
const {
  game,
  mode,
  category,
  method,
  country,
  search,
  priceMin,
  priceMax,
  amount,
  sort,
  accountType,
  accountRegion,
  voiceChat,
  lang
} = req.query;
// 🔥 безопасный язык
const langSafe =
  ["ru","uk","en"].includes(lang)
    ? lang
    : "ru";

// 1️⃣ базовый список
let result = offers.filter(o => o.status === "active");
// ===== LANGUAGE FILTER =====

result = result.filter(o => {
  if (o.mode === "robux") {
    return true;
  }

  return hasOfferLangContent(o, langSafe);
});

// 2️⃣ extra-фильтры (YouTube, TikTok и т.д.)
const extraFilters = { ...req.query };

[
  "game",
  "mode",
  "category",
  "method",
  "country",
  "search",
  "priceMin",
  "priceMax",
  "amount",
  "sort",
  "accountType",
  "accountRegion",
  "voiceChat",
  "lang"
].forEach(k => delete extraFilters[k]);

// применяем extra-фильтры
Object.entries(extraFilters).forEach(([key, value]) => {
  if (!value) return;

  result = result.filter(o =>
    o.extra &&
    String(o.extra[key]) === String(value)
  );
});

  // 🎮 Игра
  if (game) {
    result = result.filter(o => o.game === game);
  }

  // 🧩 Режим (Robux, Prime Gaming, Adopt Me и т.д.)
  if (mode) {
    result = result.filter(o => o.mode === mode);
  }

  // 🧩 КАТЕГОРИЯ
if (category) {
  result = result.filter(o => o.category === category);
}
// 👤 ACCOUNT FILTERS
if (mode === "accounts") {

  // Тип аккаунта (sale / rent)
  if (accountType) {
    result = result.filter(o => o.accountType === accountType);
  }

  // Регион аккаунта
  if (accountRegion) {
    result = result.filter(o => o.accountRegion === accountRegion);
  }

  // Voice Chat
if (voiceChat === "yes") {
  result = result.filter(o => o.voiceChat === true);
}

if (voiceChat === "no") {
  result = result.filter(o => o.voiceChat === false);
}
}
  // ⚙️ Способ получения
if (method) {
  result = result.filter(o => o.method === method);
}

// 🌍 Страна (Gift Card)
if (country) {
  result = result.filter(o => o.country === country);
}
// 🎯 ROBUX LOGIC
if (mode === "robux") {

  // ФИКСИРОВАННОЕ количество (official_store / gift_card)
  if (method === "official_store" || method === "gift_card") {
    if (req.query.amount) {
      result = result.filter(o => o.amount === Number(req.query.amount));
    }
  }

  // СВОБОДНОЕ количество (gamepass / private_server)
  // тут amount НЕ фильтр, а просто поле → ничего не делаем
}

  // 🔍 Поиск по названию / описанию
  if (search) {
  const q = search.toLowerCase();

  result = result.filter(o => {
    const t = o.title || {};
    const d = o.description || {};

return (
  (t.ru && t.ru.toLowerCase().includes(q)) ||
  (t.uk && t.uk.toLowerCase().includes(q)) ||
  (t.en && t.en.toLowerCase().includes(q)) ||
  (d.ru && d.ru.toLowerCase().includes(q)) ||
  (d.uk && d.uk.toLowerCase().includes(q)) ||
  (d.en && d.en.toLowerCase().includes(q)) ||
  (o.mode && o.mode.toLowerCase().includes(q))
);
  });
}

  // 💰 Цена
  if (priceMin) {
    result = result.filter(o => o.price >= Number(priceMin));
  }
  if (priceMax) {
    result = result.filter(o => o.price <= Number(priceMax));
  }



  // ↕️ Сортировка
  // 💰 Цена
if (sort === "price_asc") {
  result.sort((a, b) => a.price - b.price);
}
if (sort === "price_desc") {
  result.sort((a, b) => b.price - a.price);
}
if (sort === "amount_asc") {
  result.sort((a, b) => (a.amount || 0) - (b.amount || 0));
}
if (sort === "amount_desc") {
  result.sort((a, b) => (b.amount || 0) - (a.amount || 0));
}

  // 👤 Обогащаем продавцом (оставляем как у тебя)
  const enriched = result.map(o => {
    const seller = users.get(o.sellerEmail);

    return {
      ...o,
seller: seller ? {
  username: seller.username || "Продавец",
  userId: seller.userId || null,
  role: seller.role || ROLE.USER,
  verified: Boolean(seller.verified),
  avatarUrl: seller.avatarUrl || null,
  avatarDataUrl: seller.avatarDataUrl || null,
  online: Boolean(seller.online),
  rating: seller.rating || 0,
  reviewsCount: seller.reviewsCount || 0,
  createdAt: seller.createdAt
} : {
  username: tReq(req, "common.sellerFallback"),
  userId: null,
  role: ROLE.USER,
  verified: false,
  avatarUrl: null,
  avatarDataUrl: null,
  online: false,
  rating: 0,
  reviewsCount: 0,
  createdAt: null
}
    };
  });

  res.json({ success: true, offers: enriched });
});
/**
 * GET /api/offers/:id
 * получение одного объявления
 */
app.get("/api/offers/:id", authRequiredOptional, (req, res) => {
  const { id } = req.params;

  const offer = offers.find(o => o.id === id);

  if (!offer) {
    return res.json({
      success: true,
      deleted: true
    });
  }

  if (offer.status === "deleted") {
    return res.json({
      success: true,
      deleted: true
    });
  }

  const isOwner = req.user?.email === offer.sellerEmail;
  const canModerate =
    req.user &&
    (
      isOfferModerationRole(req.user) ||
      isAdminPanelRole(req.user)
    );

  if (offer.status !== "active" && !isOwner && !canModerate) {
    return res.json({
      success: true,
      unavailable: true
    });
  }

  const seller = users.get(offer.sellerEmail);
  let blockedBySeller = false;

  if (req.user && seller?.blockedUsers?.includes(req.user.email)) {
    blockedBySeller = true;
  }

  return res.json({
    success: true,
    blockedBySeller,
    offer: {
      ...offer,
      canClone: Boolean(isOwner && offer.status === "closed"),
      seller: seller ? {
        username: seller.username || tReq(req, "common.sellerFallback"),
        userId: seller.userId || null,
        avatarUrl: seller.avatarUrl || null,
        avatarDataUrl: seller.avatarDataUrl || null,
        online: Boolean(seller.online),
        rating: seller.rating || 0,
        reviewsCount: seller.reviewsCount || 0,
        createdAt: seller.createdAt
      } : {
        username: tReq(req, "common.sellerFallback"),
        userId: null,
        avatarUrl: null,
        avatarDataUrl: null,
        online: false,
        rating: 0,
        reviewsCount: 0,
        createdAt: null
      }
    }
  });
});

// ===== CREATE / GET CHAT BY OFFER =====
app.post("/api/chats/start", authRequired, async (req, res) => {
  const { offerId } = req.body;

  const offer = offers.find(o => o.id === offerId);

  if (!offer || offer.status !== "active") {
    return res.json({
      success: false,
      message: "responses.chats.itemUnavailable"
    });
  }

  if (offer.sellerEmail === req.user.email) {
    const seller = users.get(offer.sellerEmail);

    if (seller?.blockedUsers?.includes(req.user.email)) {
      return res.json({
        success: false,
        message: "responses.chats.itemUnavailable"
      });
    }

    return res.json({
      success: false,
      message: "responses.chats.cannotWriteToYourself"
    });
  }

  const seller = users.get(offer.sellerEmail);

  if (seller?.blockedUsers?.includes(req.user.email)) {
    return res.json({
      success: false,
      message: "responses.chats.itemUnavailable"
    });
  }

  let chat = chats.find(c =>
    !c.official &&
    (
      (c.buyerEmail === req.user.email && c.sellerEmail === offer.sellerEmail) ||
      (c.sellerEmail === req.user.email && c.buyerEmail === offer.sellerEmail)
    )
  );

  if (!chat) {
    chat = await createDbChatRecord({
      buyerEmail: req.user.email,
      sellerEmail: offer.sellerEmail,
      offerId: offer.id,
      blocked: false,
      official: false,
      deletedBy: []
    });
} else {
  const currentDeletedBy = Array.isArray(chat.deletedBy) ? chat.deletedBy : [];
  const nextDeletedBy = currentDeletedBy.filter(email =>
    email !== req.user.email &&
    email !== offer.sellerEmail
  );

  const chatPatch = {};

  if (chat.offerId !== offer.id) {
    chatPatch.offerId = offer.id;
  }

  if (nextDeletedBy.length !== currentDeletedBy.length) {
    chatPatch.deletedBy = nextDeletedBy;
  }

  if (Object.keys(chatPatch).length) {
    chat = await updateDbChatRecord(chat.id, chatPatch);
  }
}

  res.json({ success:true, chat });
});

// ===== GET MY CHATS =====
app.get("/api/chats", authRequired, (req, res) => {
  const myEmail = req.user.email;
  const officialScope = isOfficialScopeRequest(req);

  let myChats = chats.filter(c => {
    if (officialScope) {
      if (!canWriteOfficial(req.user)) return false;
      if (!isOfficialChat(c)) return false;
      if (c.deletedBy?.includes(myEmail)) return false;

      const hasMessages = messages.some(m => m.chatId === c.id);
      if (!hasMessages) return false;

      const buyerUser = getUserByEmailSafe(c.buyerEmail);

      // В official scope показываем только реальные пользовательские чаты,
      // а не staff / системные / свои служебные
      if (!buyerUser) return false;
      if (
  buyerUser.email === OFFICIAL_ACCOUNT.email ||
  buyerUser.email === RESOLUTION_ENTITY.email
) {
  return false;
}
      if (buyerUser.email === OFFICIAL_ACCOUNT.email) return false;
      if (buyerUser.email === RESOLUTION_ENTITY.email) return false;
      if (isStaffLikeUser(buyerUser)) return false;

      return true;
    }

    const isMine =
      c.buyerEmail === myEmail || c.sellerEmail === myEmail;

    if (!isMine) return false;
    if (c.deletedBy?.includes(myEmail)) return false;

    // официальный чат показываем только если в нём уже есть сообщения
    if (c.official === true) {
      const hasMessages = messages.some(m => m.chatId === c.id);
      if (!hasMessages) return false;
    }

    return true;
  })
  .map(c => {
    const otherEmail = officialScope
      ? c.buyerEmail
      : (c.buyerEmail === myEmail ? c.sellerEmail : c.buyerEmail);

    const otherUser = getUserByEmailSafe(otherEmail);

    const chatMessages = messages
      .filter(m => m.chatId === c.id)
      .sort((a, b) => b.createdAt - a.createdAt);

    const lastMessage = chatMessages[0] || null;

    const unreadCount = messages.filter(m => {
      if (m.chatId !== c.id) return false;
      if (m.read === true) return false;

      // В обычных чатах не считаем мои сообщения
      if (!officialScope && m.fromEmail === myEmail) return false;

      // В official scope staff не должен считать сообщения TyPlace как входящие
      if (officialScope && String(m.fromEmail || "").toLowerCase() === OFFICIAL_ACCOUNT.email) {
        return false;
      }

      return true;
    }).length;

    return {
      ...c,
      lastMessage,
      unreadCount,
      blockedByMe: req.user.blockedUsers?.includes(otherEmail) || false,
      otherUser: buildPublicUserPayload(otherUser, getRequestLang(req))
    };
  })
  .sort((a, b) => {
    const aTime = a.lastMessage?.createdAt || a.createdAt;
    const bTime = b.lastMessage?.createdAt || b.createdAt;
    return bTime - aTime;
  });

  res.json({ success: true, chats: myChats });
});

app.get("/api/chats/unread-count", authRequired, (req, res) => {
  const myEmail = req.user.email;

  const myChats = chats.filter(c =>
    (c.buyerEmail === myEmail || c.sellerEmail === myEmail) &&
    !c.deletedBy?.includes(myEmail)
  );

  const myChatIds = myChats.map(c => c.id);

  const unread = messages.filter(m => {
    if (!myChatIds.includes(m.chatId)) return false;
    if (m.fromEmail === myEmail) return false;
    if (m.read === true) return false;
    if (req.user.blockedUsers?.includes(m.fromEmail)) return false;
    return true;
  });

  res.json({
    success: true,
    count: unread.length
  });
});

// ===== MESSAGES =====
app.post("/api/chats/:id/messages", authRequired, async (req, res) => {
  const { text, media } = req.body;

  let chat = chats.find(c => c.id === req.params.id);
  if (!chat) {
    return res.json({
      success: false,
      message: "responses.chats.chatNotFound"
    });
  }

  const safeText = String(text || "").trim();
  const safeMedia = Array.isArray(media) ? media : [];

  if (!safeText && safeMedia.length === 0) {
    return res.json({
      success: false,
      message: "responses.common.emptyMessage"
    });
  }

  if (isOfficialChat(chat)) {
    return res.json({
      success: false,
      code: "OFFICIAL_CHAT_READ_ONLY",
      message: "responses.chats.officialReadOnlyInDefaultList"
    });
  }

  if (
    chat.buyerEmail !== req.user.email &&
    chat.sellerEmail !== req.user.email
  ) {
    return res.json({
      success: false,
      message: "responses.common.noAccess"
    });
  }

  const myEmail = req.user.email;
  const otherEmail =
    chat.buyerEmail === myEmail
      ? chat.sellerEmail
      : chat.buyerEmail;

  const otherUser = getUserByEmailSafe(otherEmail);

  if (otherUser?.blockedUsers?.includes(myEmail)) {
    return res.json({
      success: false,
      message: "responses.chats.blockedByUser"
    });
  }

  if (chat.deletedBy?.includes(otherEmail)) {
    if (!otherUser?.blockedUsers?.includes(myEmail)) {
      const nextDeletedBy = chat.deletedBy.filter(e => e !== otherEmail);
      chat = await updateDbChatRecord(chat.id, {
        deletedBy: nextDeletedBy
      });
    }
  }

if (req.user.blockedUsers?.includes(otherEmail)) {
  return res.json({
    success: false,
    message: "responses.chats.userBlocked"
  });
}

const cooldownSeconds = getChatActionCooldownSeconds(chat.id, req.user.email);

if (cooldownSeconds > 0) {
  return res.status(429).json({
    success: false,
    message: "responses.chats.tooFastWait",
    messageParams: { seconds: cooldownSeconds }
  });
}

const message = await createDbChatMessageRecord({
    chatId: req.params.id,
    fromEmail: req.user.email,
    fromUserId: req.user.userId || null,
    fromUsername: req.user.username || tReq(req, "common.userFallback"),
    fromRole: req.user.role || ROLE.USER,
    kind: "user",
    messageType: "user",
    staffRole: null,
    text: safeText,
    media: safeMedia,
    meta: null,
    read: false
  });

  emitChatMessageToParticipants(chat.id, message);

  if (otherUser && otherUser.email !== req.user.email) {
    notifyUser(otherUser, "chat_new_message", {
      senderName: req.user.username || "Пользователь",
      preview: safeText || getAttachmentFallback(otherUser?.lang),
      chatId: chat.id
    });
  }

  res.json({ success: true, message });
});

// ===== SEND FILE TO CHAT =====
app.post("/api/chats/:id/files", authRequired, uploadChatFiles.single("file"), async (req, res) => {
  let chat = chats.find(c => c.id === req.params.id);
if (!chat) {
  cleanupUploadedFile(req.file);
  return res.json({ success:false, message:"responses.chats.chatNotFound" });
}

if (isOfficialChat(chat)) {
  cleanupUploadedFile(req.file);
  return res.json({
    success: false,
    message: "responses.chats.officialFilesNotAllowed"
  });
}

if (
  chat.buyerEmail !== req.user.email &&
  chat.sellerEmail !== req.user.email
) {
  cleanupUploadedFile(req.file);
  return res.json({ success:false, message:"responses.common.noAccess" });
}

  if (!req.file) {
    return res.json({ success:false, message: "responses.upload.fileNotFound" });
  }

  const myEmail = req.user.email;
  const otherEmail =
    chat.buyerEmail === myEmail
      ? chat.sellerEmail
      : chat.buyerEmail;

  const otherUser = getUserByEmailSafe(otherEmail);

if (otherUser?.blockedUsers?.includes(myEmail)) {
  cleanupUploadedFile(req.file);
  return res.json({
    success: false,
    message: "responses.chats.blockedByUser"
  });
}

  if (chat.deletedBy?.includes(otherEmail)) {
    if (!otherUser?.blockedUsers?.includes(myEmail)) {
      const nextDeletedBy = chat.deletedBy.filter(e => e !== otherEmail);
      chat = await updateDbChatRecord(chat.id, {
        deletedBy: nextDeletedBy
      });
    }
  }

if (req.user.blockedUsers?.includes(otherEmail)) {
  cleanupUploadedFile(req.file);

  return res.json({
    success:false,
    message:"responses.chats.userBlocked"
  });
}

const cooldownSeconds = getChatActionCooldownSeconds(chat.id, req.user.email);

if (cooldownSeconds > 0) {
  cleanupUploadedFile(req.file);

  return res.status(429).json({
    success: false,
    message: "responses.chats.tooFastWait",
    messageParams: { seconds: cooldownSeconds }
  });
}

const fileUrl = "/uploads/" + req.file.filename;

  const message = await createDbChatMessageRecord({
    chatId: req.params.id,
    fromEmail: req.user.email,
    fromUserId: req.user.userId || null,
    fromUsername: req.user.username || tReq(req, "common.userFallback"),
    fromRole: req.user.role || ROLE.USER,
    kind: "user",
    messageType: "user",
    staffRole: null,
    text: "",
    media: [fileUrl],
    meta: null,
    read: false
  });

  emitChatMessageToParticipants(chat.id, message);

  if (otherUser && otherUser.email !== req.user.email) {
    notifyUser(otherUser, "chat_new_message", {
      senderName: req.user.username || "Пользователь",
      preview: getAttachmentFallback(otherUser?.lang),
      chatId: chat.id
    });
  }

  res.json({
    success: true,
    fileUrl,
    message
  });
});

// ===== GET ONE CHAT =====
app.get("/api/chats/:id", authRequired, (req, res) => {
  const scope = String(req.query.scope || "").trim().toLowerCase();
  const isOfficialScope = scope === "official";

  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) {
    return res.json({
      success: false,
      message: "responses.chats.chatNotFound"
    });
  }

  if (isOfficialScope) {
    if (!isOfficialChat(chat)) {
      return res.status(403).json({
        success: false,
        message: "responses.official.notOfficialChat"
      });
    }

    if (!canWriteOfficial(req.user)) {
      return res.status(403).json({
        success: false,
        message: "responses.common.noAccess"
      });
    }
  } else {
    if (!canViewChat(req.user, chat)) {
      return res.json({
        success: false,
        message: "responses.common.noAccess"
      });
    }
  }

  const otherEmail = getChatOtherEmailForViewer(chat, req.user.email);
  const otherUser = getUserByEmailSafe(otherEmail);

  res.json({
    success: true,
    chat: {
      ...chat,
      otherUser: buildPublicUserPayload(otherUser, getRequestLang(req))
    }
  });
});

// ===== GET MESSAGES =====
app.get("/api/chats/:id/messages", authRequired, (req, res) => {
  const chatId = req.params.id;
  const scope = String(req.query.scope || "").trim().toLowerCase();
  const isOfficialScope = scope === "official";

  const chat = chats.find(c => c.id === chatId);
  if (!chat) {
    return res.json({
      success: false,
      message: "responses.chats.chatNotFound"
    });
  }

  if (isOfficialScope) {
    if (!isOfficialChat(chat)) {
      return res.status(403).json({
        success: false,
        message: "responses.official.notOfficialChat"
      });
    }

    if (!canWriteOfficial(req.user)) {
      return res.status(403).json({
        success: false,
        message: "responses.common.noAccess"
      });
    }
  } else {
    if (!canViewChat(req.user, chat)) {
      return res.json({
        success: false,
        message: "responses.common.noAccess"
      });
    }
  }

  const chatMessages = messages
    .filter(m => m.chatId === chatId)
    .sort((a, b) => a.createdAt - b.createdAt);

  res.json({
    success: true,
    messages: chatMessages
  });
});

/* ================== REVIEWS ================== */

// создать отзыв
app.post("/api/reviews", authRequired, async (req, res) => {
  const { orderId, rating, text } = req.body;

  const order = orders.find(o => o.id === orderId);
  if (!order) {
    return res.json({ success:false, message:"responses.orders.orderNotFound" });
  }

  if (order.buyerEmail !== req.user.email) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  if (order.status !== "completed") {
    return res.json({ success:false, message: "responses.reviews.onlyAfterCompletedOrder" });
  }

  const exists = reviews.find(r => r.orderId === orderId);
  if (exists) {
    return res.json({ success:false, message: "responses.reviews.alreadyExists" });
  }

  const review = await createDbReviewRecord({
    orderId,
    sellerEmail: order.sellerEmail,
    buyerEmail: order.buyerEmail,
    rating: Math.max(1, Math.min(5, Number(rating))),
    text: String(text || "").slice(0, 1000),
    createdAt: Date.now()
  });

  await recalcSellerRating(order.sellerEmail);

  const orderChat = chats.find(c => c.id === order.chatId);

  if (orderChat) {
    await pushSystemMessage({
      chatId: orderChat.id,
      systemType: "review_created",
      actorEmail: req.user.email,
      actorUserId: req.user.userId || "",
      actorUsername: req.user.username || "",
      actorRole: req.user.role || "user",
      orderId: order.id,
      orderNumber: order.orderNumber
    });
  }

  res.json({ success:true, review });
});

/* ================== ORDERS ================== */

// создать заказ
app.post("/api/orders/create", authRequired, async (req, res) => {
  try {
    if (CHECKOUT_MODE !== "test") {
      return res.status(503).json({
        success: false,
        code: "CHECKOUT_NOT_IMPLEMENTED",
        message: "responses.orders.checkoutNotImplemented"
      });
    }

    const offerId = String(req.body.offerId || "").trim();

    if (!offerId) {
      return res.json({
        success: false,
        message: "responses.offers.offerNotFound"
      });
    }

    const offer = offers.find(o => o.id === offerId && o.status === "active");

    if (!offer) {
      return res.json({
        success: false,
        message: "responses.offers.offerNotFound"
      });
    }

    if (offer.sellerEmail === req.user.email) {
      return res.json({
        success: false,
        message: "responses.chats.cannotWriteToYourself"
      });
    }

    const seller = users.get(offer.sellerEmail);

    if (!seller) {
      return res.json({
        success: false,
        message: "responses.common.userNotFound"
      });
    }

    const orderLang = normalizeLang(
  req.body.lang ||
  req.query.lang ||
  req.headers["x-tp-lang"] ||
  req.user?.lang ||
  DEFAULT_LANG
);

    if (seller.blockedUsers?.includes(req.user.email)) {
      return res.json({
        success: false,
        message: "responses.chats.itemUnavailable"
      });
    }

    const existingPendingOrder = orders.find(o =>
      o.offerId === offer.id &&
      o.buyerEmail === req.user.email &&
      o.sellerEmail === offer.sellerEmail &&
      o.status === "pending"
    );

    if (existingPendingOrder) {
      const existingChat = chats.find(c => c.id === existingPendingOrder.chatId) || null;

      return res.json({
        success: true,
        alreadyExists: true,
        order: existingPendingOrder,
        chat: existingChat
      });
    }

let chat = chats.find(c =>
  !c.official &&
  (
    (c.buyerEmail === req.user.email && c.sellerEmail === offer.sellerEmail) ||
    (c.sellerEmail === req.user.email && c.buyerEmail === offer.sellerEmail)
  )
);

if (!chat) {
  chat = await createDbChatRecord({
    buyerEmail: req.user.email,
    sellerEmail: offer.sellerEmail,
    offerId: offer.id,
    blocked: false,
    official: false,
    deletedBy: []
  });
} else {
  const currentDeletedBy = Array.isArray(chat.deletedBy) ? chat.deletedBy : [];
  const nextDeletedBy = currentDeletedBy.filter(email =>
    email !== req.user.email &&
    email !== offer.sellerEmail
  );

  const chatPatch = {};

  if (chat.offerId !== offer.id) {
    chatPatch.offerId = offer.id;
  }

  if (nextDeletedBy.length !== currentDeletedBy.length) {
    chatPatch.deletedBy = nextDeletedBy;
  }

  if (Object.keys(chatPatch).length) {
    chat = await updateDbChatRecord(chat.id, chatPatch);
  }
}

    let closedOffer;

    try {
      closedOffer = await updateDbOfferRecord(offer.id, {
        status: "closed",
        activeUntil: null
      });
    } catch (e) {
      console.error("close offer before order create error:", e);
      return res.status(500).json({
        success: false,
        message: "responses.common.internalError"
      });
    }

    let order;

    try {
order = await createDbOrderRecord({
  orderNumber: generateOrderCode(),
  offerId: offer.id,
  buyerEmail: req.user.email,
  sellerEmail: offer.sellerEmail,
  chatId: chat.id,
  price: Number(offer.price || 0),
  commission: calcFee(Number(offer.price || 0), Number(offer.priceNet || 0)),
  status: "pending",
  disputeStatus: "none",
  offerSnapshot: buildOfferSnapshot(offer, orderLang)
});
    } catch (e) {
      console.error("create order after closing offer error:", e);

      try {
        await updateDbOfferRecord(offer.id, {
          status: "active",
          activeUntil: offer.activeUntil || Date.now() + 7 * 24 * 60 * 60 * 1000
        });
      } catch (restoreErr) {
        console.error("restore offer after failed order create error:", restoreErr.message);
      }

      return res.status(500).json({
        success: false,
        message: "responses.common.internalError"
      });
    }

    try {
      await pushSystemMessage({
        chatId: chat.id,
        systemType: "order_created",
        actorEmail: req.user.email,
        actorUserId: req.user.userId || "",
        actorUsername: req.user.username || "",
        actorRole: req.user.role || ROLE.USER,
        orderId: order.id,
        orderNumber: order.orderNumber
      });
    } catch (e) {
      console.error("order_created system message error:", e.message);
    }

    return res.json({
      success: true,
      order,
      chat,
      offer: closedOffer,
      checkoutMode: CHECKOUT_MODE
    });
  } catch (e) {
    console.error("POST /api/orders/create error:", e);
    return res.status(500).json({
      success: false,
      message: "responses.common.internalError"
    });
  }
});

// получить заказ
app.get("/api/orders/:id", authRequired, (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.json({ success:false });

const isParticipant =
  order.buyerEmail === req.user.email ||
  order.sellerEmail === req.user.email;

const isAdminViewer = isAdminPanelRole(req.user);
const isAssignedResolutionViewer =
  req.user.role === ROLE.RESOLUTION &&
  order.resolutionAssignedTo === req.user.email;

if (!isParticipant && !isAdminViewer && !isAssignedResolutionViewer) {
  return res.json({ success:false, message:"responses.common.noAccess" });
}

const offer = offers.find(o => o.id === order.offerId) || order.offerSnapshot || null;

const chatStub = {
  id: order.chatId,
  buyerEmail: order.buyerEmail,
  sellerEmail: order.sellerEmail
};

res.json({
  success: true,
  order: {
    ...order,
    offer,
    role:
      order.buyerEmail === req.user.email
        ? "buyer"
        : order.sellerEmail === req.user.email
          ? "seller"
          : "staff",
    viewerRole: req.user.role || ROLE.USER,
    canUseOrderChat: canViewChat(req.user, chatStub),
    canWriteResolutionChat: canWriteResolutionToOrder(req.user, order)
  }
});
});

app.post("/api/orders/:id/resolution-message", authRequired, async (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({
      success: false,
      message: "responses.orders.orderNotFound"
    });
  }

  if (!isResolutionRole(req.user)) {
    return res.status(403).json({
      success: false,
      message: "responses.orders.onlyResolutionCanWrite"
    });
  }

  if (order.disputeStatus !== "requested" && order.disputeStatus !== "in_review") {
    return res.json({
      success: false,
      message: "responses.orders.noActiveDispute"
    });
  }

  if (
    !isAdminPanelRole(req.user) &&
    order.resolutionAssignedTo !== req.user.email
  ) {
    return res.status(403).json({
      success: false,
      message: "responses.orders.disputeAssignedToAnotherResolution"
    });
  }

  const safeText = String(req.body.text || "").trim();
  const safeMedia = Array.isArray(req.body.media) ? req.body.media : [];

  if (!safeText && safeMedia.length === 0) {
    return res.json({
      success: false,
      message: "responses.common.emptyMessage"
    });
  }

  const message = await pushResolutionMessage({
    order,
    actor: req.user,
    text: safeText,
    media: safeMedia
  });

  return res.json({
    success: true,
    message
  });
});

app.post("/api/orders/:id/resolution-decision", authRequired, async (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({
      success: false,
      message: "responses.orders.orderNotFound"
    });
  }

  if (!isResolutionRole(req.user)) {
    return res.status(403).json({
      success: false,
      message: "responses.orders.onlyResolutionCanDecide"
    });
  }

  if (order.status !== "pending") {
    return res.json({
      success: false,
      message: "responses.orders.decisionAlreadyMade"
    });
  }

  if (order.disputeStatus !== "requested" && order.disputeStatus !== "in_review") {
    return res.json({
      success: false,
      message: "responses.orders.noActiveDispute"
    });
  }

  if (
    !isAdminPanelRole(req.user) &&
    order.resolutionAssignedTo !== req.user.email
  ) {
    return res.status(403).json({
      success: false,
      message: "responses.orders.disputeAssignedToAnotherResolution"
    });
  }

  const decision = String(req.body.decision || "").trim().toLowerCase();
  const safeText = String(req.body.text || "").trim();

  if (!["confirm", "refund"].includes(decision)) {
    return res.json({
      success: false,
      message: "responses.orders.invalidDecision"
    });
  }

  if (!safeText) {
    return res.json({
      success: false,
      message: "responses.orders.enterDecisionText"
    });
  }

  const resolutionMessage = await pushResolutionMessage({
    order,
    actor: req.user,
    text: safeText,
    media: []
  });

  try {
    if (decision === "confirm") {
      await applyOrderConfirm({
        order,
        actor: req.user,
        systemType: "resolution_confirmed"
      });
    } else {
      await applyOrderRefund({
        order,
        actor: req.user,
        systemType: "resolution_refunded"
      });
    }

const disputeTicket = order.disputeTicketId
  ? await supportService.getTicketById(order.disputeTicketId)
  : null;

if (disputeTicket && disputeTicket.status !== "resolved") {
  const closedTicket = await supportService.closeTicket(disputeTicket, req.user);
  emitTicketUpdate(closedTicket, "closed");
}

    return res.json({
      success: true,
      message: resolutionMessage,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        disputeStatus: order.disputeStatus,
        completedAt: order.completedAt || null,
        refundedAt: order.refundedAt || null
      }
    });
  } catch (e) {
    return res.json({
      success: false,
      message: e.message
    });
  }
});

// покупатель подтверждает заказ
app.post("/api/orders/:id/confirm", authRequired, async (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({
      success: false,
      message: "responses.orders.orderNotFound"
    });
  }

  if (order.buyerEmail !== req.user.email) {
    return res.json({ success: false });
  }

  if (order.disputeStatus === "in_review") {
  return res.json({
    success: false,
    message: "responses.orders.cannotConfirmWhileDisputeInReview"
  });
}

  try {
    await applyOrderConfirm({
      order,
      actor: req.user,
      systemType: "order_confirmed"
    });

    await closeLinkedDisputeTicket(order, req.user);

    return res.json({ success: true });
  } catch (e) {
    return res.json({
      success: false,
      message: e.message
    });
  }
});

// продавец делает возврат
app.post("/api/orders/:id/refund", authRequired, async (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({
      success: false,
      message: "responses.orders.orderNotFound"
    });
  }

  if (order.sellerEmail !== req.user.email) {
    return res.json({ success: false });
  }

  if (order.disputeStatus === "in_review") {
  return res.json({
    success: false,
    message: "responses.orders.cannotRefundWhileDisputeInReview"
  });
}

  try {
    await applyOrderRefund({
      order,
      actor: req.user,
      systemType: "order_refunded"
    });

    await closeLinkedDisputeTicket(order, req.user);

    return res.json({ success: true });
  } catch (e) {
    return res.json({
      success: false,
      message: e.message
    });
  }
});

setInterval(async () => {
  const allTickets = await supportService.getAllTickets();
  const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
  const nowTime = Date.now();

  for (const ticket of allTickets) {
    if (ticket.status === "resolved") continue;
    if (ticket.kind === "order_dispute") continue;

    const messages = await supportService.getMessages(ticket.id);
    if (!messages.length) continue;

    const lastMessage = messages[messages.length - 1];

    if (
      lastMessage.from === "support" &&
      nowTime - lastMessage.createdAt > FIVE_DAYS
    ) {
      const updatedTicket = await supportService.updateTicket(ticket.id, {
        status: "resolved"
      });

      await supportService.addLog(ticket.id, "auto_closed", {
        email: "system",
        username: "System",
        role: "system"
      });

      emitTicketUpdate(updatedTicket, "auto_closed");
    }
  }
}, 60 * 60 * 1000);

app.get("/api/my-sales", authRequired, (req, res) => {
  const mySales = orders
    .filter(o => o.sellerEmail === req.user.email)
    .map(o => {
      const liveOffer = offers.find(of => of.id === o.offerId) || null;

      return {
        ...o,
        offer: o.offerSnapshot || liveOffer || null,
        liveOffer
      };
    });

  res.json({ success: true, sales: mySales });
});

app.get("/api/my-purchases", authRequired, (req, res) => {
  const myPurchases = orders
    .filter(o => o.buyerEmail === req.user.email)
    .map(o => {
      const liveOffer = offers.find(of => of.id === o.offerId) || null;

      return {
        ...o,
        offer: o.offerSnapshot || liveOffer || null,
        liveOffer
      };
    });

  res.json({ success: true, purchases: myPurchases });
});

// получить отзывы продавца
app.get("/api/users/:email/reviews", (req, res) => {
  const sellerEmail = req.params.email;

  const result = reviews
    .filter(r => r.sellerEmail === sellerEmail)
    .map(r => {
      const order = orders.find(o => o.id === r.orderId);
      if (!order) return null;

      const offer = offers.find(of => of.id === order.offerId);
      const buyer = users.get(order.buyerEmail);

      return {
        id: r.id,
        rating: r.rating,
        text: r.text,
        createdAt: r.createdAt,

        // 🧾 номер заказа
        orderId: order.id,
        orderNumber: order.orderNumber,

        // 👤 покупатель (НИК, НЕ EMAIL)
        buyer: {
          username: buyer?.username || tReq(req, "common.buyerFallback")
        },

        // 🖼️ карточка оффера
        offer: {
  id: offer?.id || null,
  description:
    offer?.description?.ru ||
    offer?.description?.uk ||
    offer?.description?.en ||
    "",
  imageUrl: offer?.imageUrl || null,
  price: offer?.price || order.price
}
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);

  res.json({ success: true, reviews: result });
});
// 🔥 Получить отзывы по userId
app.get("/api/users/:id/reviews-by-id", (req, res) => {

  const userId = String(req.params.id || "").trim();

  const user = Array.from(users.values())
    .find(u => u.userId === userId);

  if (!user) {
    return res.json({ success:false, message:"responses.common.userNotFound" });
  }

  const result = reviews
    .filter(r => r.sellerEmail === user.email)
    .map(r => {

      const order = orders.find(o => o.id === r.orderId);
      const snapshot = order?.offerSnapshot;
      const buyer = users.get(r.buyerEmail);

      return {
        id: r.id,
        rating: r.rating,
        text: r.text,
        createdAt: r.createdAt,

        buyer: {
          username: buyer?.username || tReq(req, "common.buyerFallback"),
          avatarUrl: buyer?.avatarUrl || null,
          avatarDataUrl: buyer?.avatarDataUrl || null
        },

offer: {
  id: snapshot?.id || null,
  description:
  snapshot?.description?.ru ||
  snapshot?.description?.uk ||
  snapshot?.description?.en ||
  "",
  imageUrl: snapshot?.imageUrl || null,
  price: snapshot?.price || order?.price || 0
}
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  res.json({ success: true, reviews: result });
});

// Публичный профиль по ID
app.get("/api/users/by-id/:id", (req, res) => {

  const userId = String(req.params.id || "").trim();

  const user = Array.from(users.values())
    .find(u => u.userId === userId);

  if (!user) {
    return res.json({ success:false, message:"responses.common.userNotFound" });
  }

  // 🔥 берём активные офферы пользователя
  const userOffers = offers
    .filter(o =>
      o.sellerEmail === user.email &&
      o.status === "active"
    )
    .map(o => {

      const seller = users.get(o.sellerEmail);

      return {
        ...o,
        seller: seller ? {
          username: seller.username || "Продавец",
          userId: seller.userId || null,
          avatarUrl: seller.avatarUrl || null,
          avatarDataUrl: seller.avatarDataUrl || null,
          online: Boolean(seller.online),
          rating: seller.rating || 0,
          reviewsCount: seller.reviewsCount || 0,
          createdAt: seller.createdAt
        } : null
      };
    });

  res.json({
    success:true,
    user:{
      username: user.username,
      userId: user.userId,
      avatarUrl: user.avatarUrl || null,
      avatarDataUrl: user.avatarDataUrl || null,
      createdAt: user.createdAt,
      rating: user.rating || 0,
      reviewsCount: user.reviewsCount || 0
    },
    offers: userOffers
  });

});

setInterval(updateRates, 60 * 60 * 1000);

/* ================== UNREAD COUNT ================== */

app.post("/api/chats/:id/read", authRequired, async (req, res) => {
  const chatId = req.params.id;
  const myEmail = req.user.email;
  const scope = String(req.query.scope || "").trim().toLowerCase();
  const isOfficialScope = scope === "official";

  const chat = chats.find(c => c.id === chatId);
  if (!chat) {
    return res.json({
      success: false,
      message: "responses.chats.chatNotFound"
    });
  }

  if (isOfficialScope) {
    if (!isOfficialChat(chat) || !canWriteOfficial(req.user)) {
      return res.json({ success: true, skipped: true });
    }

    await markDbChatMessagesRead(chatId, OFFICIAL_ACCOUNT.email);

    return res.json({ success: true });
  }

  if (!canViewChat(req.user, chat)) {
    return res.json({ success: true, skipped: true });
  }

  await markDbChatMessagesRead(chatId, myEmail);

  res.json({ success: true });
});

// ===== BLOCK / UNBLOCK USER =====
app.post("/api/users/block", authRequired, async (req, res) => {
  const { chatId } = req.body;
  const chat = chats.find(c => c.id === chatId);

  if (!chat) {
    return res.json({ success:false, message:"responses.chats.chatNotFound" });
  }

  if (
    chat.buyerEmail !== req.user.email &&
    chat.sellerEmail !== req.user.email
  ) {
    return res.json({
      success: false,
      message: "responses.common.noAccess"
    });
  }

  const myEmail = req.user.email;
  const otherEmail =
    chat.buyerEmail === myEmail
      ? chat.sellerEmail
      : chat.buyerEmail;

  if (!otherEmail) {
    return res.json({ success:false, message:"responses.common.userNotFound" });
  }

  if (isOfficialEmail(otherEmail)) {
    return res.json({
      success: false,
      message: "responses.users.cannotBlockOfficialAccount"
    });
  }

  const otherUser = users.get(otherEmail);

  if (otherUser && isProtectedStaffRole(otherUser.role)) {
    return res.json({
      success: false,
      message: "responses.users.cannotBlockStaff"
    });
  }

  const currentBlocked = Array.isArray(req.user.blockedUsers)
    ? [...req.user.blockedUsers]
    : [];

  const alreadyBlocked = currentBlocked.includes(otherEmail);

  const nextBlockedUsers = alreadyBlocked
    ? currentBlocked.filter(e => e !== otherEmail)
    : [...currentBlocked, otherEmail];

  const updatedMe = await updateDbUserRecord(req.user.email, {
    blockedUsers: nextBlockedUsers
  });

  req.user = updatedMe;

  return res.json({
    success:true,
    blocked: !alreadyBlocked,
    blockedUsers: updatedMe.blockedUsers || []
  });
});

app.delete("/api/chats/:id", authRequired, async (req, res) => {
  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) return res.json({ success:false });

  const myEmail = req.user.email;

  if (
    chat.buyerEmail !== myEmail &&
    chat.sellerEmail !== myEmail
  ) {
    return res.json({
      success: false,
      message: "responses.common.noAccess"
    });
  }

  const nextDeletedBy = Array.isArray(chat.deletedBy) ? [...chat.deletedBy] : [];

  if (!nextDeletedBy.includes(myEmail)) {
    nextDeletedBy.push(myEmail);
  }

  const updatedChat = await updateDbChatRecord(chat.id, {
    deletedBy: nextDeletedBy
  });

  res.json({ success:true, chat: updatedChat });
});

/* ================== SOCKET.IO ================== */

io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

  socket.on("auth", ({ token }) => {
    try {
      const safeToken = String(token || "").trim();
      const s = sessions.get(safeToken);
      if (!s) return;

      if (Date.now() > s.expiresAt) {
        disconnectSocketsForToken(safeToken);
        sessions.delete(safeToken);
        return;
      }

      const prevEmail = String(socket.data.email || "").trim().toLowerCase();
      const prevToken = String(socket.data.token || "").trim();

      if (prevEmail && prevEmail !== s.email) {
        removeOnlineSocket(prevEmail, socket.id);
      }

      if (prevToken && prevToken !== safeToken) {
        removeSocketFromToken(prevToken, socket.id);
      }

      addOnlineSocket(s.email, socket.id);
      addSocketToToken(safeToken, socket.id);

      socket.data.email = s.email;
      socket.data.token = safeToken;

      const myChats = chats.filter(c =>
        c.buyerEmail === s.email || c.sellerEmail === s.email
      );

      myChats.forEach(c => {
        socket.join("chat:" + c.id);
      });
    } catch (e) {
      console.error("socket auth error:", e.message);
    }
  });

  socket.on("disconnect", () => {
    const email = String(socket.data.email || "").trim().toLowerCase();
    const token = String(socket.data.token || "").trim();

    if (token) {
      removeSocketFromToken(token, socket.id);
    }

    if (email) {
      removeOnlineSocket(email, socket.id);
      return;
    }

    for (const [e, set] of socketIdsByEmail.entries()) {
      if (set.has(socket.id)) {
        removeOnlineSocket(e, socket.id);
        break;
      }
    }

    for (const [t, set] of socketIdsByToken.entries()) {
      if (set.has(socket.id)) {
        removeSocketFromToken(t, socket.id);
        break;
      }
    }
  });
});

function emitTicketUpdate(ticket, event){
  const payload = {
    event,
    ticketId: ticket.id,
    status: ticket.status,
    assignedTo: ticket.assignedTo || null,
    priority: ticket.priority || "normal",
    updatedAt: ticket.updatedAt
  };

  users.forEach(u => {
    if (
      u.role === ROLE.SUPPORT ||
      u.role === ROLE.ADMIN ||
      u.role === ROLE.SUPER_ADMIN
    ) {
      emitToUserSockets(u.email, "support-ticket-updated", payload);
    }
  });

  emitToUserSockets(ticket.userEmail, "support-ticket-updated", payload);

  if (ticket.assignedTo) {
    emitToUserSockets(ticket.assignedTo, "support-ticket-updated", payload);
  }
}

function canAccessSupportTicket(user, ticket) {
  if (!user || !ticket) return false;

  if (isAdminPanelRole(user)) return true;

  if (user.role === ROLE.ADMIN) return true;

  if (ticket.userEmail === user.email) return true;

  if (user.role === ROLE.SUPPORT) {
    return !ticket.assignedTo || ticket.assignedTo === user.email;
  }

  if (user.role === ROLE.RESOLUTION) {
    return ticket.kind === "order_dispute" && ticket.assignedTo === user.email;
  }

  return false;
}

async function closeLinkedDisputeTicket(order, actor) {
  if (!order?.disputeTicketId) return;

  const disputeTicket = await supportService.getTicketById(order.disputeTicketId);
  if (!disputeTicket || disputeTicket.status === "resolved") return;

  const closedTicket = await supportService.closeTicket(disputeTicket, actor);
  emitTicketUpdate(closedTicket, "closed");
}

/* ================== SUPPORT API ================== */
// Получить конфигурацию поддержки
app.get("/api/support/config", authRequired, (req, res) => {
  res.json({
    success: true,
    config: SUPPORT_CONFIG
  });
});

// Создать тикет
app.post(
  "/api/support/tickets",
  authRequired,
  supportCreateLimiter,
  uploadSupportAttachments.array("attachments", 10),
  async (req, res) => {
    try {
      console.log("=== CREATE SUPPORT TICKET START ===");
      console.log("user:", req.user?.email);
      console.log("body:", req.body);
      console.log("files:", req.files?.length || 0);
      const failTicketCreate = (message, extra = {}) => {
  cleanupUploadedFiles(req.files);
  return res.json({
    success: false,
    message,
    ...extra
  });
};

      const subject = String(req.body.subject || "").trim().slice(0, 80);
      const category = String(req.body.category || "other").trim().slice(0, 30);

      const rawOrderId = String(req.body.orderId || "").trim();
      const rawUserId = String(req.body.userId || "").trim();
      const rawOfferId = String(req.body.offerId || "").trim();

      const normalizedOrderId = normalizeOrderLookup(rawOrderId);
      const userIdDigits = extractPrefixedDigits(rawUserId, "UID");
      const offerIdDigits = extractPrefixedDigits(rawOfferId, "OID");

      const userId = formatPrefixedId(rawUserId, "UID");
      const offerId = formatPrefixedId(rawOfferId, "OID");

      if (category === "report" && !userIdDigits) {
return failTicketCreate("responses.support.enterUserId");
      }

if (category === "report_offer" && !offerIdDigits) {
  return failTicketCreate("responses.support.enterOfferId");
}

      if (userIdDigits) {
        const targetUser = Array.from(users.values())
          .find(u => String(u.userId || "") === userIdDigits);

if (!targetUser) {
  return failTicketCreate("responses.common.userNotFound");
}
      }

      if (offerIdDigits) {
        const targetOffer = offers.find(o =>
          String(o.offerId || "") === offerIdDigits &&
          o.status !== "deleted"
        );

if (!targetOffer) {
  return failTicketCreate("responses.support.offerNotFound");
}
      }

      const message = String(req.body.message || "").trim().slice(0, 2000);
      let priority = "normal";
      let linkedOrder = null;
      let shouldOpenLiveDispute = false;

      if (category === "order") {
        priority = "high";
      }

      let attachments = [];

      if (req.files && req.files.length > 0) {
        attachments = req.files.map(file => "/uploads/" + file.filename);
      }

if (!subject) {
  return failTicketCreate("responses.support.enterSubject");
}

if (!message) {
  return failTicketCreate("responses.support.enterDescription");
}

      let finalOrderId = normalizedOrderId || rawOrderId;

      if (rawOrderId) {
        const order = orders.find(o =>
          o.id === rawOrderId ||
          o.orderNumber === rawOrderId.toUpperCase() ||
          o.orderNumber === normalizedOrderId
        );

if (!order) {
  return failTicketCreate("responses.orders.orderNotFound");
}

if (
  order.buyerEmail !== req.user.email &&
  order.sellerEmail !== req.user.email
) {
  return failTicketCreate("responses.support.notOrderParticipant");
}

        if (category === "order") {
          if (
            order.disputeStatus === "requested" ||
            order.disputeStatus === "in_review"
          ) {
return failTicketCreate("responses.support.disputeAlreadyOpen");
          }

          if (order.status === "pending") {
            shouldOpenLiveDispute = true;
          } else if (order.status === "completed") {
            if (!canBuyerOpenCompletedOrderAppeal(order, req.user)) {
return failTicketCreate("responses.support.completedOrderAppealOnlyBuyerWithin72h");
            }
          } else {
return failTicketCreate("responses.support.cannotOpenTicketForThisOrderCategory");
          }
        }

        linkedOrder = order;
        finalOrderId = order.orderNumber || order.id;
      }

      const activeTickets = (await supportService.getAllTickets()).filter(
        t => t.userEmail === req.user.email && t.status !== "resolved"
      );

if (activeTickets.length >= 3) {
  return failTicketCreate("responses.support.tooManyActiveTickets");
}

      console.log("before supportService.createTicket", {
        subject,
        category,
        finalOrderId,
        userId,
        offerId,
        priority,
        linkedOrderId: linkedOrder?.id || null,
        shouldOpenLiveDispute
      });

let ticket;

try {
  ticket = await supportService.createTicket({
    user: req.user,
    subject,
    category,
    orderId: finalOrderId,
    userId,
    offerId,
    message,
    attachments,
    priority
  });
} catch (e) {
  cleanupUploadedFiles(req.files);

  return res.status(500).json({
    success: false,
    message:
      typeof e?.message === "string" && e.message.startsWith("responses.")
        ? e.message
        : "responses.common.internalError"
  });
}

try {
  if (category === "order" && linkedOrder && shouldOpenLiveDispute) {
    ticket = await supportService.updateTicket(ticket.id, {
      kind: "order_dispute",
      chatId: linkedOrder.chatId,
      orderInternalId: linkedOrder.id,
      updatedAt: Date.now()
    });

    linkedOrder.disputeStatus = "requested";
    linkedOrder.disputeTicketId = ticket.id;

    if (!linkedOrder.resolutionRequestedAt) {
      linkedOrder.resolutionRequestedAt = Date.now();
    }

    await updateDbOrderRecord(linkedOrder.id, {
      disputeStatus: linkedOrder.disputeStatus,
      disputeTicketId: linkedOrder.disputeTicketId,
      resolutionRequestedAt: linkedOrder.resolutionRequestedAt
    });

    await pushSystemMessage({
      chatId: linkedOrder.chatId,
      systemType: "resolution_requested",
      actorEmail: req.user.email,
      actorUserId: req.user.userId || "",
      actorUsername: req.user.username || "",
      actorRole: req.user.role || "user",
      orderId: linkedOrder.id,
      orderNumber: linkedOrder.orderNumber
    });
  } else if (category === "order" && linkedOrder && linkedOrder.status === "completed") {
    ticket = await supportService.updateTicket(ticket.id, {
      kind: "completed_order_appeal",
      chatId: linkedOrder.chatId,
      orderInternalId: linkedOrder.id,
      updatedAt: Date.now()
    });
  }

  users.forEach(u => {
    if (
      u.role === ROLE.SUPPORT ||
      u.role === ROLE.ADMIN ||
      u.role === ROLE.SUPER_ADMIN
    ) {
      emitToUserSockets(u.email, "new-support-ticket", {
        id: ticket.id,
        shortId: ticket.shortId,
        subject: ticket.subject,
        priority: ticket.priority
      });
    }
  });

  notifyUser(req.user, "support_ticket_created", {
    ticketShortId: ticket.shortId,
    subject: ticket.subject
  });
} catch (e) {
  console.error("support ticket post-save side effect error:", e.message);
}

return res.json({
  success: true,
  ticket
});
    } catch (e) {
      console.error("POST /api/support/tickets error:", e);

cleanupUploadedFiles(req.files);

return res.status(500).json({
  success: false,
  message:
    typeof e?.message === "string" && e.message.startsWith("responses.")
      ? e.message
      : "responses.common.internalError"
});
    }
  }
);

// Получить мои тикеты
app.get("/api/support/tickets", authRequired, async (req, res) => {
  let tickets = await supportService.getTicketsForUser(req.user);

  if (req.user.role === ROLE.SUPPORT) {
    tickets = tickets.filter(t =>
      !t.assignedTo || t.assignedTo === req.user.email
    );
  }

  if (req.query.assigned === "me") {
    tickets = tickets.filter(t => t.assignedTo === req.user.email);
  }

  const status = String(req.query.status || "").trim();
  if (status) {
    tickets = tickets.filter(t => t.status === status);
  }

  tickets = await Promise.all(
    tickets.map(async (t) => {
      let assignedUsername = null;
      let assignedUserId = null;

      if (t.assignedTo) {
        const u = users.get(t.assignedTo);
        if (u) {
          assignedUsername = u.username;
          assignedUserId = u.userId || null;
        }
      }

      const msgs = await supportService.getMessages(t.id);

      const unread = msgs.filter(m =>
        m.from === "user" &&
        req.user.role !== "user" &&
        m.userEmail !== req.user.email
      ).length;

      const lastMessage = msgs.length ? msgs[msgs.length - 1] : null;
      const creatorUser = users.get(t.userEmail);
      const categoryConfig = SUPPORT_CONFIG[t.category];

      return {
        ...t,
        unread,
        assignedUsername,
        assignedUserId,
        categoryLabel: categoryConfig ? categoryConfig.labelKey : t.category,
        creator: creatorUser ? {
          username: creatorUser.username || tReq(req, "common.userFallback"),
          userId: creatorUser.userId || null
        } : {
          username: tReq(req, "common.userFallback"),
          userId: null
        },
        lastMessageFrom: !lastMessage
          ? null
          : (lastMessage.from === "user" ? "user" : "support")
      };
    })
  );

  res.json({
    success: true,
    tickets
  });
});

// Получить только МОИ тикеты (для страницы истории)
app.get("/api/support/my", authRequired, async (req, res) => {
  let tickets = await supportService.getTicketsForUser(req.user);
  tickets = tickets.filter(t => t.userEmail === req.user.email);

  tickets = tickets.map(t => {
    let assignedUsername = null;

    if (t.assignedTo) {
      const u = users.get(t.assignedTo);
      if (u) assignedUsername = u.username;
    }

    const categoryConfig = SUPPORT_CONFIG[t.category];

    return {
      ...t,
      assignedUsername,
      categoryLabel: categoryConfig
        ? categoryConfig.labelKey
        : t.category
    };
  });

  res.json({
    success: true,
    tickets
  });
});

// Статистика тикетов (только support/admin)
app.get("/api/support/stats", authRequired, supportRequired, async (req, res) => {
  let tickets = await supportService.getTicketsForUser(req.user);

  if (req.user.role === ROLE.SUPPORT) {
    tickets = tickets.filter(t =>
      !t.assignedTo || t.assignedTo === req.user.email
    );
  }

  const stats = {
    waiting: tickets.filter(t => t.status === "waiting").length,
    in_progress: tickets.filter(t => t.status === "in_progress").length,
    resolved: tickets.filter(t => t.status === "resolved").length,
    total: tickets.length
  };

  res.json({
    success: true,
    stats
  });
});

// Назначить тикет сотруднику (только support/admin)
app.post(
  "/api/support/tickets/:id/assign",
  authRequired,
  supportRequired,
  async (req, res) => {
    const ticket = await supportService.getTicketById(req.params.id);

if (!ticket) {
  return res.json({
    success: false,
    message: "responses.support.ticketNotFound"
  });
}

if (ticket.status === "resolved") {
  return res.json({ success:false, message:"responses.support.ticketClosed" });
}

    if (
      ticket.assignedTo &&
      ticket.assignedTo !== req.user.email &&
      !isAdminPanelRole(req.user)
    ) {
      return res.json({
        success:false,
        message: "responses.support.ticketAssignedToAnotherStaff"
      });
    }

const updatedTicket = await supportService.updateTicket(ticket.id, {
  assignedTo: req.user.email,
  assignedAt: Date.now(),
  status: "in_progress",
  updatedAt: Date.now()
});

await supportService.addLog(ticket.id, "assigned", req.user);

    emitTicketUpdate(updatedTicket, "assigned");

    res.json({ success:true, ticket: updatedTicket });
  }
);

app.post(
  "/api/support/tickets/:id/assign-resolution",
  authRequired,
  supportRequired,
  async (req, res) => {
    const ticket = await supportService.getTicketById(req.params.id);

    if (!ticket) {
      return res.json({ success: false, message: "responses.support.ticketNotFound" });
    }

    if (ticket.status === "resolved") {
      return res.json({ success: false, message: "responses.support.ticketClosed" });
    }

    if (ticket.kind !== "order_dispute") {
      return res.json({
        success: false,
        message: "responses.support.ticketIsNotOrderDispute"
      });
    }

    const linkedOrder = orders.find(o =>
      o.id === ticket.orderInternalId ||
      o.id === ticket.orderId ||
      o.orderNumber === ticket.orderId
    );

    if (!linkedOrder) {
      return res.json({
        success: false,
        message: "responses.support.linkedOrderNotFound"
      });
    }

    const resolutionEmail = String(req.body.resolutionEmail || "").trim().toLowerCase();

    if (!resolutionEmail) {
      return res.json({
        success: false,
        message: "responses.support.resolutionEmployeeRequired"
      });
    }

    const resolutionUser = users.get(resolutionEmail);

    if (!resolutionUser) {
      return res.json({
        success: false,
        message: "responses.support.resolutionEmployeeNotFound"
      });
    }

    if (
      resolutionUser.role !== ROLE.RESOLUTION &&
      resolutionUser.role !== ROLE.SUPER_ADMIN
    ) {
      return res.json({
        success: false,
        message: "responses.support.userHasNoResolutionRole"
      });
    }

    const updatedTicket = await supportService.updateTicket(ticket.id, {
      assignedTo: resolutionUser.email,
      assignedRole: ROLE.RESOLUTION,
      status: "in_progress",
      resolutionAssignedAt: Date.now(),
      updatedAt: Date.now()
    });

    linkedOrder.disputeStatus = "in_review";
    linkedOrder.disputeTicketId = ticket.id;
    linkedOrder.resolutionAssignedTo = resolutionUser.email;
    linkedOrder.resolutionAssignedAt = Date.now();

    await updateDbOrderRecord(linkedOrder.id, {
      disputeStatus: linkedOrder.disputeStatus,
      disputeTicketId: linkedOrder.disputeTicketId,
      resolutionAssignedTo: linkedOrder.resolutionAssignedTo,
      resolutionAssignedAt: linkedOrder.resolutionAssignedAt
    });

    await supportService.addLog(ticket.id, "resolution_assigned", req.user);
    emitTicketUpdate(updatedTicket, "resolution_assigned");

    await pushSystemMessage({
      chatId: linkedOrder.chatId,
      systemType: "resolution_assigned",
      actorEmail: resolutionUser.email,
      actorUserId: resolutionUser.userId || "",
      actorUsername: resolutionUser.username || "",
      actorRole: resolutionUser.role || ROLE.RESOLUTION,
      orderId: linkedOrder.id,
      orderNumber: linkedOrder.orderNumber
    });

    return res.json({
      success: true,
      ticket: updatedTicket,
      order: {
        id: linkedOrder.id,
        orderNumber: linkedOrder.orderNumber,
        disputeStatus: linkedOrder.disputeStatus,
        resolutionAssignedTo: linkedOrder.resolutionAssignedTo
      }
    });
  }
);

// Передать тикет другому сотруднику (только admin)
app.post(
  "/api/support/tickets/:id/transfer",
  authRequired,
  supportRequired,
  async (req, res) => {
    const ticket = await supportService.getTicketById(req.params.id);

if (!ticket) {
  return res.json({ success:false, message:"responses.support.ticketNotFound" });
}

    if (ticket.kind === "order_dispute") {
      return res.json({
        success: false,
        message: "responses.support.orderDisputeCannotBeTransferredManually"
      });
    }

    const newEmail = String(req.body.newEmail || "").trim().toLowerCase();

    if (newEmail === ticket.assignedTo) {
      return res.json({
        success:false,
        message: "responses.support.ticketAlreadyAssignedToThisEmployee"
      });
    }

    if (!newEmail) {
      return res.json({ success:false, message: "responses.support.employeeRequired" });
    }

    const targetUser = users.get(newEmail);

    if (
      !targetUser ||
      (
        targetUser.role !== ROLE.SUPPORT &&
        targetUser.role !== ROLE.ADMIN &&
        targetUser.role !== ROLE.SUPER_ADMIN
      )
    ) {
      return res.json({ success:false, message: "responses.support.employeeNotFound" });
    }

    if (!isAdminPanelRole(req.user)) {
      return res.json({ success:false, message: "responses.support.onlyAdminCanTransferTickets" });
    }

    const updatedTicket = await supportService.updateTicket(ticket.id, {
      assignedTo: newEmail,
      assignedAt: Date.now(),
      status: "in_progress",
      updatedAt: Date.now()
    });

    await supportService.addLog(ticket.id, "transferred", req.user);

    emitTicketUpdate(updatedTicket, "transferred");

    return res.json({ success:true, ticket: updatedTicket });
  }
);

// Получить тикет + сообщения
app.get("/api/support/tickets/:id", authRequired, async (req, res) => {

  const ticket = await supportService.getTicketById(req.params.id);

  if (!ticket) {
    return res.json({ success: false, message: "responses.support.ticketNotFound" });
  }

if (!canAccessSupportTicket(req.user, ticket)) {
  return res.json({
    success: false,
    message: "responses.common.noAccess"
  });
}

let assignedUser = null;

if (ticket.assignedTo) {
  const u = users.get(ticket.assignedTo);
  if (u) {
    assignedUser = {
      email: u.email,
      username: u.username,
      role: u.role
    };
  }
}

const messages = await supportService.getMessages(ticket.id);
const logs = await supportService.getLogs(ticket.id);

const categoryConfig = SUPPORT_CONFIG[ticket.category];

res.json({
  success: true,
  ticket: {
    ...ticket,
    assignedUser,
    categoryLabel: categoryConfig ? categoryConfig.labelKey : ticket.category
  },
  messages,
  logs,
  userRole: req.user.role
});
});

// Добавить сообщение в тикет (со стороны пользователя)
app.post(
  "/api/support/tickets/:id/message",
  authRequired,
  supportMessageLimiter,
  uploadSupportAttachments.array("attachments", 10),
  async (req, res) => {
    const ticket = await supportService.getTicketById(req.params.id);

    const failTicketMessage = (message, extra = {}) => {
      cleanupUploadedFiles(req.files);
      return res.json({
        success: false,
        message,
        ...extra
      });
    };

    if (!ticket) {
      return failTicketMessage("responses.support.ticketNotFound");
    }

    if (!canAccessSupportTicket(req.user, ticket)) {
      return failTicketMessage("responses.common.noAccess");
    }

    const text = String(req.body.text || "").trim().slice(0, 2000);
    let attachments = [];

    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => "/uploads/" + file.filename);
    }

    if (!text && attachments.length === 0) {
      return failTicketMessage("responses.common.emptyMessage");
    }

    const isStaffReply =
      req.user.role === ROLE.SUPPORT ||
      req.user.role === ROLE.RESOLUTION ||
      req.user.role === ROLE.ADMIN ||
      req.user.role === ROLE.SUPER_ADMIN;

    const wasUnassigned = !ticket.assignedTo;

    let updatedTicket;

    try {
      updatedTicket = await supportService.addMessage({
        ticket,
        user: req.user,
        text,
        attachments
      });
    } catch (e) {
      cleanupUploadedFiles(req.files);

      return res.json({
        success: false,
        message: e.message
      });
    }

    try {
      if (isStaffReply && wasUnassigned && updatedTicket.assignedTo === req.user.email) {
        await supportService.addLog(ticket.id, "assigned", req.user);
      }

      emitTicketUpdate(updatedTicket, "message");

      if (isStaffReply && updatedTicket.userEmail !== req.user.email) {
        const ticketOwner = users.get(updatedTicket.userEmail);

        notifyUser(ticketOwner, "support_new_reply", {
          ticketShortId: updatedTicket.shortId,
          subject: updatedTicket.subject,
          preview: text || getAttachmentFallback(ticketOwner?.lang)
        });
      }

      if (!isStaffReply && updatedTicket.assignedTo && updatedTicket.assignedTo !== req.user.email) {
        const assignedUser = users.get(updatedTicket.assignedTo);

        notifyUser(assignedUser, "support_new_user_message", {
          ticketShortId: updatedTicket.shortId,
          subject: updatedTicket.subject,
          senderName: req.user.username || "Пользователь",
          preview: text || getAttachmentFallback(assignedUser?.lang)
        });
      }
    } catch (e) {
      console.error("support post-save side effect error:", e.message);
    }

    return res.json({ success: true, ticket: updatedTicket });
  }
);

// Закрыть тикет
app.post(
  "/api/support/tickets/:id/close",
  authRequired,
  async (req, res) => {
    const ticket = await supportService.getTicketById(req.params.id);

    if (!ticket) {
      return res.json({ success: false, message: "responses.support.ticketNotFound" });
    }

    if (
      req.user.role === ROLE.SUPPORT ||
      req.user.role === ROLE.RESOLUTION ||
      req.user.role === ROLE.ADMIN ||
      req.user.role === ROLE.SUPER_ADMIN
    ) {
      if (
        (req.user.role === ROLE.SUPPORT || req.user.role === ROLE.RESOLUTION) &&
        ticket.assignedTo !== req.user.email
      ) {
        return res.json({
          success:false,
          message: "responses.support.canCloseOnlyAssignedTicket"
        });
      }
    } else if (ticket.userEmail === req.user.email) {
      if (ticket.status !== "in_progress") {
        return res.json({
          success:false,
          message: "responses.support.canCloseOnlyAfterSupportReply"
        });
      }

      const messages = await supportService.getMessages(ticket.id);

      const hasSupportReply = messages.some(m =>
        m.from === "support" || m.userEmail === ticket.assignedTo
      );

      if (!hasSupportReply) {
        return res.json({
          success:false,
          message: "responses.support.supportHasNotRepliedYet"
        });
      }
    } else {
      return res.json({ success:false, message:"responses.common.noAccess" });
    }

    const closedTicket = await supportService.closeTicket(ticket, req.user);
    emitTicketUpdate(closedTicket, "closed");

    const closedByStaff =
      req.user.role === ROLE.SUPPORT ||
      req.user.role === ROLE.RESOLUTION ||
      req.user.role === ROLE.ADMIN ||
      req.user.role === ROLE.SUPER_ADMIN;

    if (closedByStaff && ticket.userEmail !== req.user.email) {
      const ticketOwner = users.get(ticket.userEmail);

      notifyUser(ticketOwner, "support_ticket_closed", {
        ticketShortId: ticket.shortId,
        subject: ticket.subject
      });
    }

    return res.json({ success:true, ticket: closedTicket });
  }
);

// Переоткрыть тикет (только владелец)
app.post(
  "/api/support/tickets/:id/reopen",
  authRequired,
  async (req, res) => {
    const ticket = await supportService.getTicketById(req.params.id);

if (!ticket) {
  return res.json({ success:false, message:"responses.support.ticketNotFound" });
}

    if (ticket.userEmail !== req.user.email) {
      return res.json({ success:false, message:"responses.common.noAccess" });
    }

    if (ticket.status !== "resolved") {
      return res.json({
        success:false,
        message: "responses.support.ticketNotClosed"
      });
    }

    const reopenCount = Number(ticket.reopenCount || 0);

    if (reopenCount >= 1) {
      return res.json({
        success: false,
        message: "responses.support.ticketAlreadyReopenedCreateNew"
      });
    }

    const updatedTicket = await supportService.updateTicket(ticket.id, {
      reopenCount: reopenCount + 1,
      status: "waiting"
    });

    await supportService.addLog(ticket.id, "reopened", req.user);
    emitTicketUpdate(updatedTicket, "reopened");

    res.json({ success:true, ticket: updatedTicket });
  }
);

app.get("/api/admin/settings", authRequired, (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  res.json({
    success: true,
    settings: adminSettings
  });
});

app.put("/api/admin/settings", authRequired, (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const marketplaceFeePercent = Number(req.body.marketplaceFeePercent);
  const maintenanceText = String(req.body.maintenanceText || "").trim();

  if (!Number.isFinite(marketplaceFeePercent) || marketplaceFeePercent < 0 || marketplaceFeePercent > 100) {
    return res.json({ success:false, message: "responses.admin.invalidMarketplaceFee" });
  }

  adminSettings.marketplaceFeePercent = marketplaceFeePercent;
  adminSettings.maintenanceText = maintenanceText;

  saveAdminSettings();

addAdminLog({
  actor: req.user,
  action: "save_settings",
  targetType: "settings",
  targetId: "platform",
  textKey: "adminLogs.saveSettings"
});

  res.json({
    success: true,
    settings: adminSettings
  });
});

// Получить список пользователей (только admin)
app.get("/api/admin/users", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

const list = Array.from(users.values()).map(u => ({
  email: u.email,
  username: u.username,
  userId: u.userId || null,
  role: u.role || "user",
  banned: Boolean(u.banned),
  createdAt: u.createdAt
}));

  res.json({ success:true, users:list });
});

app.get("/api/admin/stats", authRequired, async (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const allTickets = await supportService.getAllTickets();

  const commissions = orders
    .filter(o => o.status === "completed")
    .reduce((sum, o) => sum + Number(o.commission || 0), 0);

  const onlineUsers = Array.from(users.values())
    .filter(u => Boolean(u.online)).length;

  const bannedUsers = Array.from(users.values())
    .filter(u => Boolean(u.banned)).length;

  const pendingOrders = orders
    .filter(o => o.status === "pending").length;

  const stats = {
    users: users.size,
    offers: offers.filter(o => o.status !== "deleted").length,
    orders: orders.length,
    revenue: commissions,
    openTickets: allTickets.filter(t => t.status !== "resolved").length,
    onlineUsers,
    bannedUsers,
    pendingOrders
  };

  res.json({
    success: true,
    stats
  });
});

app.get("/api/admin/logs", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const q = String(req.query.q || "").trim().toLowerCase();

  let items = adminLogs.slice();

  if (q) {
    items = items.filter(log =>
      String(log.actorEmail || "").toLowerCase().includes(q) ||
      String(log.actorUsername || "").toLowerCase().includes(q) ||
      String(log.action || "").toLowerCase().includes(q) ||
      String(log.targetType || "").toLowerCase().includes(q) ||
      String(log.targetId || "").toLowerCase().includes(q) ||
      String(log.text || "").toLowerCase().includes(q)
    );
  }

  res.json({
    success: true,
    logs: items
  });
});

app.get("/api/admin/search", authRequired, async (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const q = String(req.query.q || "").trim();
  const needle = q.toLowerCase();

  if (!needle) {
    return res.json({
      success: true,
      users: [],
      orders: [],
      tickets: [],
      offers: []
    });
  }

  const foundUsers = Array.from(users.values())
    .filter(u =>
      String(u.email || "").toLowerCase().includes(needle) ||
      String(u.username || "").toLowerCase().includes(needle) ||
      String(u.userId || "").toLowerCase().includes(needle)
    )
    .slice(0, 10)
    .map(u => ({
      email: u.email,
      username: u.username,
      userId: u.userId || null,
      role: u.role || "user",
      banned: Boolean(u.banned),
      createdAt: u.createdAt || null
    }));

const foundOrders = orders
  .filter(o => {
    const buyer = users.get(o.buyerEmail);
    const seller = users.get(o.sellerEmail);

    return (
      String(o.id || "").toLowerCase().includes(needle) ||
      String(o.orderNumber || "").toLowerCase().includes(needle) ||
      String(o.buyerEmail || "").toLowerCase().includes(needle) ||
      String(o.sellerEmail || "").toLowerCase().includes(needle) ||
      String(buyer?.username || "").toLowerCase().includes(needle) ||
      String(seller?.username || "").toLowerCase().includes(needle)
    );
  })
  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  .slice(0, 10)
  .map(o => {
    const buyer = users.get(o.buyerEmail);
    const seller = users.get(o.sellerEmail);

    return {
      id: o.id,
      orderNumber: o.orderNumber || o.id,
buyerUsername: buyer?.username || tReq(req, "common.buyerFallback"),
sellerUsername: seller?.username || tReq(req, "common.sellerFallback"),
      buyerEmail: o.buyerEmail || "",
      sellerEmail: o.sellerEmail || "",
      status: o.status || "pending",
      price: Number(o.price || 0),
      commission: Number(o.commission || 0),
      createdAt: o.createdAt || null
    };
  });

const allTickets = await supportService.getAllTickets();

const foundTickets = allTickets
  .filter(t => {
    const creator = users.get(t.userEmail);

    return (
      String(t.id || "").toLowerCase().includes(needle) ||
      String(t.shortId || "").toLowerCase().includes(needle) ||
      String(t.subject || "").toLowerCase().includes(needle) ||
      String(t.userEmail || "").toLowerCase().includes(needle) ||
      String(t.orderId || "").toLowerCase().includes(needle) ||
      String(t.userId || "").toLowerCase().includes(needle) ||
      String(creator?.username || "").toLowerCase().includes(needle)
    );
  })
  .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
  .slice(0, 10)
  .map(t => {
    const creator = users.get(t.userEmail);
    const assigned = t.assignedTo ? users.get(t.assignedTo) : null;
    const categoryConfig = SUPPORT_CONFIG[t.category];

    return {
      id: t.id,
      shortId: t.shortId || t.id,
      subject: t.subject || "",
      categoryLabel: categoryConfig ? categoryConfig.labelKey : (t.category || tReq(req, "common.uncategorized")),
creatorUsername: creator?.username || tReq(req, "common.userFallback"),
      status: t.status || "waiting",
      creatorUserId: creator?.userId || null,
      assignedUsername: assigned?.username || null,
      orderId: t.orderId || null,
      userId: t.userId || null,
      updatedAt: t.updatedAt || t.createdAt || null
    };
  });

  const foundOffers = offers
    .filter(o => {
      const seller = users.get(o.sellerEmail);
      const title =
        o.title?.ru ||
        o.title?.uk ||
        o.title?.en ||
        "";

      return (
        String(o.id || "").toLowerCase().includes(needle) ||
        String(title || "").toLowerCase().includes(needle) ||
        String(o.game || "").toLowerCase().includes(needle) ||
        String(o.mode || "").toLowerCase().includes(needle) ||
        String(o.sellerEmail || "").toLowerCase().includes(needle) ||
        String(seller?.username || "").toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 10)
    .map(o => {
      const seller = users.get(o.sellerEmail);

      return {
        id: o.id,
        title: o.title?.ru || o.title?.uk || o.title?.en || tReq(req, "common.untitled"),
        game: o.game || "—",
        mode: o.mode || "—",
        status: o.status || "inactive",
        price: Number(o.price || 0),
        sellerUsername: seller?.username || o.sellerName || tReq(req, "common.sellerFallback"),
        sellerUserId: seller?.userId || null,
        createdAt: o.createdAt || null
      };
    });

  res.json({
    success: true,
    users: foundUsers,
    orders: foundOrders,
    tickets: foundTickets,
    offers: foundOffers
  });
});

app.get("/api/admin/orders", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const list = orders
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(order => {
      const buyer = users.get(order.buyerEmail);
      const seller = users.get(order.sellerEmail);

      return {
        id: order.id,
        orderNumber: order.orderNumber || order.id,
        buyerEmail: order.buyerEmail,
        sellerEmail: order.sellerEmail,
buyerUsername: buyer?.username || tReq(req, "common.buyerFallback"),
sellerUsername: seller?.username || tReq(req, "common.sellerFallback"),
        status: order.status || "pending",
        price: Number(order.price || 0),
        commission: Number(order.commission || 0),
        createdAt: order.createdAt || null
      };
    });

  res.json({
    success: true,
    orders: list
  });
});

app.post("/api/admin/orders/:id/confirm", authRequired, async (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({ success:false, message:"responses.orders.orderNotFound" });
  }

  try {
    await applyOrderConfirm({
      order,
      actor: req.user,
      systemType: "order_confirmed_admin"
    });

    await closeLinkedDisputeTicket(order, req.user);

addAdminLog({
  actor: req.user,
  action: "confirm_order",
  targetType: "order",
  targetId: order.orderNumber || order.id,
  textKey: "adminLogs.confirmOrder",
  textParams: { orderNumber: order.orderNumber || order.id }
});

    return res.json({ success:true });
  } catch (e) {
    return res.json({
      success: false,
      message: e.message
    });
  }
});

app.post("/api/admin/orders/:id/refund", authRequired, async (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({ success:false, message:"responses.orders.orderNotFound" });
  }

  try {
    await applyOrderRefund({
      order,
      actor: req.user,
      systemType: "order_refunded_admin"
    });

    await closeLinkedDisputeTicket(order, req.user);

addAdminLog({
  actor: req.user,
  action: "refund_order",
  targetType: "order",
  targetId: order.orderNumber || order.id,
  textKey: "adminLogs.refundOrder",
  textParams: { orderNumber: order.orderNumber || order.id }
});

    return res.json({ success:true });
  } catch (e) {
    return res.json({
      success: false,
      message: e.message
    });
  }
});

app.get("/api/admin/offers", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const list = offers
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(offer => {
      const seller = users.get(offer.sellerEmail);

      const title =
        offer.title?.ru ||
        offer.title?.uk ||
        offer.title?.en ||
        tReq(req, "common.untitled");

      return {
        id: offer.id,
        title,
        sellerUsername: seller?.username || offer.sellerName || tReq(req, "common.sellerFallback"),
        sellerEmail: offer.sellerEmail || "",
        sellerUserId: seller?.userId || null,
        game: offer.game || "—",
        mode: offer.mode || "—",
        status: offer.status || "inactive",
        price: Number(offer.price || 0),
        createdAt: offer.createdAt || null
      };
    });

  res.json({
    success: true,
    offers: list
  });
});

app.post("/api/admin/offers/:id/activate", authRequired, async (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const offer = offers.find(o => o.id === req.params.id);
  if (!offer) {
    return res.json({ success:false, message: "responses.admin.offerNotFound" });
  }

  if (offer.status === "deleted") {
    return res.json({ success:false, message: "responses.admin.deletedOfferCannotBeActivated" });
  }

  if (offer.status === "closed") {
    return res.json({ success:false, message: "responses.admin.closedOfferCannotBeActivated" });
  }

  if (offer.status !== "inactive") {
    return res.json({ success:false, message: "responses.admin.offerCannotBeActivated" });
  }

  const updatedOffer = await updateDbOfferRecord(offer.id, {
    status: "active",
    activeUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

addAdminLog({
  actor: req.user,
  action: "activate_offer",
  targetType: "offer",
  targetId: updatedOffer.id,
  textKey: "adminLogs.activateOffer",
  textParams: { offerId: updatedOffer.id }
});

  res.json({ success:true, offer: updatedOffer });
});

app.post("/api/admin/offers/:id/deactivate", authRequired, async (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const offer = offers.find(o => o.id === req.params.id);
if (!offer) {
  return res.json({ success:false, message:"responses.admin.offerNotFound" });
}

  if (offer.status !== "active") {
    return res.json({ success:false, message: "responses.admin.offerAlreadyInactive" });
  }

  const updatedOffer = await updateDbOfferRecord(offer.id, {
    status: "inactive",
    activeUntil: null
  });

addAdminLog({
  actor: req.user,
  action: "deactivate_offer",
  targetType: "offer",
  targetId: updatedOffer.id,
  textKey: "adminLogs.deactivateOffer",
  textParams: { offerId: updatedOffer.id }
});

  res.json({ success:true, offer: updatedOffer });
});

app.delete("/api/admin/offers/:id", authRequired, async (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const offer = offers.find(o => o.id === req.params.id);
if (!offer) {
  return res.json({ success:false, message:"responses.admin.offerNotFound" });
}

  if (offer.status === "deleted") {
    return res.json({ success:false, message: "responses.admin.offerAlreadyDeleted" });
  }

  const updatedOffer = await updateDbOfferRecord(offer.id, {
    status: "deleted",
    activeUntil: null
  });

addAdminLog({
  actor: req.user,
  action: "delete_offer",
  targetType: "offer",
  targetId: updatedOffer.id,
  textKey: "adminLogs.deleteOffer",
  textParams: { offerId: updatedOffer.id }
});

  res.json({ success:true, offer: updatedOffer });
});

// Забанить / разбанить

app.post("/api/admin/ban", authRequired, async (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"responses.common.noAccess" });
  }

  const email = String(req.body.email || "").trim().toLowerCase();
  const banned = parseBoolean(req.body.banned);

  const target = users.get(email);
  if (!target) {
    return res.json({ success:false, message:"responses.common.userNotFound" });
  }

  if (!canBanUser(req.user, target)) {
    return res.json({
      success:false,
      message: "responses.admin.cannotBanThisUser"
    });
  }

  const updatedTarget = await updateDbUserRecord(target.email, { banned });

addAdminLog({
  actor: req.user,
  action: updatedTarget.banned ? "ban" : "unban",
  targetType: "user",
  targetId: updatedTarget.userId || updatedTarget.email,
  textKey: updatedTarget.banned ? "adminLogs.banUser" : "adminLogs.unbanUser",
  textParams: { target: updatedTarget.username || updatedTarget.email }
});

  res.json({
    success:true,
    user: {
      email: updatedTarget.email,
      banned: Boolean(updatedTarget.banned)
    }
  });
});

/* ================== START ================== */
async function startServer() {
  await cleanupExpiredAuthData();
  await loadAuthCacheFromDb();
  await loadOffersCacheFromDb();
  await loadChatCacheFromDb();
  await loadOrdersCacheFromDb();
  await loadReviewsCacheFromDb();
  await loadAdminLogsCacheFromDb();
  await updateRates();

  const HOST = process.env.HOST || "0.0.0.0";

  server.listen(PORT, HOST, () => {
    console.log(`✅ Server running on ${HOST}:${PORT}`);
    startTelegramPolling();
  });
}

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "responses.upload.fileTooLarge"
      });
    }

    return res.status(400).json({
      success: false,
      message: isServerI18nKey(err.message)
        ? err.message
        : "responses.upload.uploadError"
    });
  }

  if (err) {
    console.error("Unhandled error:", err);

    return res.status(500).json({
      success: false,
      message: isServerI18nKey(err.message)
        ? err.message
        : "responses.common.internalError"
    });
  }

  next();
});

let shuttingDown = false;

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`⚠️ ${signal} received. Shutting down...`);

  try {
    io.close();
  } catch (e) {
    console.error("io.close error:", e.message);
  }

  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log("✅ Server closed and Prisma disconnected");
      process.exit(0);
    } catch (err) {
      console.error("❌ Shutdown error:", err);
      process.exit(1);
    }
  });

  setTimeout(async () => {
    try {
      await prisma.$disconnect();
    } catch (_) {}
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => {
  gracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM");
});

startServer().catch(err => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});