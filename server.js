// server.js
require("dotenv").config();

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const express = require("express");
const path = require("path");
const multer = require("multer");
const { sweepAllWallets } = require("./services/sweep.service");
const { getOrCreateDepositWallet } = require("./services/deposit-wallet.service");
const { scanAllDepositWallets, listDeposits } = require("./services/deposit-monitor.service");
const { topupAllWallets } = require("./services/trx-topup.service");
const { readJson, writeJson } = require("./services/json-store.service");

const supportService = require("./services/support.service");

const sharp = require("sharp");
const fs = require("fs");
const SUPPORT_CONFIG = require("./config/support.config");

// ===== FILE UPLOAD CONFIG =====
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueName + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {

    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only images allowed"));
    }

    cb(null, true);
  }
});

// чтобы сервер раздавал картинки
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const app = express();
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server);

const onlineSockets = new Map(); // email -> socket.id
supportService.setSocket(io, onlineSockets);

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

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
  username: "Арбитраж",
  role: "resolution_entity",
  verified: true
});
const OFFICIAL_WELCOME_MESSAGES = Object.freeze({
  ru: [
    "Добро пожаловать в TyPlace!",
    "Ваш аккаунт успешно создан.",
    "В этом чате мы будем отправлять важные уведомления от платформы."
  ].join("\n"),

  uk: [
    "Ласкаво просимо до TyPlace!",
    "Ваш акаунт успішно створено.",
    "У цьому чаті ми будемо надсилати важливі повідомлення від платформи."
  ].join("\n"),

  en: [
    "Welcome to TyPlace!",
    "Your account has been created successfully.",
    "In this chat, we will send important platform notifications."
  ].join("\n")
});

function getOfficialWelcomeMessage(lang) {
  const safeLang = normalizeLang(lang);
  return OFFICIAL_WELCOME_MESSAGES[safeLang] || OFFICIAL_WELCOME_MESSAGES.ru;
}

function hasRole(user, ...roles) {
  return Boolean(user && roles.includes(user.role));
}

function isAdminPanelRole(user) {
  return hasRole(user, ROLE.SUPER_ADMIN);
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

function buildPublicUserPayload(user) {
  if (!user) return null;

  return {
    email: user.email,
    username: user.username || "Пользователь",
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
  if (!order || !isDisputeChatOpen(order)) {
    return false;
  }

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

function getOrCreateOfficialChat(userEmail) {
  const safeUserEmail = String(userEmail || "").trim().toLowerCase();
  if (!safeUserEmail) return null;

  let chat = chats.find(c =>
    (c.buyerEmail === safeUserEmail && c.sellerEmail === OFFICIAL_ACCOUNT.email) ||
    (c.sellerEmail === safeUserEmail && c.buyerEmail === OFFICIAL_ACCOUNT.email)
  );

  if (!chat) {
    chat = {
      id: crypto.randomUUID(),
      buyerEmail: safeUserEmail,
      sellerEmail: OFFICIAL_ACCOUNT.email,
      createdAt: Date.now(),
      blocked: false,
      official: true
    };
    chats.push(chat);
  }

  return chat;
}

function sendOfficialNoticeToUser({ userEmail, text, officialType = "notice", actor }) {
  const safeUserEmail = String(userEmail || "").trim().toLowerCase();
  const chat = getOrCreateOfficialChat(safeUserEmail);
  if (!chat) return null;

  if (Array.isArray(chat.deletedBy)) {
    chat.deletedBy = chat.deletedBy.filter(email => email !== safeUserEmail);
  }

  return pushOfficialMessage({
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
    const socketId = onlineSockets.get(email);
    if (socketId) {
      io.to(socketId).emit("new-message", message);
    }
  });
}

function pushOfficialMessage({ chatId, text, officialType = "notice", actor }) {
  const safeText = String(text || "").trim();
  if (!safeText) return null;

  const message = makeChatMessage({
    chatId,
    fromEmail: OFFICIAL_ACCOUNT.email,
    fromUserId: OFFICIAL_ACCOUNT.userId,
    fromUsername: OFFICIAL_ACCOUNT.username,
    fromRole: OFFICIAL_ACCOUNT.role,
    kind: "official",
    messageType: "official",
    text: safeText,
    media: [],
    officialType,
    meta: {
      actorEmail: actor?.email || "",
      actorUserId: actor?.userId || "",
      actorUsername: actor?.username || "",
      actorRole: actor?.role || "",
      actorVerified: Boolean(actor?.verified)
    }
  });

  messages.push(message);
  emitChatMessageToParticipants(chatId, message);

  return message;
}

const TURNSTILE_ENABLED = process.env.TURNSTILE_ENABLED === "true";

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

/* ================== STORAGE (без БД) ==================
   Потом заменишь на базу данных — логика останется та же.
*/
const users = new Map(); 
const walletHistory = new Map();

const CRYPTO_PENDING_FILE = path.join(__dirname, "data", "crypto-pending.json");
const CRYPTO_PENDING_TTL = 30 * 60 * 1000;

const cryptoDeposits = readJson(CRYPTO_PENDING_FILE, []) || [];

function saveCryptoDeposits() {
  writeJson(CRYPTO_PENDING_FILE, cryptoDeposits);
}

const withdrawRequests = [];
// баланс платформы
let platformBalances = {
  crypto: 0,       // деньги с крипты
  fondy: 0,        // деньги с карт
  paypal: 0,       // деньги для PayPal выплат
  escrow: 0,       // деньги замороженные в сделках
  commission: 0    // прибыль платформы
};
const pendingCodes = new Map(); // email -> { code, expiresAt, mode, tempUsername, lastSentAt, tries }
const sessions = new Map(); // token -> { email, expiresAt }

/* ================== MARKET STORAGE ================== */
const offers = [];
const chats = [];
const messages = [];
const orders = [];
const reviews = [];
const adminLogs = [];

function pushSystemMessage({
  chatId,
  systemType,
  actorEmail = "",
  orderId = "",
  orderNumber = "",
  actorUserId = "",
  actorUsername = "",
  actorRole = ""
}) {
  const message = makeChatMessage({
    chatId,
    fromEmail: "system",
    fromUserId: "",
    fromUsername: "System",
    fromRole: "system",
    kind: "system",
    messageType: "system",
    systemType,
    text: "",
    media: [],
    meta: {
      actorEmail,
      orderId,
      orderNumber,
      actorUserId,
      actorUsername,
      actorRole
    }
  });

  messages.push(message);
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

function applyOrderConfirm({ order, actor, systemType }) {
  if (!order || order.status !== "pending") {
    throw new Error("Подтверждение невозможно");
  }

  const seller = users.get(order.sellerEmail);

  if (!seller) {
    throw new Error("Продавец не найден");
  }

  platformBalances.escrow = roundMoney(
    Math.max(0, Number(platformBalances.escrow || 0) - Number(order.price || 0))
  );

  seller.balance = roundMoney((seller.balance || 0) + Number(order.sellerAmount || 0));

  addWalletHistory(seller.email, {
    type: "sale",
    amount: Number(order.sellerAmount || 0),
    currency: BASE_CURRENCY,
    status: "completed",
    text: `Продажа по заказу ${order.orderNumber}`
  });

  platformBalances.commission = roundMoney(
    (platformBalances.commission || 0) + Number(order.commission || 0)
  );

  order.status = "completed";
  order.completedAt = Date.now();
  order.disputeStatus = "closed";

  const chat = chats.find(c => c.id === order.chatId);

  if (chat) {
    pushSystemMessage({
      chatId: chat.id,
      systemType,
      orderId: order.id,
      orderNumber: order.orderNumber,
      ...getActorMeta(actor)
    });
  }

  return order;
}

function pushResolutionMessage({ order, actor, text, media = [] }) {
  if (!order?.chatId) return null;

  const message = makeChatMessage({
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
    meta: {
      actorEmail: actor?.email || "",
      actorUserId: actor?.userId || "",
      actorUsername: actor?.username || "",
      actorRole: actor?.role || ROLE.RESOLUTION,
      orderId: order.id,
      orderNumber: order.orderNumber
    }
  });

  messages.push(message);
  emitChatMessageToParticipants(order.chatId, message);

  return message;
}

function applyOrderRefund({ order, actor, systemType }) {
  if (!order || order.status !== "pending") {
    throw new Error("Возврат невозможен");
  }

  const buyer = users.get(order.buyerEmail);

  if (!buyer) {
    throw new Error("Покупатель не найден");
  }

  platformBalances.escrow = roundMoney(
    Math.max(0, Number(platformBalances.escrow || 0) - Number(order.price || 0))
  );

  buyer.balance = roundMoney((buyer.balance || 0) + Number(order.price || 0));

  addWalletHistory(buyer.email, {
    type: "refund",
    amount: Number(order.price || 0),
    currency: BASE_CURRENCY,
    status: "completed",
    text: `Возврат по заказу ${order.orderNumber}`
  });

  order.status = "refunded";
  order.refundedAt = Date.now();
  order.disputeStatus = "closed";

  const chat = chats.find(c => c.id === order.chatId);

  if (chat) {
    pushSystemMessage({
      chatId: chat.id,
      systemType,
      orderId: order.id,
      orderNumber: order.orderNumber,
      ...getActorMeta(actor)
    });
  }

  const reviewIndex = reviews.findIndex(r => r.orderId === order.id);

  if (reviewIndex !== -1) {
    reviews.splice(reviewIndex, 1);

    const seller = users.get(order.sellerEmail);

    if (seller) {
      const sellerReviews = reviews.filter(r => r.sellerEmail === seller.email);
      seller.reviewsCount = sellerReviews.length;

      if (seller.reviewsCount >= 10) {
        const avg =
          sellerReviews.reduce((s, r) => s + r.rating, 0) / sellerReviews.length;
        seller.rating = Math.round(avg * 10) / 10;
      } else {
        seller.rating = 0;
      }
    }
  }

  return order;
}

const ADMIN_SETTINGS_FILE = path.join(__dirname, "data", "admin-settings.json");

const rawAdminSettings = readJson(ADMIN_SETTINGS_FILE, {}) || {};

let adminSettings = {
  marketplaceFeePercent: Number(rawAdminSettings.marketplaceFeePercent ?? 10),
  minDepositUah: Number(rawAdminSettings.minDepositUah ?? rawAdminSettings.minDepositEur ?? 20),
  minWithdrawUah: Number(rawAdminSettings.minWithdrawUah ?? rawAdminSettings.minWithdrawEur ?? 20),
  maintenanceText: String(
    rawAdminSettings.maintenanceText || "На сайте ведутся технические работы."
  )
};

function saveAdminSettings(){
  writeJson(ADMIN_SETTINGS_FILE, adminSettings);
}

function addAdminLog({ actor, action, targetType, targetId, text }){
  adminLogs.unshift({
    id: crypto.randomUUID(),
    actorEmail: actor?.email || "",
    actorUsername: actor?.username || "Админ",
    action: action || "action",
    targetType: targetType || "",
    targetId: targetId || "",
    text: text || "",
    createdAt: Date.now()
  });

  if (adminLogs.length > 1000) {
    adminLogs.length = 1000;
  }
}
/* ================== SETTINGS ================== */
const SESSION_DAYS = 2; // ✅ ты говорил максимум 2 дня, не 7

const BASE_CURRENCY = "UAH";

// поставь тут свои реальные лимиты в гривне
const MIN_DEPOSIT_AMOUNT = 20;
const MIN_WITHDRAW_AMOUNT = 20;
const MAX_WITHDRAW_AMOUNT = 5000;

const MIN_CRYPTO_DEPOSIT_USDT = 10;
const MAX_CRYPTO_DEPOSIT_USDT = 5000;

const MIN_CRYPTO_WITHDRAW_USDT = 5;
const MAX_CRYPTO_WITHDRAW_USDT = 2000;
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

let isDepositScanRunning = false;
let isSweepRunning = false;
let isTrxTopupRunning = false;
/* ================== HELPERS ================== */
function addWalletHistory(email, item){
  if (!walletHistory.has(email)) {
    walletHistory.set(email, []);
  }

  walletHistory.get(email).unshift({
    ...item,
    createdAt: Date.now()
  });
}
function roundMoney(n){
  // если у тебя гривны целые — можешь заменить на Math.round(n)
  return Math.round((Number(n) || 0) * 100) / 100; // 2 знака
}
function isValidTronAddress(address) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(address || "").trim());
}

function convertBaseToUsd(amountBase) {
  const usdRate = Number(exchangeRates?.rates?.USD || 0);

  if (!usdRate || !Number.isFinite(usdRate)) {
    return 0;
  }

  return roundMoney(Number(amountBase || 0) * usdRate);
}

function convertUsdToBase(amountUsd) {
  const usdRate = Number(exchangeRates?.rates?.USD || 0);

  if (!usdRate || !Number.isFinite(usdRate)) {
    return 0;
  }

  return roundMoney(Number(amountUsd || 0) / usdRate);
}

const CRYPTO_WITHDRAW_FEE_PERCENT = 4;

function calcCryptoWithdrawByBase(amountBase) {
  const grossUsdt = convertBaseToUsd(amountBase);

  if (!grossUsdt || !Number.isFinite(grossUsdt)) {
    return {
      grossUsdt: 0,
      feeUsdt: 0,
      netUsdt: 0
    };
  }

  const feeUsdt = roundMoney(grossUsdt * (CRYPTO_WITHDRAW_FEE_PERCENT / 100));
  const netUsdt = roundMoney(grossUsdt - feeUsdt);

  return {
    grossUsdt,
    feeUsdt,
    netUsdt
  };
}

function cleanupExpiredCryptoDeposits() {
  let changed = false;
  const nowTime = Date.now();

  cryptoDeposits.forEach(dep => {
    if (
      dep.status === "pending" &&
      dep.createdAt &&
      nowTime - dep.createdAt > CRYPTO_PENDING_TTL
    ) {
      dep.status = "expired";
      dep.expiredAt = nowTime;
      changed = true;
    }
  });

  if (changed) {
    saveCryptoDeposits();
  }
}
function getUserPendingCryptoDeposit(email) {
  cleanupExpiredCryptoDeposits();

  return cryptoDeposits.find(dep =>
    dep.email === email &&
    dep.status === "pending"
  ) || null;
}

function getCryptoDepositExpiresInMs(dep) {
  if (!dep || !dep.createdAt) return 0;
  return Math.max(0, CRYPTO_PENDING_TTL - (Date.now() - dep.createdAt));
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

function sendNotification(user, { type, text }) {
  if (!user || !user.notify) return;

  const safeText = String(text || "").trim();
  if (!safeText) return;

  if (user.notify.email && MAIL_USER && MAIL_PASS) {
    transporter.sendMail({
      from: MAIL_USER,
      to: user.email,
      subject: "TyPlace — уведомление",
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

function generateOfferId(){
  let id;
  let exists = true;

  while (exists) {
    id = Math.floor(10000000 + Math.random() * 90000000).toString();
    exists = offers.some(o => o.offerId === id);
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
  return ["ru", "uk", "en"].includes(lang) ? lang : "ru";
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

function getLangLabel(lang) {
  if (lang === "ru") return "русский";
  if (lang === "uk") return "украинский";
  if (lang === "en") return "английский";
  return lang;
}

function validateOfferTranslations({ interfaceLang, title, description }) {
  const requiredLangs = getRequiredOfferLangs(interfaceLang);

  for (const lang of requiredLangs) {
    const titleValue = String(title?.[lang] || "").trim();
    const descValue = String(description?.[lang] || "").trim();

    if (!titleValue) {
      return {
        success: false,
        message: `Заполните название для языка: ${getLangLabel(lang)}`
      };
    }

    if (!descValue) {
      return {
        success: false,
        message: `Заполните описание для языка: ${getLangLabel(lang)}`
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

async function sendCodeEmail(email, code) {
  const subject = "TyPlace — код подтверждения";
  const text = `Ваш код подтверждения TyPlace: ${code}\n\nЕсли это были не вы — просто проигнорируйте письмо.`;

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

function findUserByTelegramChatId(chatId) {
  const safeChatId = String(chatId || "").trim();
  if (!safeChatId) return null;

  return Array.from(users.values()).find(
    user => String(user.telegramChatId || "") === safeChatId
  ) || null;
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
      "TyPlace Telegram bot подключён. Вернитесь на сайт: Профиль → Уведомления → Telegram."
    );
    return;
  }

  const linkRecord = findTelegramLinkByCode(payload);

  if (!linkRecord) {
    await sendTelegramMessage(
      chatId,
      "Ссылка недействительна или устарела. Откройте TyPlace и запросите новую привязку Telegram."
    );
    return;
  }

  const user = users.get(linkRecord.email);

  if (!user) {
    telegramLinkCodes.delete(linkRecord.email);

    await sendTelegramMessage(
      chatId,
      "Пользователь TyPlace не найден. Запросите новую привязку на сайте."
    );
    return;
  }

  const alreadyLinkedUser = findUserByTelegramChatId(chatId);

  if (alreadyLinkedUser && alreadyLinkedUser.email !== user.email) {
    await sendTelegramMessage(
      chatId,
      "Этот Telegram уже привязан к другому аккаунту TyPlace."
    );
    return;
  }

  user.telegramChatId = chatId;
  user.telegramUsername = from.username ? String(from.username) : "";
  user.telegramFirstName = from.first_name ? String(from.first_name) : "";
  user.telegramLinkedAt = Date.now();

  if (!user.notify) {
    user.notify = {
      site: true,
      email: true,
      telegram: false
    };
  }

  user.notify.telegram = true;

  telegramLinkCodes.delete(linkRecord.email);

  await sendTelegramMessage(
    chatId,
    "Telegram успешно подключён к вашему аккаунту TyPlace. Уведомления в Telegram включены."
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

function authRequired(req, res, next) {

  const token = getToken(req);
  if (!token) return res.status(401).json({ success: false, message: "Нет токена" });

  const s = sessions.get(token);
  if (!s) return res.status(401).json({ success: false, message: "Сессия не найдена" });

  if (now() > s.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ success: false, message: "Сессия истекла" });
  }

const u = users.get(s.email);

if (!u) {
  return res.status(401).json({
    success: false,
    message: "Пользователь не найден"
  });
}

if (u.banned) {
  sessions.delete(token);
  return res.status(403).json({
    success: false,
    message: "Аккаунт заблокирован"
  });
}

  // ✅ ОБНОВЛЕНИЕ СТАТУСА
  u.online = true;
  u.lastSeen = Date.now();

  req.userEmail = s.email;
  req.user = u;
  req.token = token;

  next();
}

function supportRequired(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Нет доступа" });
  }

  if (!isSupportRole(req.user)) {
    return res.status(403).json({ success: false, message: "Только для поддержки" });
  }

  next();
}

function authRequiredOptional(req, res, next) {
  const token = getToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  const s = sessions.get(token);
  if (!s || Date.now() > s.expiresAt) {
    req.user = null;
    return next();
  }

  const u = users.get(s.email);
  if (!u) {
    req.user = null;
    return next();
  }

  req.user = u;
  req.userEmail = u.email;

  next();
}

/* ================== API ================== */

/**
 * POST /auth/request-code
 * body: { email, mode: "login" | "register", username?: string }
 */
app.post("/auth/request-code", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const mode = String(req.body.mode || "").trim();
    const username = String(req.body.username || "").trim();
// ===== TURNSTILE CHECK (только для регистрации) =====
// ===== TURNSTILE CHECK =====
if (TURNSTILE_ENABLED && mode === "register") {

  const isLocal =
    req.ip === "127.0.0.1" ||
    req.ip === "::1" ||
    req.ip.startsWith("192.168");

  const token = req.body["cf-turnstile-response"];

  // если локальная разработка — пропускаем капчу
  if (!isLocal) {

    if (!token) {
      return res.json({
        success:false,
        message:"Подтвердите что вы не робот."
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
          success:false,
          message:"Проверка безопасности не пройдена."
        });
      }

    } catch (e) {
      return res.json({
        success:false,
        message:"Ошибка проверки безопасности."
      });
    }

  }

}
    if (!isEmailValid(email)) {
      return res.json({ success: false, message: "Введите корректный email." });
    }
    if (mode !== "login" && mode !== "register") {
      return res.json({ success: false, message: "Неверный режим." });
    }

    const userExists = users.has(email);

    if (mode === "login" && !userExists) {
      return res.json({ success: false, message: "Аккаунт не найден. Перейдите в «Регистрация»." });
    }

    if (mode === "register") {
      if (userExists) {
        return res.json({ success: false, message: "Этот email уже зарегистрирован. Перейдите во «Вход»." });
      }
      if (!username || username.length < 3) {
        return res.json({ success: false, message: "Введите ник (минимум 3 символа)." });
      }
      if (username.length > 20) {
        return res.json({ success: false, message: "Ник слишком длинный (макс. 20)." });
      }
    }

    // анти-спам: не чаще чем раз в 30 секунд
    const existing = pendingCodes.get(email);
    if (existing && existing.lastSentAt && now() - existing.lastSentAt < 30_000) {
      const wait = Math.ceil((30_000 - (now() - existing.lastSentAt)) / 1000);
      return res.json({ success: false, message: `Подождите ${wait} сек. и попробуйте снова.` });
    }

    const code = genCode6();
    const record = {
      code,
      mode,
      tempUsername: mode === "register" ? username : "",
      expiresAt: now() + 10 * 60 * 1000, // 10 минут
      lastSentAt: now(),
      tries: 0,
    };
    pendingCodes.set(email, record);

    await sendCodeEmail(email, code);

    return res.json({ success: true, message: "Код отправлен." });
  } catch (e) {
    console.log("request-code error:", e);
    return res.json({ success: false, message: "Ошибка отправки кода." });
  }
});

/**
 * POST /auth/verify-code
 * body: { email, code, mode: "login"|"register" }
 */
app.post("/auth/verify-code", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const code = String(req.body.code || "").trim();
  const mode = String(req.body.mode || "").trim();
  const lang = normalizeLang(req.body.lang || "ru");

  if (!isEmailValid(email)) return res.json({ success: false, message: "Некорректный email." });
  if (!/^\d{6}$/.test(code)) return res.json({ success: false, message: "Код должен быть из 6 цифр." });
  if (mode !== "login" && mode !== "register") return res.json({ success: false, message: "Неверный режим." });

  const rec = pendingCodes.get(email);
  if (!rec) return res.json({ success: false, message: "Сначала нажмите «Получить код»." });
  if (rec.mode !== mode) return res.json({ success: false, message: "Код был отправлен для другого действия." });
  if (now() > rec.expiresAt) {
    pendingCodes.delete(email);
    return res.json({ success: false, message: "Код истёк. Нажмите «Получить код» ещё раз." });
  }

  rec.tries += 1;
  if (rec.tries > 7) {
    pendingCodes.delete(email);
    return res.json({ success: false, message: "Слишком много попыток. Запросите новый код." });
  }

  if (rec.code !== code) {
    return res.json({ success: false, message: "Неверный код." });
  }

  // успех
  pendingCodes.delete(email);

if (mode === "register") {
  if (users.has(email)) {
    return res.json({ success: false, message: "Этот email уже зарегистрирован. Перейдите во «Вход»." });
  }

  const username = rec.tempUsername || "User";

  users.set(email, {
    email,
    username,
    userId: generateUserId(),
    avatarDataUrl: "",
    avatarUrl: "",
    createdAt: new Date().toISOString(),
    usernameChangedAt: null,
    online: false,
    lastSeen: Date.now(),
    balance: 0,
    banned: false,
    role: SUPER_ADMIN_EMAILS.includes(email)
      ? ROLE.SUPER_ADMIN
      : ROLE.USER,
    blockedUsers: [],
    notify: {
      site: true,
      email: true,
      telegram: false
    },
    telegramChatId: null
  });

try {
  sendOfficialNoticeToUser({
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
    if (!users.has(email)) {
      return res.json({ success: false, message: "Аккаунт не найден. Перейдите в «Регистрация»." });
    }
  }

  const token = makeToken();
  sessions.set(token, { email, expiresAt: now() + SESSION_DAYS * 24 * 60 * 60 * 1000 });

  const u = users.get(email);
  return res.json({
    success: true,
    token,
    user: {
      email: u.email,
      username: u.username,
      avatarDataUrl: u.avatarDataUrl || "",
      avatarUrl: u.avatarUrl || "",
    },
  });
});

/**
 * GET /auth/me (проверка токена)
 * header: Authorization: Bearer <token>
 */
app.get("/auth/me", authRequired, (req, res) => {
  const u = req.user;
  // если старый пользователь без ID — создаём ID
if (!u.userId) {
  u.userId = generateUserId();
}
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
  },
});
});

/**
 * POST /auth/logout (опционально)
 * header: Authorization: Bearer <token>
 */
app.post("/auth/logout", authRequired, (req, res) => {
  sessions.delete(req.token);
  return res.json({ success: true });
});

app.post("/api/official/messages", authRequired, (req, res) => {
if (!canWriteOfficial(req.user)) {
  return res.json({
    success: false,
    message: "Нет доступа"
  });
}

  const userEmail = String(req.body.userEmail || "").trim().toLowerCase();
  const text = String(req.body.text || "").trim();
  const officialType = String(req.body.officialType || "notice").trim();

  if (!userEmail || !users.has(userEmail)) {
    return res.json({
      success: false,
      message: "Пользователь не найден"
    });
  }

  if (!text) {
    return res.json({
      success: false,
      message: "Пустое сообщение"
    });
  }

const message = sendOfficialNoticeToUser({
  userEmail,
  text,
  officialType,
  actor: req.user
});

  if (!message) {
    return res.json({
      success: false,
      message: "Не удалось отправить официальное сообщение"
    });
  }

  addAdminLog({
    actor: req.user,
    action: "official_message",
    targetType: "user",
    targetId: userEmail,
    text: `Отправил официальное сообщение пользователю ${userEmail}`
  });

  return res.json({
    success: true,
    message
  });
});

app.post("/api/official/chat", authRequired, (req, res) => {
  const chat = getOrCreateOfficialChat(req.user.email);

  if (!chat) {
    return res.json({
      success: false,
      message: "Не удалось создать официальный чат"
    });
  }

  if (Array.isArray(chat.deletedBy)) {
    chat.deletedBy = chat.deletedBy.filter(email => email !== req.user.email);
  }

  return res.json({
    success: true,
    chat: {
      ...chat,
      otherUser: buildPublicUserPayload(
        getUserByEmailSafe(OFFICIAL_ACCOUNT.email)
      )
    }
  });
});

app.post("/api/official/chat/by-user", authRequired, (req, res) => {
  if (!canWriteOfficial(req.user)) {
    return res.json({
      success: false,
      message: "Нет доступа"
    });
  }

  const userEmail = String(req.body.userEmail || "").trim().toLowerCase();

  if (!userEmail || !users.has(userEmail)) {
    return res.json({
      success: false,
      message: "Пользователь не найден"
    });
  }

  const chat = getOrCreateOfficialChat(userEmail);

  if (!chat) {
    return res.json({
      success: false,
      message: "Не удалось создать официальный чат"
    });
  }

  if (Array.isArray(chat.deletedBy)) {
    chat.deletedBy = chat.deletedBy.filter(email => email !== userEmail);
  }

  return res.json({
    success: true,
    chat: {
      ...chat,
      otherUser: buildPublicUserPayload(
        getUserByEmailSafe(userEmail)
      )
    }
  });
});

app.get("/api/support/users/search", authRequired, (req, res) => {
  if (!canWriteOfficial(req.user)) {
    return res.json({
      success: false,
      message: "Нет доступа"
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
      username: u.username || "Пользователь",
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

app.post("/api/admin/set-role", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success: false, message: "Нет доступа" });
  }

  const email = String(req.body.email || "").trim().toLowerCase();
  const role = String(req.body.role || "").trim();

  const target = users.get(email);
  if (!target) {
    return res.json({ success: false, message: "Пользователь не найден" });
  }

  if (!Object.values(ROLE).includes(role)) {
    return res.json({ success: false, message: "Неверная роль" });
  }

  if (!canSetRole(req.user, target, role)) {
    return res.json({
      success: false,
      message: "Недостаточно прав для смены этой роли"
    });
  }

  const oldRole = target.role || ROLE.USER;
  target.role = role;

  addAdminLog({
    actor: req.user,
    action: "set_role",
    targetType: "user",
    targetId: target.userId || target.email,
    text: `Сменил роль пользователя ${target.username || target.email}: ${oldRole} → ${role}`
  });

  res.json({ success: true });
});

/**
 * PUT /profile (обновление профиля)
 * header: Authorization: Bearer <token>
 * body: { username?, avatarUrl?, avatarDataUrl? }
 */
app.put("/profile", authRequired, (req, res) => {
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

  // ===== USERNAME =====
  if (username && username !== u.username) {
    if (username.length < 3) {
      return res.json({
        success: false,
        code: "USERNAME_TOO_SHORT",
        message: "Ник минимум 3 символа."
      });
    }

    if (username.length > 20) {
      return res.json({
        success: false,
        code: "USERNAME_TOO_LONG",
        message: "Ник слишком длинный (макс. 20)."
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
        message: "Ник можно менять только раз в 30 дней.",
        nextUsernameChangeAt
      });
    }

    u.username = username;
    u.usernameChangedAt = Date.now();
  }

  // ===== AVATAR =====
  if (avatarUrl) {
    u.avatarUrl = avatarUrl;
    u.avatarDataUrl = "";
  } else if (avatarDataUrl) {
    u.avatarDataUrl = avatarDataUrl;
    u.avatarUrl = "";
  }

  users.set(u.email, u);

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
    },
  });
});
/**
 * GET /api/settings/notifications
 */
app.get("/api/settings/notifications", authRequired, (req, res) => {
  if (!req.user.notify) {
    req.user.notify = {
      site: true,
      email: true,
      telegram: false
    };
  }

  res.json({
    success: true,
    notify: req.user.notify,
    telegramLinked: Boolean(req.user.telegramChatId),
    telegramUsername: req.user.telegramUsername || "",
    telegramBotUsername: TELEGRAM_BOT_USERNAME || ""
  });
});

/**
 * PUT /api/settings/notifications
 * body: { site?, email?, telegram? }
 */
app.put("/api/settings/notifications", authRequired, (req, res) => {
  const { site, email, telegram } = req.body;

  if (!req.user.notify) {
    req.user.notify = { site: true, email: true, telegram: false };
  }

  if (typeof site === "boolean") {
    req.user.notify.site = site;
  }

  if (typeof email === "boolean") {
    req.user.notify.email = email;
  }

  if (typeof telegram === "boolean") {
    if (telegram && !req.user.telegramChatId) {
      return res.json({
        success: false,
        code: "TELEGRAM_NOT_LINKED",
        message: "Сначала подключите Telegram"
      });
    }

    req.user.notify.telegram = telegram;
  }

  res.json({
    success: true,
    notify: req.user.notify,
    telegramLinked: Boolean(req.user.telegramChatId),
    telegramUsername: req.user.telegramUsername || "",
    telegramBotUsername: TELEGRAM_BOT_USERNAME || ""
  });
});

app.post("/api/settings/telegram/link", authRequired, (req, res) => {
  if (!isTelegramConfigured()) {
    return res.json({
      success: false,
      message: "Telegram не настроен на сервере"
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

app.post("/api/settings/telegram/unlink", authRequired, (req, res) => {
  req.user.telegramChatId = null;
  req.user.telegramUsername = "";
  req.user.telegramFirstName = "";
  req.user.telegramLinkedAt = null;

  if (!req.user.notify) {
    req.user.notify = { site: true, email: true, telegram: false };
  }

  req.user.notify.telegram = false;
  telegramLinkCodes.delete(req.user.email);

  return res.json({
    success: true,
    notify: req.user.notify
  });
});

/* ================== BALANCE ================== */

// получить баланс
app.get("/api/balance", authRequired, (req, res) => {
  res.json({
    success: true,
    balance: req.user.balance || 0
  });
});
app.get("/api/rates", (req, res) => {
  res.json({
    success: true,
    base: exchangeRates.base,
    rates: exchangeRates.rates,
    updatedAt: exchangeRates.updatedAt
  });
});

app.get("/api/public/platform-settings", (req, res) => {
  res.json({
    success: true,
    settings: {
      marketplaceFeePercent: Number(adminSettings.marketplaceFeePercent ?? 10),
      minDepositUah: Number(adminSettings.minDepositUah ?? 0),
      minWithdrawUah: Number(adminSettings.minWithdrawUah ?? 0),
      maintenanceText: String(adminSettings.maintenanceText ?? "")
    }
  });
});

app.post("/api/balance/deposit", authRequired, (req, res) => {
  const amount = Number(req.body.amount || 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.json({
      success: false,
      message: "Некорректная сумма"
    });
  }

  req.user.balance = roundMoney((req.user.balance || 0) + amount);

  addWalletHistory(req.user.email, {
    type: "deposit",
    amount,
    currency: BASE_CURRENCY,
    status: "completed",
    text: "Тестовое пополнение баланса"
  });

  return res.json({
    success: true,
    balance: req.user.balance,
    message: "Баланс успешно пополнен (тест)"
  });
});

app.post("/api/deposit/crypto", authRequired, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const replaceExisting = parseBoolean(req.body.replaceExisting);

    if (!amount || amount <= 0) {
      return res.json({
        success: false,
        message: "Некорректная сумма"
      });
    }

if (amount < MIN_CRYPTO_DEPOSIT_USDT) {
  return res.json({
    success: false,
    message: `Минимальный депозит ${MIN_CRYPTO_DEPOSIT_USDT} USDT`
  });
}

if (amount > MAX_CRYPTO_DEPOSIT_USDT) {
  return res.json({
    success: false,
    message: `Максимальный депозит ${MAX_CRYPTO_DEPOSIT_USDT} USDT`
  });
}
cleanupExpiredCryptoDeposits();

const existing = cryptoDeposits.find(
  d => d.email === req.user.email && d.status === "pending"
);
    // Если уже есть активный депозит и пользователь НЕ просил заменить
    if (existing && !replaceExisting) {
      return res.json({
        success: false,
        code: "PENDING_DEPOSIT_EXISTS",
        message: "У вас уже есть активный депозит",
        pending: true,
        depositId: existing.id,
        address: existing.address,
        amount: existing.amountExpected,
        network: existing.network || "TRC20",
        expiresInMs: getCryptoDepositExpiresInMs(existing)
      });
    }

    // Если есть активный депозит и пользователь просит заменить его новым
    if (existing && replaceExisting) {
      existing.status = "cancelled";
      existing.cancelledAt = Date.now();
      existing.cancelReason = "replaced_by_user";
      saveCryptoDeposits();
    }

    const wallet = await getOrCreateDepositWallet(req.user);

const deposit = {
  id: crypto.randomUUID(),
  email: req.user.email,
  userId: req.user.userId || null,
  amountExpected: amount,
  amountReceived: 0,
  currency: "USDT",
  network: "TRC20",
  address: wallet.address,
  provider: "tron",
  status: "pending",
  txHash: null,
  confirmations: 0,
  createdAt: Date.now()
};

    cryptoDeposits.push(deposit);
    saveCryptoDeposits();

    return res.json({
      success: true,
      depositId: deposit.id,
      address: wallet.address,
      amount,
      network: "TRC20",
      expiresInMs: CRYPTO_PENDING_TTL
    });
  } catch (e) {
    console.log("create crypto deposit error:", e);
    return res.json({
      success: false,
      message: "Ошибка создания депозита"
    });
  }
});

app.get("/api/deposit/crypto/pending", authRequired, (req, res) => {
  const pending = getUserPendingCryptoDeposit(req.user.email);

  if (!pending) {
    return res.json({
      success: true,
      pending: false
    });
  }

  return res.json({
    success: true,
    pending: true,
    depositId: pending.id,
    address: pending.address,
    amount: pending.amountExpected,
    network: pending.network || "TRC20",
    createdAt: pending.createdAt,
    expiresInMs: getCryptoDepositExpiresInMs(pending)
  });
});

app.get("/api/wallet/crypto/deposit-address", authRequired, async (req, res) => {
  try {
    const wallet = await getOrCreateDepositWallet(req.user);

    res.json({
      success: true,
      address: wallet.address,
      network: "TRC20",
      currency: "USDT"
    });
  } catch (e) {
    console.log("get deposit address error:", e);
    res.json({
      success: false,
      message: "Не удалось получить адрес"
    });
  }
});

async function autoCreditTronDeposit({ wallet, txid, amount }) {
  if (!txid) {
    console.log("skip credit: empty txid");
    return;
  }

  if (amount < 1) {
    console.log("Deposit too small:", txid);
    return;
  }

  const alreadyCreditedInHistory = Array.from(walletHistory.values()).some(items =>
    (items || []).some(item => item.txHash === txid)
  );

  const alreadyCreditedOnDisk =
    listDeposits().some(dep => dep.txHash === txid) ||
    cryptoDeposits.some(dep => dep.txHash === txid);

  if (alreadyCreditedInHistory || alreadyCreditedOnDisk) {
    console.log("TX already credited:", txid);
    return;
  }

  const user = users.get(wallet.email);
  if (!user) {
    console.log("user not found for deposit:", wallet.email);
    return;
  }

  const amountBase = convertUsdToBase(amount);

  if (!amountBase || amountBase <= 0) {
    console.log("Deposit conversion error:", txid);
    return;
  }

  user.balance = roundMoney((user.balance || 0) + amountBase);
  platformBalances.crypto = roundMoney((platformBalances.crypto || 0) + amount);

  addWalletHistory(user.email, {
    type: "deposit",
    amount,
    currency: "USDT",
    status: "completed",
    text: "Крипто пополнение (USDT TRC20)",
    txHash: txid
  });

  const pending = cryptoDeposits.find(
    d =>
      d.email === wallet.email &&
      d.address === wallet.address &&
      d.status === "pending"
  );

  if (pending && pending.amountExpected && amount < pending.amountExpected) {
    console.log("Deposit smaller than expected");
  }

  if (pending) {
    pending.status = "completed";
    pending.txHash = txid;
    pending.amountReceived = amount;
    pending.confirmedAt = Date.now();
    saveCryptoDeposits();
  }

  console.log("Auto credited:", wallet.email, amount, txid);
}

app.post("/api/withdraw/request", authRequired, (req, res) => {
  const amount = Number(req.body.amount);
  const method = String(req.body.method || "crypto").trim();
  const wallet = String(req.body.wallet || "").trim();

  if (method !== "crypto") {
  return res.json({
    success: false,
    message: "Этот способ вывода сейчас недоступен"
  });
}
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.json({
      success: false,
      message: "Некорректная сумма"
    });
  }
const minWithdrawBase = Number(adminSettings.minWithdrawUah ?? MIN_WITHDRAW_AMOUNT);

if (amount < minWithdrawBase) {
  return res.json({
    success: false,
    message: `Минимальный вывод ${minWithdrawBase} ${BASE_CURRENCY}`
  });
}
  if (req.user.balance < amount) {
    return res.json({
      success: false,
      message: "Недостаточно средств"
    });
  }

  const existing = withdrawRequests.find(
    w => w.email === req.user.email && w.status === "pending"
  );

  if (existing) {
    return res.json({
      success: false,
      message: "У вас уже есть заявка на вывод"
    });
  }

  const request = {
    id: crypto.randomUUID(),
    email: req.user.email,
    amount: roundMoney(amount),
    method,
    status: "pending",
    createdAt: Date.now()
  };

  if (method === "crypto") {
    if (!wallet) {
      return res.json({
        success: false,
        message: "Введите адрес кошелька"
      });
    }

    if (!isValidTronAddress(wallet)) {
      return res.json({
        success: false,
        message: "Неверный формат адреса TRC20"
      });
    }

    const { grossUsdt, feeUsdt, netUsdt } = calcCryptoWithdrawByBase(amount);

    if (!grossUsdt || grossUsdt <= 0 || !netUsdt || netUsdt <= 0) {
      return res.json({
        success: false,
        message: "Не удалось определить сумму в USDT"
      });
    }

    if (netUsdt < MIN_CRYPTO_WITHDRAW_USDT) {
      return res.json({
        success: false,
        message: `Минимальная сумма к получению ${MIN_CRYPTO_WITHDRAW_USDT} USDT`
      });
    }

    if (netUsdt > MAX_CRYPTO_WITHDRAW_USDT) {
      return res.json({
        success: false,
        message: `Максимальная сумма к получению ${MAX_CRYPTO_WITHDRAW_USDT} USDT`
      });
    }

    request.wallet = wallet;
    request.network = "TRC20";
    request.currency = BASE_CURRENCY;
    request.amountUsdtGross = grossUsdt;
    request.amountUsdtNet = netUsdt;
    request.feePercent = CRYPTO_WITHDRAW_FEE_PERCENT;
    request.feeUsdt = feeUsdt;
  } else {
    if (amount > MAX_WITHDRAW_AMOUNT) {
      return res.json({
        success: false,
        message: `Максимальный вывод ${MAX_WITHDRAW_AMOUNT} ${BASE_CURRENCY}`
      });
    }

    if (amount < MIN_WITHDRAW_AMOUNT) {
      return res.json({
        success: false,
        message: `Минимальный вывод ${MIN_WITHDRAW_AMOUNT} ${BASE_CURRENCY}`
      });
    }

    request.currency = BASE_CURRENCY;
    request.wallet = wallet;
  }

  req.user.balance = roundMoney((req.user.balance || 0) - request.amount);

  withdrawRequests.push(request);

  res.json({
    success: true,
    request
  });
});

app.post("/api/withdraw/:id/cancel", authRequired, (req,res)=>{

  const w = withdrawRequests.find(x => x.id === req.params.id);

  if (!w){
    return res.json({ success:false });
  }

  if (w.email !== req.user.email){
    return res.json({ success:false });
  }

  if (w.status !== "pending"){
    return res.json({ success:false });
  }

req.user.balance = roundMoney((req.user.balance || 0) + Number(w.amount || 0));

  w.status = "cancelled";

  res.json({ success:true });

});

app.get("/api/admin/withdraws", authRequired, (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success: false, message: "Нет доступа" });
  }

  const list = withdrawRequests.map(w => {
    const user = users.get(w.email);

    return {
      id: w.id,
      email: w.email,
      username: user?.username || "Пользователь",
      userId: user?.userId || null,
      amount: w.amount,
      currency: w.currency || BASE_CURRENCY,
      method: w.method || "crypto",
      wallet: w.wallet || "",
      network: w.network || null,
      amountUsdtGross: Number(w.amountUsdtGross || 0),
      amountUsdtNet: Number(w.amountUsdtNet || 0),
      feePercent: Number(w.feePercent || 0),
      feeUsdt: Number(w.feeUsdt || 0),
      status: w.status,
      createdAt: w.createdAt
    };
  });

  res.json({
    success: true,
    withdraws: list
  });
});

app.post("/api/admin/withdraw/:id/approve", authRequired, (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success: false });
  }

  const w = withdrawRequests.find(x => x.id === req.params.id);

  if (!w) {
    return res.json({ success: false, message: "Заявка не найдена" });
  }

  if (w.status !== "pending") {
    return res.json({ success: false, message: "Заявка уже обработана" });
  }

  const user = users.get(w.email);

  if (!user) {
    return res.json({ success: false, message: "Пользователь не найден" });
  }

  if (w.method === "crypto") {
    const amountUsdtNet = Number(w.amountUsdtNet || 0);

    if (!amountUsdtNet || amountUsdtNet <= 0) {
      return res.json({
        success: false,
        message: "Некорректная сумма USDT"
      });
    }

    if (Number(platformBalances.crypto || 0) < amountUsdtNet) {
      return res.json({
        success: false,
        message: "Недостаточно USDT резерва платформы"
      });
    }

    platformBalances.crypto = roundMoney(
      Number(platformBalances.crypto || 0) - amountUsdtNet
    );

    addWalletHistory(user.email, {
      type: "withdraw",
      amount: -Number(w.amount || 0),
      currency: BASE_CURRENCY,
      status: "completed",
      text: `Вывод ${Number(w.amountUsdtNet || 0)} USDT (TRC20)`
    });
  } else {
    return res.json({
      success: false,
      message: "Этот способ вывода сейчас недоступен"
    });
  }

  w.status = "approved";
  w.approvedAt = Date.now();

  addAdminLog({
    actor: req.user,
    action: "withdraw_approve",
    targetType: "withdraw",
    targetId: w.id,
    text: `Подтвердил выплату ${w.amount}`
  });

  res.json({ success: true });
});

app.post("/api/admin/withdraw/:id/reject", authRequired, (req,res)=>{

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  const w = withdrawRequests.find(x => x.id === req.params.id);

  if (!w){
    return res.json({ success:false, message:"Заявка не найдена" });
  }

  if (w.status !== "pending"){
    return res.json({ success:false, message:"Заявка уже обработана" });
  }

  const user = users.get(w.email);

  if (!user){
    return res.json({ success:false, message:"Пользователь не найден" });
  }

  user.balance = roundMoney((user.balance || 0) + Number(w.amount || 0));
  w.status = "rejected";

addWalletHistory(user.email,{
  type:"withdraw",
  amount:Number(w.amount || 0),
  currency: BASE_CURRENCY,
  status:"failed",
  text:"Заявка на вывод отклонена, средства возвращены"
});

  addAdminLog({
    actor:req.user,
    action:"withdraw_reject",
    targetType:"withdraw",
    targetId:w.id,
    text:`Отклонил выплату ${w.amount}`
  });

  res.json({ success:true });

});

/* ================== WALLET HISTORY ================== */

app.get("/api/wallet/history", authRequired, (req, res) => {
  res.json({
    success: true,
    items: walletHistory.get(req.user.email) || []
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
app.post("/api/offers/:id/activate", authRequired, (req, res) => {

  const offer = offers.find(o => o.id === req.params.id);

  if (!offer) {
    return res.json({ success: false, message: "Оффер не найден" });
  }

  if (offer.sellerEmail !== req.user.email) {
    return res.json({ success: false, message: "Нет доступа" });
  }

  if (offer.status !== "inactive") {
    return res.json({
      success: false,
      message: "Оффер нельзя активировать"
    });
  }

  offer.status = "active";
  offer.activeUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;

  res.json({ success: true });
});


// ===== ДЕАКТИВИРОВАТЬ ОФФЕР =====
app.post("/api/offers/:id/deactivate", authRequired, (req, res) => {

  const offer = offers.find(o => o.id === req.params.id);

  if (!offer) {
    return res.json({ success: false, message: "Оффер не найден" });
  }

  if (offer.sellerEmail !== req.user.email) {
    return res.json({ success: false, message: "Нет доступа" });
  }

  if (offer.status !== "active") {
    return res.json({
      success: false,
      message: "Оффер уже не активен"
    });
  }

  offer.status = "inactive";
  offer.activeUntil = null;

  res.json({ success: true });
});
// ===== КЛОНИРОВАТЬ ПРОДАННЫЙ ОФФЕР =====
app.post("/api/offers/:id/clone", authRequired, (req, res) => {

  const oldOffer = offers.find(o => o.id === req.params.id);

  if (!oldOffer) {
    return res.json({ success:false, message:"Оффер не найден" });
  }

  if (oldOffer.sellerEmail !== req.user.email) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  if (oldOffer.status !== "closed") {
    return res.json({
      success:false,
      message:"Можно клонировать только проданный оффер"
    });
  }

const newOffer = {
  ...oldOffer,
  id: crypto.randomUUID(),
  offerId: generateOfferId(),
  status: "active",
  createdAt: Date.now(),
  activeUntil: Date.now() + 7 * 24 * 60 * 60 * 1000
};

  offers.push(newOffer);

  res.json({ success:true });

});
/* ================== CHATS ================== */

/**
 * POST /api/offers
 * создание объявления
 */
app.post("/api/offers", authRequired, upload.array("images", 5), async (req, res) => {

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
      return res.json({ success: false, message: "Не все поля заполнены" });
    }
const priceNumber = Number(price);

if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
  return res.json({
    success: false,
    message: "Некорректная цена"
  });
}

if (priceNumber < MIN_OFFER_PRICE) {
  return res.json({
    success: false,
    message: `Минимальная цена ${MIN_OFFER_PRICE} ${BASE_CURRENCY}`
  });
}

if (priceNumber > MAX_OFFER_PRICE) {
  return res.json({
    success: false,
    message: `Максимальная цена ${MAX_OFFER_PRICE} ${BASE_CURRENCY}`
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

    const outputPath = path.join(
      __dirname,
      "uploads",
      outputFilename
    );

    await sharp(inputPath)
      .resize(600) // можно 600, нормальный баланс
      .jpeg({ quality: 92 })
      .toFile(outputPath);

    fs.unlinkSync(inputPath);

    imageUrls.push("/uploads/" + outputFilename);
  }
}

const offer = {
  id: crypto.randomUUID(),
  offerId: generateOfferId(),

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
    };

    offers.push(offer);

    return res.json({ success: true, offer });

  } catch (err) {
    console.error("Image processing error:", err);
    return res.json({
      success: false,
      message: "Ошибка обработки изображения"
    });
  }
});
/* ================== EDIT OFFER ================== */
app.put("/api/offers/:id", authRequired, upload.array("images", 5), async (req, res) => {

  const offer = offers.find(o => o.id === req.params.id);
  if (!offer) {
    return res.json({ success:false, message:"Оффер не найден" });
  }

  if (offer.sellerEmail !== req.user.email) {
    return res.json({ success:false, message:"Нет доступа" });
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

  // 💰 цена
if (price !== undefined) {
  const net = roundMoney(Number(price));

  if (!Number.isFinite(net) || net <= 0) {
    return res.json({
      success: false,
      message: "Некорректная цена"
    });
  }

  if (net < MIN_OFFER_PRICE) {
    return res.json({
      success: false,
      message: `Минимальная цена ${MIN_OFFER_PRICE} ${BASE_CURRENCY}`
    });
  }

  if (net > MAX_OFFER_PRICE) {
    return res.json({
      success: false,
      message: `Максимальная цена ${MAX_OFFER_PRICE} ${BASE_CURRENCY}`
    });
  }

  offer.priceNet = net;
  offer.price = calcGrossFromNet(net);
}

  // 📂 категория
  offer.category = category || null;

  // 📝 названия
offer.title = title;
offer.description = description;
// ===== ОБНОВЛЯЕМ ВСЕ ОСНОВНЫЕ ПОЛЯ =====

const {
  amount,
  method,
  country,
  accountType,
  accountRegion,
  voiceChat
} = req.body;

if (amount !== undefined) {
  offer.amount = amount ? Number(amount) : null;
}

if (method !== undefined) {
  offer.method = method || null;
}

if (country !== undefined) {
  offer.country = country || null;
}

if (accountType !== undefined) {
  offer.accountType = accountType || null;
}

if (accountRegion !== undefined) {
  offer.accountRegion = accountRegion || null;
}

if (voiceChat !== undefined) {
offer.voiceChat =
  voiceChat === "yes" ? true :
  voiceChat === "no" ? false :
  null;
}
// 🔥 ОБНОВЛЕНИЕ EXTRA ПОЛЕЙ (ТОЛЬКО ДИНАМИЧЕСКИЕ ФИЛЬТРЫ)

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

// на всякий случай чистим старый мусор
delete newExtra.game;
delete newExtra.mode;
delete newExtra.category;

offer.extra = newExtra;

  // 🖼️ фото — ТОЛЬКО если загрузили новые
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

    offer.images = imageUrls;
    offer.imageUrl = imageUrls[0] || null;
  }

  res.json({ success:true, offer });
});
// 🗑️ УДАЛЕНИЕ ОФФЕРА
app.delete("/api/offers/:id", authRequired, (req, res) => {

  const index = offers.findIndex(o => o.id === req.params.id);

  if (index === -1) {
    return res.json({ success: false, message: "Оффер не найден" });
  }

  const offer = offers[index];

  if (offer.sellerEmail !== req.user.email) {
    return res.json({ success: false, message: "Нет доступа" });
  }

offer.status = "deleted";
offer.activeUntil = null;

  res.json({ success: true });
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
  subsFrom,
  subsTo,
  lang
} = req.query;
// 🔥 безопасный язык
const langSafe =
  ["ru","uk","en"].includes(lang)
    ? lang
    : "ru";

// 🔧 нормализация range-фильтров (subscribers)
const normalizedSubsFrom =
  req.query.subscribers_from ?? subsFrom;

const normalizedSubsTo =
  req.query.subscribers_to ?? subsTo;

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
  "subsFrom",
  "subsTo",
  "subscribers_from",
  "subscribers_to",
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
// 📺 YouTube + Telegram — фильтр по подписчикам
if (
  (game === "youtube" || game === "telegram") &&
  mode === "Каналы"
) {
  result = result.filter(o => {
    const subs = Number(o.extra?.subscribers || 0);

if (normalizedSubsFrom && subs < Number(normalizedSubsFrom)) return false;
if (normalizedSubsTo && subs > Number(normalizedSubsTo)) return false;

    return true;
  });
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
seller: seller ? (() => {

  if (!seller.userId) {
    seller.userId = generateUserId();
  }

return {
  username: seller.username || "Продавец",
  userId: seller.userId,
  role: seller.role || ROLE.USER,
  verified: Boolean(seller.verified),
  avatarUrl: seller.avatarUrl || null,
  avatarDataUrl: seller.avatarDataUrl || null,
  online: Boolean(seller.online),
  rating: seller.rating || 0,
  reviewsCount: seller.reviewsCount || 0,
  createdAt: seller.createdAt
};

})() : {
        username: "Продавец",
        avatarUrl: null,
        avatarDataUrl: null,
        online: false,
        rating: 0,
        reviewsCount: 0
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
seller: seller ? (() => {

  if (!seller.userId) {
    seller.userId = generateUserId();
  }

  return {
    username: seller.username || "Продавец",
    userId: seller.userId,
    avatarUrl: seller.avatarUrl || null,
    avatarDataUrl: seller.avatarDataUrl || null,
    online: Boolean(seller.online),
    rating: seller.rating || 0,
    reviewsCount: seller.reviewsCount || 0,
    createdAt: seller.createdAt
  };

})() : {
        username: "Продавец",
        avatarUrl: null,
        avatarDataUrl: null,
        online: false,
        rating: 0,
        reviewsCount: 0
      }
    }
  });
});
setInterval(() => {
  const now = Date.now();

  users.forEach(user => {
    if (now - user.lastSeen > 60000) {
      user.online = false;
    }
  });
}, 30000);
// ===== CREATE / GET CHAT BY OFFER =====
app.post("/api/chats/start", authRequired, (req, res) => {
  const { offerId } = req.body;

  const offer = offers.find(o => o.id === offerId);
  
  if (!offer) {
    return res.json({ success:false, message:"Оффер не найден" });
  }

  if (offer.sellerEmail === req.user.email) {
    const seller = users.get(offer.sellerEmail);

if (seller?.blockedUsers?.includes(req.user.email)) {
  return res.json({
    success: false,
    message: "Товар недоступен"
  });
}
    return res.json({
      success: false,
      message: "Нельзя писать самому себе"
    });
  }
// 🔒 Если продавец заблокировал покупателя
const seller = users.get(offer.sellerEmail);

if (seller?.blockedUsers?.includes(req.user.email)) {
  return res.json({
    success: false,
    message: "Товар недоступен"
  });
}

  let chat = chats.find(c =>
    (c.buyerEmail === req.user.email && c.sellerEmail === offer.sellerEmail) ||
    (c.sellerEmail === req.user.email && c.buyerEmail === offer.sellerEmail)
  );

  if (!chat) {
    chat = {
      id: crypto.randomUUID(),
      buyerEmail: req.user.email,
      sellerEmail: offer.sellerEmail,
      offerId: offer.id,      // 🔥 ВАЖНО
      createdAt: Date.now(),
      blocked: false
    };
    chats.push(chat);
  } else {
    chat.offerId = offer.id;  // 🔥 обновляем если перешёл с другого оффера
  }

  res.json({ success:true, chat });
});

// ===== GET MY CHATS =====
app.get("/api/chats", authRequired, (req, res) => {

  const myEmail = req.user.email;

const myChats = chats
  .filter(c => {
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

      const otherEmail =
        c.buyerEmail === myEmail
          ? c.sellerEmail
          : c.buyerEmail;

      const otherUser = getUserByEmailSafe(otherEmail);

      // 🔥 ИЩЕМ ПОСЛЕДНЕЕ СООБЩЕНИЕ
      const chatMessages = messages
        .filter(m => m.chatId === c.id)
        .sort((a,b) => b.createdAt - a.createdAt);

      const lastMessage = chatMessages[0] || null;

      return {
        ...c,
        lastMessage,
        blockedByMe: req.user.blockedUsers?.includes(otherEmail) || false,
otherUser: buildPublicUserPayload(otherUser)
      };
    })
    // 🔥 СОРТИРОВКА ПО ПОСЛЕДНЕМУ СООБЩЕНИЮ
    .sort((a,b) => {
      const aTime = a.lastMessage?.createdAt || a.createdAt;
      const bTime = b.lastMessage?.createdAt || b.createdAt;
      return bTime - aTime;
    });

  res.json({ success: true, chats: myChats });
});

// ===== MESSAGES =====
app.post("/api/chats/:id/messages", authRequired, (req, res) => {
  const { text, media, officialType } = req.body;

  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) {
    return res.json({
      success: false,
      message: "Чат не найден"
    });
  }

  const safeText = String(text || "").trim();
  const safeMedia = Array.isArray(media) ? media : [];

  if (!safeText && safeMedia.length === 0) {
    return res.json({
      success: false,
      message: "Пустое сообщение"
    });
  }

  if (isOfficialChat(chat)) {
    if (canWriteOfficial(req.user)) {
      if (safeMedia.length > 0) {
        return res.json({
          success: false,
          message: "В официальный чат пока нельзя отправлять вложения"
        });
      }

      const message = pushOfficialMessage({
        chatId: chat.id,
        text: safeText,
        officialType: String(officialType || "notice").trim() || "notice",
        actor: req.user
      });

      return res.json({
        success: true,
        message
      });
    }

    if (!isChatParticipant(req.user, chat)) {
      return res.json({
        success: false,
        message: "Нет доступа"
      });
    }
  } else {
    if (
      chat.buyerEmail !== req.user.email &&
      chat.sellerEmail !== req.user.email
    ) {
      return res.json({
        success: false,
        message: "Нет доступа"
      });
    }
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
      message: "Вы заблокированы этим пользователем"
    });
  }

  if (chat.deletedBy) {
    if (chat.deletedBy.includes(otherEmail)) {
      const otherUser = getUserByEmailSafe(otherEmail);

      if (!otherUser?.blockedUsers?.includes(myEmail)) {
        chat.deletedBy = chat.deletedBy.filter(e => e !== otherEmail);
      }
    }
  }

  if (req.user.blockedUsers?.includes(otherEmail)) {
    return res.json({
      success: false,
      message: "Пользователь заблокирован"
    });
  }

  const message = makeChatMessage({
    chatId: req.params.id,
    fromEmail: req.user.email,
    fromUserId: req.user.userId || "",
    fromUsername: req.user.username || "Пользователь",
    fromRole: req.user.role || ROLE.USER,
    kind: "user",
    messageType: "user",
    staffRole: null,
    text: safeText,
    media: safeMedia
  });

  messages.push(message);
  emitChatMessageToParticipants(chat.id, message);

  res.json({ success: true, message });
});

// ===== SEND FILE TO CHAT =====
app.post("/api/chats/:id/files", authRequired, upload.single("file"), (req, res) => {
  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) {
    return res.json({ success:false, message:"Чат не найден" });
  }

  if (isOfficialChat(chat)) {
    return res.json({
      success: false,
      message: "В официальный чат пока нельзя отправлять файлы"
    });
  }

  if (
    chat.buyerEmail !== req.user.email &&
    chat.sellerEmail !== req.user.email
  ) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  if (!req.file) {
    return res.json({ success:false, message:"Файл не найден" });
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
      message: "Вы заблокированы этим пользователем"
    });
  }

  if (chat.deletedBy?.includes(otherEmail)) {
    if (!otherUser?.blockedUsers?.includes(myEmail)) {
      chat.deletedBy = chat.deletedBy.filter(e => e !== otherEmail);
    }
  }

  if (req.user.blockedUsers?.includes(otherEmail)) {
    return res.json({
      success:false,
      message:"Пользователь заблокирован"
    });
  }

  const fileUrl = "/uploads/" + req.file.filename;

  const message = makeChatMessage({
    chatId: req.params.id,
    fromEmail: req.user.email,
    fromUserId: req.user.userId || "",
    fromUsername: req.user.username || "Пользователь",
    fromRole: req.user.role || ROLE.USER,
    kind: "user",
    messageType: "user",
    staffRole: null,
    text: "",
    media: [fileUrl]
  });

  messages.push(message);
  emitChatMessageToParticipants(chat.id, message);

  res.json({
    success: true,
    fileUrl,
    message
  });
});

// ===== GET ONE CHAT =====
app.get("/api/chats/:id", authRequired, (req, res) => {

  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) {
    return res.json({ success:false });
  }

  // проверка доступа
if (!canViewChat(req.user, chat)) {
  return res.json({
    success: false,
    message: "Нет доступа"
  });
}

  const otherEmail =
    chat.buyerEmail === req.user.email
      ? chat.sellerEmail
      : chat.buyerEmail;

const otherUser = getUserByEmailSafe(otherEmail);

  res.json({
    success: true,
    chat: {
      ...chat,
otherUser: buildPublicUserPayload(otherUser)
    }
  });
});

// ===== GET MESSAGES =====
app.get("/api/chats/:id/messages", authRequired, (req, res) => {
  const chatId = req.params.id;

  const chat = chats.find(c => c.id === chatId);
  if (!chat) {
    return res.json({ success:false });
  }

  // проверяем доступ
if (!canViewChat(req.user, chat)) {
  return res.json({
    success: false,
    message: "Нет доступа"
  });
}

  const chatMessages = messages
    .filter(m => m.chatId === chatId)
    .sort((a,b)=>a.createdAt - b.createdAt);

  res.json({
    success:true,
    messages: chatMessages
  });
});

/* ================== REVIEWS ================== */

// создать отзыв
app.post("/api/reviews", authRequired, (req, res) => {
  const { orderId, rating, text } = req.body;

  const order = orders.find(o => o.id === orderId);
  if (!order) {
    return res.json({ success:false, message:"Заказ не найден" });
  }

  // только покупатель
  if (order.buyerEmail !== req.user.email) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  // только завершённый заказ
  if (order.status !== "completed") {
    return res.json({ success:false, message:"Отзыв можно оставить только после завершения сделки" });
  }

  // только один отзыв
  const exists = reviews.find(r => r.orderId === orderId);
  if (exists) {
    return res.json({ success:false, message:"Отзыв уже оставлен" });
  }

  const review = {
    id: crypto.randomUUID(),
    orderId,
    sellerEmail: order.sellerEmail,
    buyerEmail: order.buyerEmail,
    rating: Math.max(1, Math.min(5, Number(rating))),
    text: String(text || "").slice(0, 1000),
    createdAt: Date.now()
  };

  reviews.push(review);

  // пересчёт рейтинга продавца
const seller = users.get(order.sellerEmail);
if (!seller) {
  return res.json({ success:false, message:"Продавец не найден" });
}
const sellerReviews = reviews.filter(r => r.sellerEmail === seller.email);
  seller.reviewsCount = sellerReviews.length;

  if (seller.reviewsCount >= 10) {
  const avg =
    sellerReviews.reduce((s, r) => s + r.rating, 0) / sellerReviews.length;

  seller.rating = Math.round(avg * 10) / 10; // ⭐ 1 знак после запятой
} else {
  seller.rating = 0; // ❓ рейтинг скрыт
}
const orderChat = chats.find(c => c.id === order.chatId);

if (orderChat) {
pushSystemMessage({
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
app.post("/api/orders/create", authRequired, (req, res) => {
  const { offerId } = req.body;

  const offer = offers.find(o => o.id === offerId);
  if (!offer) {
    return res.json({ success: false, message: "Оффер не найден" });
  }

  // ❗ Нельзя купить у себя
  if (offer.sellerEmail === req.user.email) {
    return res.json({ success: false, message: "Нельзя купить у себя" });
  }

  // 🔒 ПРОВЕРКА БЛОКИРОВКИ
  const seller = users.get(offer.sellerEmail);

  if (seller?.blockedUsers?.includes(req.user.email)) {
    return res.json({
      success: false,
      message: "Товар недоступен"
    });
  }

  if (offer.status !== "active") {
    return res.json({ success:false, message:"Оффер недоступен" });
  }

  if (offer.activeUntil && Date.now() > offer.activeUntil) {
    offer.status = "inactive";
    return res.json({ success:false, message:"Оффер истёк" });
  }

  const net = roundMoney(offer.priceNet ?? offer.price);
  const gross = roundMoney(offer.price ?? calcGrossFromNet(net));
  const commission = roundMoney(gross - net);

  if (req.user.balance < gross) {
    return res.json({ success: false, message: "Недостаточно средств" });
  }

  // 💰 Списываем средства
req.user.balance = roundMoney((req.user.balance || 0) - gross);
platformBalances.escrow = roundMoney((platformBalances.escrow || 0) + gross);
  // 📩 Гарантируем чат
  let chat = chats.find(c =>
    (c.buyerEmail === req.user.email && c.sellerEmail === offer.sellerEmail) ||
    (c.sellerEmail === req.user.email && c.buyerEmail === offer.sellerEmail)
  );

  if (!chat) {
    chat = {
      id: crypto.randomUUID(),
      buyerEmail: req.user.email,
      sellerEmail: offer.sellerEmail,
      createdAt: Date.now(),
      blocked: false
    };
    chats.push(chat);
  }

const order = {
  id: crypto.randomUUID(),
  orderNumber: generateOrderCode(),
  offerId,
  chatId: chat.id,
  buyerEmail: req.user.email,
  sellerEmail: offer.sellerEmail,
  price: gross,
  sellerAmount: net,
  commission: commission,
  status: "pending",
  createdAt: Date.now(),

  // ===== DISPUTE / RESOLUTION =====
  disputeStatus: "none",          // none | requested | in_review | closed
  disputeTicketId: null,
  resolutionAssignedTo: null,
  resolutionAssignedAt: null,
  resolutionRequestedAt: null,

  // ===== ORDER DATES =====
  completedAt: null,
  refundedAt: null,

  // 🔥 СНИМОК ОФФЕРА НА МОМЕНТ ПОКУПКИ
  offerSnapshot: {
    id: offer.id,
    title: offer.title,
    description: offer.description,
    imageUrl: offer.imageUrl,
    price: offer.price
  }
};

  orders.push(order);
addWalletHistory(req.user.email, {
  type: "purchase",
  amount: -gross,
  currency: BASE_CURRENCY,
  status: "completed",
  text: `Оплата заказа ${order.orderNumber}`
});
  offer.status = "closed";
  offer.activeUntil = null;

pushSystemMessage({
  chatId: chat.id,
  systemType: "order_created",
  actorEmail: req.user.email,
  actorUserId: req.user.userId || "",
  actorUsername: req.user.username || "",
  actorRole: req.user.role || "user",
  orderId: order.id,
  orderNumber: order.orderNumber
});

  const sellerUser = users.get(order.sellerEmail);
  sendNotification(sellerUser, {
    type: "order",
    text: "У вас новый заказ на TyPlace"
  });

  res.json({ success: true, order });
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
  return res.json({ success:false, message:"Нет доступа" });
}

  const offer = offers.find(o => o.id === order.offerId);

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

app.post("/api/orders/:id/resolution-message", authRequired, (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({
      success: false,
      message: "Заказ не найден"
    });
  }

  if (!isResolutionRole(req.user)) {
    return res.status(403).json({
      success: false,
      message: "Только Resolution может писать в чат заказа от лица арбитража"
    });
  }

  if (order.disputeStatus !== "requested" && order.disputeStatus !== "in_review") {
    return res.json({
      success: false,
      message: "По этому заказу нет активного спора"
    });
  }

  if (
    !isAdminPanelRole(req.user) &&
    order.resolutionAssignedTo !== req.user.email
  ) {
    return res.status(403).json({
      success: false,
      message: "Этот спор назначен другому сотруднику Resolution"
    });
  }

  const safeText = String(req.body.text || "").trim();
  const safeMedia = Array.isArray(req.body.media) ? req.body.media : [];

  if (!safeText && safeMedia.length === 0) {
    return res.json({
      success: false,
      message: "Пустое сообщение"
    });
  }

  const message = pushResolutionMessage({
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

app.post("/api/orders/:id/resolution-decision", authRequired, (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({
      success: false,
      message: "Заказ не найден"
    });
  }

  if (!isResolutionRole(req.user)) {
    return res.status(403).json({
      success: false,
      message: "Только Resolution может принимать решение по спору"
    });
  }

  if (order.status !== "pending") {
    return res.json({
      success: false,
      message: "Решение по этому заказу уже принято"
    });
  }

  if (order.disputeStatus !== "requested" && order.disputeStatus !== "in_review") {
    return res.json({
      success: false,
      message: "По этому заказу нет активного спора"
    });
  }

  if (
    !isAdminPanelRole(req.user) &&
    order.resolutionAssignedTo !== req.user.email
  ) {
    return res.status(403).json({
      success: false,
      message: "Этот спор назначен другому сотруднику Resolution"
    });
  }

  const decision = String(req.body.decision || "").trim().toLowerCase();
  const safeText = String(req.body.text || "").trim();

  if (!["confirm", "refund"].includes(decision)) {
    return res.json({
      success: false,
      message: "Некорректное решение"
    });
  }

  if (!safeText) {
    return res.json({
      success: false,
      message: "Укажите текст решения"
    });
  }

  const resolutionMessage = pushResolutionMessage({
    order,
    actor: req.user,
    text: safeText,
    media: []
  });

  try {
    if (decision === "confirm") {
      applyOrderConfirm({
        order,
        actor: req.user,
        systemType: "resolution_confirmed"
      });
    } else {
      applyOrderRefund({
        order,
        actor: req.user,
        systemType: "resolution_refunded"
      });
    }

    const disputeTicket = order.disputeTicketId
      ? supportService.getTicketById(order.disputeTicketId)
      : null;

    if (disputeTicket && disputeTicket.status !== "resolved") {
      supportService.closeTicket(disputeTicket, req.user);
      emitTicketUpdate(disputeTicket, "closed");
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
app.post("/api/orders/:id/confirm", authRequired, (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({
      success: false,
      message: "Заказ не найден"
    });
  }

  if (order.buyerEmail !== req.user.email) {
    return res.json({ success: false });
  }

try {
  applyOrderConfirm({
    order,
    actor: req.user,
    systemType: "order_confirmed"
  });

  closeLinkedDisputeTicket(order, req.user);

  return res.json({ success: true });
} catch (e) {
    return res.json({
      success: false,
      message: e.message
    });
  }
});

// продавец делает возврат
app.post("/api/orders/:id/refund", authRequired, (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({
      success: false,
      message: "Заказ не найден"
    });
  }

  if (order.sellerEmail !== req.user.email) {
    return res.json({ success: false });
  }

try {
  applyOrderRefund({
    order,
    actor: req.user,
    systemType: "order_refunded"
  });

  closeLinkedDisputeTicket(order, req.user);

  return res.json({ success: true });
} catch (e) {
    return res.json({
      success: false,
      message: e.message
    });
  }
});

// авто-деактивация офферов
setInterval(() => {
  const now = Date.now();

  offers.forEach(o => {
    if (o.status === "active" && o.activeUntil && now > o.activeUntil) {
      o.status = "inactive";
      o.activeUntil = null;   // 👈 добавляем это
    }
  });
}, 60 * 1000);
app.get("/api/my-sales", authRequired, (req, res) => {
  const mySales = orders
    .filter(o => o.sellerEmail === req.user.email)
    .map(o => {
      const offer = offers.find(of => of.id === o.offerId);
      return { ...o, offer };
    });

  res.json({ success: true, sales: mySales });
});
app.get("/api/my-purchases", authRequired, (req, res) => {
  const myPurchases = orders
    .filter(o => o.buyerEmail === req.user.email)
    .map(o => {
      const offer = offers.find(of => of.id === o.offerId);
      return { ...o, offer };
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
          username: buyer?.username || "Покупатель"
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
    .filter(Boolean);

  res.json({ success: true, reviews: result });
});
// 🔥 Получить отзывы по userId
app.get("/api/users/:id/reviews-by-id", (req, res) => {

  const userId = String(req.params.id || "").trim();

  const user = Array.from(users.values())
    .find(u => u.userId === userId);

  if (!user) {
    return res.json({ success:false, message:"Пользователь не найден" });
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
          username: buyer?.username || "Покупатель",
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
    });

  res.json({ success: true, reviews: result });
});

// Публичный профиль по ID
app.get("/api/users/by-id/:id", (req, res) => {

  const userId = String(req.params.id || "").trim();

  const user = Array.from(users.values())
    .find(u => u.userId === userId);

  if (!user) {
    return res.json({ success:false, message:"Пользователь не найден" });
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
/* ================== MARK AS READ ================== */

app.post("/api/chats/:id/read", authRequired, (req, res) => {
  const chatId = req.params.id;
  const myEmail = req.user.email;

  const chat = chats.find(c => c.id === chatId);
  if (!chat) {
    return res.json({ success:false, message:"Чат не найден" });
  }

if (!canViewChat(req.user, chat)) {
  return res.json({ success: true, skipped: true });
}

  messages.forEach(m => {
    if (
      m.chatId === chatId &&
      m.fromEmail !== myEmail &&
      m.read === false
    ) {
      m.read = true;
    }
  });

  res.json({ success: true });
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

    // если я заблокировал этого пользователя — не считаем
    if (req.user.blockedUsers?.includes(m.fromEmail)) {
      return false;
    }

    return true;
  });

  res.json({
    success: true,
    count: unread.length
  });
});

// ===== BLOCK / UNBLOCK USER =====
app.post("/api/users/block", authRequired, (req, res) => {

  const { chatId } = req.body;
  const chat = chats.find(c => c.id === chatId);

  if (!chat) {
    return res.json({ success:false });
  }
if (
  chat.buyerEmail !== req.user.email &&
  chat.sellerEmail !== req.user.email
) {
  return res.json({
    success: false,
    message: "Нет доступа"
  });
}

  const myEmail = req.user.email;

  const otherEmail =
    chat.buyerEmail === myEmail
      ? chat.sellerEmail
      : chat.buyerEmail;

  if (!otherEmail) {
    return res.json({ success:false });
  }
if (isOfficialEmail(otherEmail)) {
  return res.json({
    success: false,
    message: "Официальный аккаунт нельзя блокировать"
  });
}  
const otherUser = users.get(otherEmail);

if (
  otherUser &&
  isProtectedStaffRole(otherUser.role)
) {
  return res.json({
    success: false,
    message: "Сотрудников нельзя блокировать"
  });
}
  if (!req.user.blockedUsers) {
    req.user.blockedUsers = [];
  }

  const alreadyBlocked = req.user.blockedUsers.includes(otherEmail);

  if (alreadyBlocked) {
    // разблокировать
    req.user.blockedUsers =
      req.user.blockedUsers.filter(e => e !== otherEmail);

    return res.json({ success:true, blocked:false });
  }

  // заблокировать
  req.user.blockedUsers.push(otherEmail);

  return res.json({ success:true, blocked:true });

});
app.delete("/api/chats/:id", authRequired, (req, res) => {
  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) return res.json({ success:false });

  const myEmail = req.user.email;

  if (
    chat.buyerEmail !== myEmail &&
    chat.sellerEmail !== myEmail
  ) {
    return res.json({
      success: false,
      message: "Нет доступа"
    });
  }

  if (!chat.deletedBy) chat.deletedBy = [];

  if (!chat.deletedBy.includes(myEmail)) {
    chat.deletedBy.push(myEmail);
  }

  res.json({ success:true });
});

/* ================== SOCKET.IO ================== */

io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

socket.on("auth", ({ token }) => {
  try {
    const s = sessions.get(String(token || ""));
    if (!s) return;

    if (Date.now() > s.expiresAt) {
      sessions.delete(token);
      return;
    }

    onlineSockets.set(s.email, socket.id);
    socket.data.email = s.email;

    // 🔥 ВОТ ЭТО ДОБАВЛЕНО
    const myChats = chats.filter(c =>
      c.buyerEmail === s.email || c.sellerEmail === s.email
    );

    myChats.forEach(c => {
      socket.join("chat:" + c.id);
    });

  } catch(e) {}
});

socket.on("disconnect", () => {
  const email = socket.data.email;
  if (email && onlineSockets.get(email) === socket.id) {
    onlineSockets.delete(email);
    return;
  }

  // fallback если email не сохранился
  for (const [e, id] of onlineSockets.entries()) {
    if (id === socket.id) {
      onlineSockets.delete(e);
      break;
    }
  }
});
});
function emitTicketUpdate(ticket, event){
  // всем support/admin онлайн
  users.forEach(u => {
    if (
  (u.role === ROLE.SUPPORT || u.role === ROLE.ADMIN || u.role === ROLE.SUPER_ADMIN) &&
  onlineSockets.has(u.email)
) {
      io.to(onlineSockets.get(u.email)).emit("support-ticket-updated", {
        event,
        ticketId: ticket.id,
        status: ticket.status,
        assignedTo: ticket.assignedTo || null,
        priority: ticket.priority || "normal",
        updatedAt: ticket.updatedAt
      });
    }
  });

  // владельцу тикета
  if (onlineSockets.has(ticket.userEmail)) {
    io.to(onlineSockets.get(ticket.userEmail)).emit("support-ticket-updated", {
      event,
      ticketId: ticket.id,
      status: ticket.status,
      assignedTo: ticket.assignedTo || null,
      priority: ticket.priority || "normal",
      updatedAt: ticket.updatedAt
    });
  }

  // назначенному
  if (ticket.assignedTo && onlineSockets.has(ticket.assignedTo)) {
    io.to(onlineSockets.get(ticket.assignedTo)).emit("support-ticket-updated", {
      event,
      ticketId: ticket.id,
      status: ticket.status,
      assignedTo: ticket.assignedTo || null,
      priority: ticket.priority || "normal",
      updatedAt: ticket.updatedAt
    });
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

function closeLinkedDisputeTicket(order, actor) {
  if (!order?.disputeTicketId) return;

  const disputeTicket = supportService.getTicketById(order.disputeTicketId);
  if (!disputeTicket || disputeTicket.status === "resolved") return;

  supportService.closeTicket(disputeTicket, actor);
  emitTicketUpdate(disputeTicket, "closed");
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
  upload.array("attachments", 10),
  (req, res) => {

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
  return res.json({
    success: false,
    message: "Введите ID пользователя"
  });
}

if (category === "report_offer" && !offerIdDigits) {
  return res.json({
    success: false,
    message: "Введите ID объявления"
  });
}

if (userIdDigits) {
  const targetUser = Array.from(users.values())
    .find(u => String(u.userId || "") === userIdDigits);

  if (!targetUser) {
    return res.json({
      success: false,
      message: "Пользователь не найден"
    });
  }
}

if (offerIdDigits) {
  const targetOffer = offers.find(o =>
    String(o.offerId || "") === offerIdDigits &&
    o.status !== "deleted"
  );

  if (!targetOffer) {
    return res.json({
      success: false,
      message: "Объявление не найдено"
    });
  }
}

const message = String(req.body.message || "").trim().slice(0, 2000);
let priority = "normal";
let linkedOrder = null;

if (category === "order") {
  priority = "high";
}

    let attachments = [];

    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => "/uploads/" + file.filename);
    }

    if (!subject) {
      return res.json({ success: false, message: "Введите тему" });
    }

    if (!message) {
      return res.json({ success: false, message: "Введите описание" });
    }
// 🔐 Если указали заказ — проверяем его существование
let finalOrderId = normalizedOrderId || rawOrderId;

if (rawOrderId) {
  const order = orders.find(o =>
    o.id === rawOrderId ||
    o.orderNumber === rawOrderId.toUpperCase() ||
    o.orderNumber === normalizedOrderId
  );

  if (!order) {
    return res.json({
      success: false,
      message: "Заказ не найден"
    });
  }

  if (
    order.buyerEmail !== req.user.email &&
    order.sellerEmail !== req.user.email
  ) {
    return res.json({
      success: false,
      message: "Вы не являетесь участником этого заказа"
    });
  }

  if (category === "order") {
    if (order.status !== "pending") {
      return res.json({
        success: false,
        message: "Спор можно открыть только по активному заказу"
      });
    }

    if (
      order.disputeStatus === "requested" ||
      order.disputeStatus === "in_review"
    ) {
      return res.json({
        success: false,
        message: "По этому заказу спор уже открыт"
      });
    }
  }

  linkedOrder = order;
  finalOrderId = order.orderNumber || order.id;
}

// максимум 3 активных тикета
const activeTickets = supportService
  .getTicketsForUser(req.user)
  .filter(t => t.status !== "resolved");

if (activeTickets.length >= 3) {
  return res.json({
    success:false,
    message:"У вас слишком много активных тикетов"
  });
}
try {

const ticket = supportService.createTicket({
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

if (category === "order" && linkedOrder) {
  ticket.kind = "order_dispute";
  ticket.chatId = linkedOrder.chatId;
  ticket.orderInternalId = linkedOrder.id;

  linkedOrder.disputeStatus = "requested";
  linkedOrder.disputeTicketId = ticket.id;

  if (!linkedOrder.resolutionRequestedAt) {
    linkedOrder.resolutionRequestedAt = Date.now();
  }

  pushSystemMessage({
    chatId: linkedOrder.chatId,
    systemType: "resolution_requested",
    actorEmail: req.user.email,
    actorUserId: req.user.userId || "",
    actorUsername: req.user.username || "",
    actorRole: req.user.role || "user",
    orderId: linkedOrder.id,
    orderNumber: linkedOrder.orderNumber
  });
}

// 🔔 Уведомляем всех support онлайн
users.forEach(u => {
if (
  (u.role === ROLE.SUPPORT || u.role === ROLE.ADMIN || u.role === ROLE.SUPER_ADMIN) &&
  onlineSockets.has(u.email)
) {
    const socketId = onlineSockets.get(u.email);
    io.to(socketId).emit("new-support-ticket", {
      id: ticket.id,
      shortId: ticket.shortId,
      subject: ticket.subject,
      priority: ticket.priority
    });
  }
});

  res.json({ success: true, ticket });

} catch (e) {

  res.json({
    success: false,
    message: e.message
  });

}

  }
);

// Получить мои тикеты
app.get("/api/support/tickets", authRequired, (req, res) => {

  let tickets = supportService.getTicketsForUser(req.user);

  // 🔐 Support видит:
  // 1. неназначенные
  // 2. назначенные ему
  if (req.user.role === ROLE.SUPPORT) {
    tickets = tickets.filter(t =>
      !t.assignedTo || t.assignedTo === req.user.email
    );
  }

  // 🔎 фильтр "только мои"
  if (req.query.assigned === "me") {
    tickets = tickets.filter(t => t.assignedTo === req.user.email);
  }

  // 🔎 фильтр по статусу
  const status = String(req.query.status || "").trim();
  if (status) {
    tickets = tickets.filter(t => t.status === status);
  }
tickets = tickets.map(t => {

let assignedUsername = null;
let assignedUserId = null;

if (t.assignedTo) {
  const u = users.get(t.assignedTo);
  if (u) {
    assignedUsername = u.username;
    assignedUserId = u.userId || null;
  }
}

  const msgs = supportService.getMessages(t.id);

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
  categoryLabel: categoryConfig
    ? categoryConfig.labelKey
    : t.category,

    creator: creatorUser ? {
      username: creatorUser.username || "Пользователь",
      userId: creatorUser.userId || null
    } : {
      username: "Пользователь",
      userId: null
    },

    lastMessageFrom: !lastMessage
      ? null
      : (lastMessage.from === "user" ? "user" : "support")
  };
});

  res.json({
    success: true,
    tickets
  });
});
// Получить только МОИ тикеты (для страницы истории)
app.get("/api/support/my", authRequired, (req, res) => {

  let tickets = supportService.getTicketsForUser(req.user);

  // оставляем только тикеты пользователя
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
app.get("/api/support/stats", authRequired, supportRequired, (req, res) => {

  let tickets = supportService.getTicketsForUser(req.user);

  // support видит только:
  // 1. неназначенные
  // 2. назначенные ему
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
  (req, res) => {

    const ticket = supportService.getTicketById(req.params.id);

    if (!ticket) {
      return res.json({ success:false, message:"Тикет не найден" });
    }

    if (ticket.status === "resolved") {
      return res.json({ success:false, message:"Тикет закрыт" });
    }

    // если уже назначен другому и ты не admin
    if (
ticket.assignedTo &&
ticket.assignedTo !== req.user.email &&
!isAdminPanelRole(req.user)
    ) {
      return res.json({
        success:false,
        message:"Тикет уже назначен другому сотруднику"
      });
    }

    ticket.assignedTo = req.user.email;
    ticket.assignedAt = Date.now();
    ticket.status = "in_progress";
    ticket.updatedAt = Date.now();

    supportService.addLog(ticket.id, "assigned", req.user);
    emitTicketUpdate(ticket, "assigned");

    res.json({ success:true, ticket });
  }
);

app.post(
  "/api/support/tickets/:id/assign-resolution",
  authRequired,
  supportRequired,
  (req, res) => {
    const ticket = supportService.getTicketById(req.params.id);

    if (!ticket) {
      return res.json({ success: false, message: "Тикет не найден" });
    }

    if (ticket.status === "resolved") {
      return res.json({ success: false, message: "Тикет закрыт" });
    }

    if (ticket.kind !== "order_dispute") {
      return res.json({
        success: false,
        message: "Этот тикет не является спором по заказу"
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
        message: "Связанный заказ не найден"
      });
    }

    const resolutionEmail = String(req.body.resolutionEmail || "").trim().toLowerCase();

    if (!resolutionEmail) {
      return res.json({
        success: false,
        message: "Не указан сотрудник Resolution"
      });
    }

    const resolutionUser = users.get(resolutionEmail);

    if (!resolutionUser) {
      return res.json({
        success: false,
        message: "Сотрудник Resolution не найден"
      });
    }

if (
  resolutionUser.role !== ROLE.RESOLUTION &&
  resolutionUser.role !== ROLE.SUPER_ADMIN
) {
      return res.json({
        success: false,
        message: "Пользователь не имеет роли Resolution"
      });
    }

    ticket.assignedTo = resolutionUser.email;
    ticket.assignedRole = ROLE.RESOLUTION;
    ticket.status = "in_progress";
    ticket.resolutionAssignedAt = Date.now();
    ticket.updatedAt = Date.now();

    linkedOrder.disputeStatus = "in_review";
    linkedOrder.disputeTicketId = ticket.id;
    linkedOrder.resolutionAssignedTo = resolutionUser.email;
    linkedOrder.resolutionAssignedAt = Date.now();

    supportService.addLog(ticket.id, "resolution_assigned", req.user);
    emitTicketUpdate(ticket, "resolution_assigned");

    pushSystemMessage({
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
      ticket,
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
  (req, res) => {

    const ticket = supportService.getTicketById(req.params.id);
    if (!ticket) {
      return res.json({ success:false, message:"Тикет не найден" });
    }
if (ticket.kind === "order_dispute") {
  return res.json({
    success: false,
    message: "Спор по заказу нельзя переоткрыть вручную"
  });
}
    const { newEmail } = req.body;
if (newEmail === ticket.assignedTo) {
  return res.json({
    success:false,
    message:"Тикет уже назначен этому сотруднику"
  });
}

    if (!newEmail) {
      return res.json({ success:false, message:"Не указан сотрудник" });
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
      return res.json({ success:false, message:"Сотрудник не найден" });
    }

    // только admin может передавать
if (!isAdminPanelRole(req.user)) {
  return res.json({ success:false, message:"Только администратор может передавать тикеты" });
}

    ticket.assignedTo = newEmail;
    ticket.assignedAt = Date.now();
    ticket.status = "in_progress";
    ticket.updatedAt = Date.now();

    supportService.addLog(ticket.id, "transferred", req.user);

    emitTicketUpdate(ticket, "transferred");

    res.json({ success:true, ticket });
  }
);

// Получить тикет + сообщения
app.get("/api/support/tickets/:id", authRequired, (req, res) => {

  const ticket = supportService.getTicketById(req.params.id);

  if (!ticket) {
    return res.json({ success: false, message: "Тикет не найден" });
  }

if (!canAccessSupportTicket(req.user, ticket)) {
  return res.json({ success:false, message:"Нет доступа" });
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

  const messages = supportService.getMessages(ticket.id);
const logs = supportService.getLogs(ticket.id);

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
  upload.array("attachments", 10),
  (req, res) => {

  const ticket = supportService.getTicketById(req.params.id);

  if (!ticket) {
    return res.json({ success: false, message: "Тикет не найден" });
  }

if (!canAccessSupportTicket(req.user, ticket)) {
  return res.json({ success:false, message:"Нет доступа" });
}

  const text = String(req.body.text || "").trim().slice(0, 2000);
  let attachments = [];

if (req.files && req.files.length > 0) {
  attachments = req.files.map(file => "/uploads/" + file.filename);
}

if (!text && attachments.length === 0) {
  return res.json({ success: false, message: "Пустое сообщение" });
}

  try {
    if (ticket.status === "resolved") {
  return res.json({
    success: false,
    message: "Тикет закрыт"
  });
}

supportService.addMessage({
  ticket,
  user: req.user,
  text,
  attachments
});

// support/admin ответил → тикет в работе
if (
  req.user.role === ROLE.SUPPORT ||
  req.user.role === ROLE.RESOLUTION ||
  req.user.role === ROLE.ADMIN ||
  req.user.role === ROLE.SUPER_ADMIN
) {
  if (!ticket.assignedTo) {
    ticket.assignedTo = req.user.email;
    ticket.assignedAt = Date.now();
    supportService.addLog(ticket.id, "assigned", req.user);
  }

  ticket.status = "in_progress";
} else {
  ticket.status = "waiting";
}

ticket.updatedAt = Date.now();
emitTicketUpdate(ticket, "message");

res.json({ success: true });

  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// Закрыть тикет
app.post(
  "/api/support/tickets/:id/close",
  authRequired,
  (req, res) => {

    const ticket = supportService.getTicketById(req.params.id);

    if (!ticket) {
      return res.json({ success: false, message: "Тикет не найден" });
    }

    // 🔹 Если support / resolution / admin
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
          message:"Можно закрыть только назначенный вам тикет"
        });
      }

    }

    // 🔹 Если обычный пользователь
    else if (ticket.userEmail === req.user.email) {

      if (ticket.status !== "in_progress") {
        return res.json({
          success:false,
          message:"Закрыть можно только после ответа поддержки"
        });
      }

      const messages = supportService.getMessages(ticket.id);
      const hasSupportReply = messages.some(m =>
        m.from === "support" ||
        m.userEmail === ticket.assignedTo
      );

      if (!hasSupportReply) {
        return res.json({
          success:false,
          message:"Поддержка ещё не ответила"
        });
      }

    } else {
      return res.json({ success:false, message:"Нет доступа" });
    }

    supportService.closeTicket(ticket, req.user);
    emitTicketUpdate(ticket, "closed");

    res.json({ success:true });
  }
);

// Переоткрыть тикет (только владелец)
app.post(
  "/api/support/tickets/:id/reopen",
  authRequired,
  (req, res) => {

    const ticket = supportService.getTicketById(req.params.id);
    if (!ticket) {
      return res.json({ success:false, message:"Тикет не найден" });
    }

    if (ticket.userEmail !== req.user.email) {
      return res.json({ success:false, message:"Нет доступа" });
    }

    if (ticket.status !== "resolved") {
      return res.json({
        success:false,
        message:"Тикет не закрыт"
      });
    }
// ❗️разрешаем переоткрыть только 1 раз
ticket.reopenCount = Number(ticket.reopenCount || 0);

if (ticket.reopenCount >= 1) {
  return res.json({
    success: false,
    message: "Тикет уже переоткрывали. Создайте новый тикет."
  });
}

ticket.reopenCount += 1;

    ticket.status = "waiting";
    ticket.updatedAt = Date.now();
    supportService.addLog(ticket.id, "reopened", req.user);
emitTicketUpdate(ticket, "reopened");
    res.json({ success:true, ticket });
  }
);

app.get("/api/admin/platform-balances", authRequired, (req,res)=>{

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  res.json({
    success:true,
    balances: platformBalances
  });

});

app.get("/api/admin/settings", authRequired, (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  res.json({
    success: true,
    settings: adminSettings
  });
});

app.put("/api/admin/settings", authRequired, (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

const marketplaceFeePercent = Number(req.body.marketplaceFeePercent);
const minDepositUah = Number(req.body.minDepositUah ?? req.body.minDepositEur);
const minWithdrawUah = Number(req.body.minWithdrawUah ?? req.body.minWithdrawEur);
const maintenanceText = String(req.body.maintenanceText || "").trim();

if (!Number.isFinite(marketplaceFeePercent) || marketplaceFeePercent < 0 || marketplaceFeePercent > 100) {
  return res.json({ success:false, message:"Некорректная комиссия" });
}

if (!Number.isFinite(minDepositUah) || minDepositUah < 0) {
  return res.json({ success:false, message:"Некорректный минимум депозита" });
}

if (!Number.isFinite(minWithdrawUah) || minWithdrawUah < 0) {
  return res.json({ success:false, message:"Некорректный минимум вывода" });
}

adminSettings.marketplaceFeePercent = marketplaceFeePercent;
adminSettings.minDepositUah = minDepositUah;
adminSettings.minWithdrawUah = minWithdrawUah;
adminSettings.maintenanceText = maintenanceText;

  saveAdminSettings();

  addAdminLog({
    actor: req.user,
    action: "save_settings",
    targetType: "settings",
    targetId: "platform",
    text: "Обновил настройки платформы"
  });

  res.json({
    success: true,
    settings: adminSettings
  });
});

// Получить список пользователей (только admin)
app.get("/api/admin/users", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

const list = Array.from(users.values()).map(u => ({
  email: u.email,
  username: u.username,
  userId: u.userId || null,
  role: u.role || "user",
  banned: Boolean(u.banned),
  balance: u.balance || 0,
  createdAt: u.createdAt
}));

  res.json({ success:true, users:list });
});

app.get("/api/admin/stats", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  const allTickets = supportService.getAllTickets();

  const commissions = orders
    .filter(o => o.status === "completed")
    .reduce((sum, o) => sum + Number(o.commission || 0), 0);

  const deposits = (Array.from(walletHistory.values()).flat())
    .filter(i => i.type === "deposit")
    .reduce((sum, i) => sum + Number(i.amount || 0), 0);

  const withdrawals = Math.abs(
    (Array.from(walletHistory.values()).flat())
      .filter(i =>
        i.type === "withdraw" &&
        Number(i.amount || 0) < 0
      )
      .reduce((sum, i) => sum + Number(i.amount || 0), 0)
  );

  const userBalances = Array.from(users.values())
    .reduce((sum, u) => sum + Number(u.balance || 0), 0);

  const lockedOrders = orders
    .filter(o => o.status === "pending")
    .reduce((sum, o) => sum + Number(o.price || 0), 0);

  const platformBalance = userBalances + lockedOrders;

  const onlineUsers = Array.from(users.values())
    .filter(u => Boolean(u.online)).length;

  const bannedUsers = Array.from(users.values())
    .filter(u => Boolean(u.banned)).length;

  const pendingWithdraws = withdrawRequests
    .filter(w => w.status === "pending").length;

  const pendingCryptoDeposits = cryptoDeposits
    .filter(d => d.status === "pending").length;

  const stats = {
    users: users.size,
    offers: offers.filter(o => o.status !== "deleted").length,
    orders: orders.length,
    revenue: commissions,
    openTickets: allTickets.filter(t => t.status !== "resolved").length,

    onlineUsers,
    bannedUsers,
    pendingWithdraws,
    pendingCryptoDeposits,

    finances: {
      platformBalance,
      userBalances,
      lockedOrders,
      commissions,
      deposits,
      withdrawals
    }
  };

  res.json({
    success: true,
    stats
  });
});

app.get("/api/admin/logs", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
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
app.get("/api/admin/search", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
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
      balance: Number(u.balance || 0),
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
      buyerUsername: buyer?.username || "Покупатель",
      sellerUsername: seller?.username || "Продавец",
      buyerEmail: o.buyerEmail || "",
      sellerEmail: o.sellerEmail || "",
      status: o.status || "pending",
      price: Number(o.price || 0),
      commission: Number(o.commission || 0),
      createdAt: o.createdAt || null
    };
  });

  const foundTickets = supportService.getAllTickets()
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
        categoryLabel: categoryConfig ? categoryConfig.labelKey : (t.category || "Без категории"),
        status: t.status || "waiting",
        creatorUsername: creator?.username || "Пользователь",
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
        title: o.title?.ru || o.title?.uk || o.title?.en || "Без названия",
        game: o.game || "—",
        mode: o.mode || "—",
        status: o.status || "inactive",
        price: Number(o.price || 0),
        sellerUsername: seller?.username || o.sellerName || "Продавец",
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
app.get("/api/admin/finance/history", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  const q = String(req.query.q || "").trim().toLowerCase();

  let history = Array.from(walletHistory.entries()).flatMap(([email, items]) => {
    const user = users.get(email);

    return (items || []).map((item, index) => ({
      id: `${email}-${item.createdAt || 0}-${index}`,
      email,
      username: user?.username || "Пользователь",
      userId: user?.userId || null,
      type: item.type || "",
      amount: Number(item.amount || 0),
      currency: item.currency || BASE_CURRENCY,
      text: item.text || "",
      createdAt: item.createdAt || null
    }));
  });

const diskDeposits = listDeposits();
const liveCryptoDeposits = cryptoDeposits.filter(dep => dep.status !== "completed");

let cryptoList = [...liveCryptoDeposits, ...diskDeposits].map(dep => {
  
    const user = users.get(dep.email);

    return {
      id: dep.id,
      email: dep.email,
      username: user?.username || "Пользователь",
      userId: user?.userId || null,
      amountExpected: Number(dep.amountExpected || dep.amount || 0),
      status: dep.status || "pending",
      network: dep.network || "TRC20",
      createdAt: dep.createdAt || null
    };
  });

  if (q) {
    history = history.filter(item =>
      String(item.email || "").toLowerCase().includes(q) ||
      String(item.username || "").toLowerCase().includes(q) ||
      String(item.userId || "").toLowerCase().includes(q) ||
      String(item.type || "").toLowerCase().includes(q) ||
      String(item.currency || "").toLowerCase().includes(q) ||
      String(item.text || "").toLowerCase().includes(q)
    );

    cryptoList = cryptoList.filter(item =>
      String(item.id || "").toLowerCase().includes(q) ||
      String(item.email || "").toLowerCase().includes(q) ||
      String(item.username || "").toLowerCase().includes(q) ||
      String(item.userId || "").toLowerCase().includes(q) ||
      String(item.status || "").toLowerCase().includes(q) ||
      String(item.network || "").toLowerCase().includes(q)
    );
  }

  history.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  cryptoList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  res.json({
    success: true,
    history,
    cryptoDeposits: cryptoList
  });
});
app.get("/api/admin/orders", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
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
        buyerUsername: buyer?.username || "Покупатель",
        sellerUsername: seller?.username || "Продавец",
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

app.post("/api/admin/crypto/:id/confirm", authRequired, (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success: false, message: "Нет доступа" });
  }

  const deposit = cryptoDeposits.find(d => d.id === req.params.id);

  if (!deposit) {
    return res.json({ success: false, message: "Депозит не найден" });
  }

  if (deposit.status !== "pending") {
    return res.json({ success: false, message: "Депозит уже обработан" });
  }

  const txHash = String(req.body.txHash || "").trim();
  const amountUsdt = Number(req.body.amountUsdt || deposit.amountReceived || deposit.amountExpected || 0);

  if (!txHash) {
    return res.json({
      success: false,
      message: "Укажите txHash"
    });
  }

  if (!amountUsdt || amountUsdt <= 0) {
    return res.json({
      success: false,
      message: "Укажите фактическую сумму USDT"
    });
  }

  const alreadyCredited = Array.from(walletHistory.values()).some(items =>
    (items || []).some(item => item.txHash === txHash)
  );

  if (alreadyCredited) {
    return res.json({
      success: false,
      message: "Этот txHash уже использован"
    });
  }

  const user = users.get(deposit.email);

  if (!user) {
    return res.json({ success: false, message: "Пользователь не найден" });
  }

  const amountBase = convertUsdToBase(amountUsdt);

  if (!amountBase || amountBase <= 0) {
    return res.json({
      success: false,
      message: "Не удалось конвертировать сумму депозита"
    });
  }

  user.balance = roundMoney((user.balance || 0) + amountBase);
  platformBalances.crypto = roundMoney((platformBalances.crypto || 0) + amountUsdt);

  addWalletHistory(user.email, {
    type: "deposit",
    amount: amountUsdt,
    currency: "USDT",
    status: "completed",
    text: "Крипто пополнение (TRC20)",
    txHash
  });

  deposit.status = "completed";
  deposit.txHash = txHash;
  deposit.amountReceived = amountUsdt;
  deposit.confirmedAt = Date.now();

  saveCryptoDeposits();

  addAdminLog({
    actor: req.user,
    action: "crypto_confirm",
    targetType: "deposit",
    targetId: deposit.id,
    text: `Подтвердил крипто депозит ${deposit.id}`
  });

  res.json({ success: true });
});

app.post("/api/admin/orders/:id/confirm", authRequired, (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({ success:false, message:"Заказ не найден" });
  }

try {
  applyOrderConfirm({
    order,
    actor: req.user,
    systemType: "order_confirmed_admin"
  });

  closeLinkedDisputeTicket(order, req.user);

  addAdminLog({
      actor: req.user,
      action: "confirm_order",
      targetType: "order",
      targetId: order.orderNumber || order.id,
      text: `Подтвердил заказ ${order.orderNumber || order.id}`
    });

    return res.json({ success:true });
  } catch (e) {
    return res.json({
      success: false,
      message: e.message
    });
  }
});

app.post("/api/admin/orders/:id/refund", authRequired, (req, res) => {
  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.json({ success:false, message:"Заказ не найден" });
  }

try {
  applyOrderRefund({
    order,
    actor: req.user,
    systemType: "order_refunded_admin"
  });

  closeLinkedDisputeTicket(order, req.user);

  addAdminLog({
      actor: req.user,
      action: "refund_order",
      targetType: "order",
      targetId: order.orderNumber || order.id,
      text: `Сделал возврат по заказу ${order.orderNumber || order.id}`
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
    return res.json({ success:false, message:"Нет доступа" });
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
        "Без названия";

      return {
        id: offer.id,
        title,
        sellerUsername: seller?.username || offer.sellerName || "Продавец",
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

app.post("/api/admin/offers/:id/activate", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  const offer = offers.find(o => o.id === req.params.id);
  if (!offer) {
    return res.json({ success:false, message:"Объявление не найдено" });
  }

  if (offer.status === "deleted") {
    return res.json({ success:false, message:"Удалённое объявление нельзя активировать" });
  }

  if (offer.status === "closed") {
    return res.json({ success:false, message:"Проданное объявление нельзя активировать" });
  }

  if (offer.status !== "inactive") {
    return res.json({ success:false, message:"Объявление нельзя активировать" });
  }

  offer.status = "active";
  offer.activeUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
addAdminLog({
  actor: req.user,
  action: "activate_offer",
  targetType: "offer",
  targetId: offer.id,
  text: `Активировал объявление ${offer.id}`
});
  res.json({ success:true });
});

app.post("/api/admin/offers/:id/deactivate", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  const offer = offers.find(o => o.id === req.params.id);
  if (!offer) {
    return res.json({ success:false, message:"Объявление не найдено" });
  }

  if (offer.status !== "active") {
    return res.json({ success:false, message:"Объявление уже не активно" });
  }

  offer.status = "inactive";
  offer.activeUntil = null;
addAdminLog({
  actor: req.user,
  action: "deactivate_offer",
  targetType: "offer",
  targetId: offer.id,
  text: `Выключил объявление ${offer.id}`
});
  res.json({ success:true });
});

app.delete("/api/admin/offers/:id", authRequired, (req, res) => {

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  const offer = offers.find(o => o.id === req.params.id);
  if (!offer) {
    return res.json({ success:false, message:"Объявление не найдено" });
  }

  if (offer.status === "deleted") {
    return res.json({ success:false, message:"Объявление уже удалено" });
  }

  offer.status = "deleted";
  offer.activeUntil = null;
addAdminLog({
  actor: req.user,
  action: "delete_offer",
  targetType: "offer",
  targetId: offer.id,
  text: `Удалил объявление ${offer.id}`
});
  res.json({ success:true });
});
// Забанить / разбанить

app.post("/api/admin/ban", authRequired, (req,res)=>{

  if (!isAdminPanelRole(req.user)) {
    return res.json({ success:false, message:"Нет доступа" });
  }

  const email = String(req.body.email || "").trim().toLowerCase();
  const banned = Boolean(req.body.banned);

  const target = users.get(email);
  if (!target) {
    return res.json({ success:false, message:"Пользователь не найден" });
  }

  if (!canBanUser(req.user, target)) {
    return res.json({
      success:false,
      message:"Недостаточно прав для блокировки этого пользователя"
    });
  }

  target.banned = banned;

  addAdminLog({
    actor: req.user,
    action: target.banned ? "ban" : "unban",
    targetType: "user",
    targetId: target.userId || target.email,
    text: `${target.banned ? "Забанил" : "Разбанил"} пользователя ${target.username || target.email}`
  });

  res.json({ success:true });
});

// Авто-закрытие тикетов через 5 дней после ответа поддержки
setInterval(() => {

  const allTickets = supportService.getAllTickets();
  const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
  const nowTime = Date.now();

allTickets.forEach(ticket => {

if (ticket.status === "resolved") return;
if (ticket.kind === "order_dispute") return;

    const messages = supportService.getMessages(ticket.id);
    if (!messages.length) return;

    const lastMessage = messages[messages.length - 1];

    // если последнее сообщение от поддержки
    if (
      lastMessage.from === "support" &&
      nowTime - lastMessage.createdAt > FIVE_DAYS
    ) {
      ticket.status = "resolved";
      ticket.updatedAt = nowTime;

      supportService.addLog(ticket.id, "auto_closed", {
        email: "system",
        username: "System",
        role: "system"
      });

      emitTicketUpdate(ticket, "auto_closed");
    }

  });

}, 60 * 60 * 1000);

// ================= CRYPTO AUTO CHECK =================

setInterval(() => {
  try {
    cleanupExpiredCryptoDeposits();
  } catch (e) {
    console.log("cleanup crypto deposits error:", e.message);
  }
}, 60 * 60 * 1000);

setInterval(async () => {
  if (isDepositScanRunning) return;
  isDepositScanRunning = true;

  try {
    await scanAllDepositWallets(autoCreditTronDeposit);
  } catch (e) {
    console.log("TRX deposit scan error:", e.message);
  } finally {
    isDepositScanRunning = false;
  }
}, 30000);

setInterval(async () => {
  if (isTrxTopupRunning) return;
  isTrxTopupRunning = true;

  try {
    await topupAllWallets();
  } catch (e) {
    console.log("trx topup error:", e.message);
  } finally {
    isTrxTopupRunning = false;
  }
}, 60000);

setInterval(async () => {
  if (isSweepRunning) return;
  isSweepRunning = true;

  try {
    await sweepAllWallets();
  } catch (e) {
    console.log("sweep error:", e.message);
  } finally {
    isSweepRunning = false;
  }
}, 60000);
/* ================== START ================== */
async function startServer() {
  await updateRates();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running: http://localhost:${PORT}`);
    startTelegramPolling();
  });
}
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Файл слишком большой"
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message || "Ошибка загрузки файла"
    });
  }

  if (err) {
    console.error("Unhandled error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Внутренняя ошибка сервера"
    });
  }

  next();
});
startServer();