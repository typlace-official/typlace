// server.js
require("dotenv").config();

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const express = require("express");
const path = require("path");
const multer = require("multer");

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

const upload = multer({ storage });

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

if (!MAIL_USER || !MAIL_PASS) {
  console.log("❌ Нет TYPLACE_GMAIL или TYPLACE_GMAIL_PASS в .env");
  console.log("✅ Создай файл .env рядом с server.js и добавь туда переменные");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: MAIL_USER, pass: MAIL_PASS },
});

/* ================== STORAGE (без БД) ==================
   Потом заменишь на базу данных — логика останется та же.
*/
const users = new Map(); 
const walletHistory = new Map(); 
const pendingCodes = new Map(); // email -> { code, expiresAt, mode, tempUsername, lastSentAt, tries }
const sessions = new Map(); // token -> { email, expiresAt }

/* ================== MARKET STORAGE ================== */
const offers = [];
const chats = [];
const messages = [];
const orders = [];
const reviews = [];

/* ================== SETTINGS ================== */
const SESSION_DAYS = 2; // ✅ ты говорил максимум 2 дня, не 7

/* ================== MARKETPLACE SETTINGS ================== */
const MARKETPLACE_FEE_PERCENT = 10; // комиссия в %

const BASE_CURRENCY = "EUR";

let exchangeRates = {
  base: BASE_CURRENCY,
  rates: {
    EUR: 1,
    USD: 1,
    UAH: 1
  },
  updatedAt: 0
};

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
async function updateRates() {
  try {
    console.log("⏳ Загружаем курсы валют...");

    const res = await fetch(
      "https://open.er-api.com/v6/latest/EUR"
    );

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const data = await res.json();

    if (data.result !== "success") {
      throw new Error("API error");
    }

    exchangeRates = {
      base: "EUR",
      rates: {
        EUR: 1,
        USD: Number(data.rates.USD),
        UAH: Number(data.rates.UAH)
      },
      updatedAt: Date.now()
    };

    console.log("💱 Курсы валют обновлены:", exchangeRates.rates);
  } catch (e) {
    console.error("❌ Ошибка загрузки курсов:", e.message);
  }
}

function calcGrossFromNet(net){
  // net = цена продавца (что он хочет получить)
  const feeK = MARKETPLACE_FEE_PERCENT / 100;
  return roundMoney(net * (1 + feeK)); // цена для покупателя
}

function calcFee(gross, net){
  return roundMoney(gross - net); // комиссия маркетплейса
}

function sendNotification(user, { type, text }) {
  if (!user || !user.notify) return;

  // 📩 EMAIL
  if (user.notify.email) {
    transporter.sendMail({
      from: MAIL_USER,
      to: user.email,
      subject: "TyPlace — уведомление",
      text
    }).catch(()=>{});
  }

  // 📲 TELEGRAM (ГОТОВО, но пока chatId = null)
  if (user.notify.telegram && user.telegramChatId) {
    // позже сюда добавим Telegram API
  }

  // 🔔 SITE — ничего не делаем тут,
  // фронт сам дергает /api/events (позже)
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
    id = Math.floor(10000000 + Math.random() * 90000000).toString(); // 8 цифр
    exists = Array.from(users.values()).some(u => u.userId === id);
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
  if (u.banned) {
  sessions.delete(token);
  return res.status(403).json({
    success: false,
    message: "Аккаунт заблокирован"
  });
}
  if (!u) return res.status(401).json({ success: false, message: "Пользователь не найден" });

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

  if (req.user.role !== "support" && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Только для поддержки" });
  }

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
  online: false,
  lastSeen: Date.now(),
  balance: 0,
banned: false,
role: email === "dmytropolishchuk2109@gmail.com" ? "admin" : "user",

  notify: {
    site: true,
    email: true,
    telegram: false
  },

  telegramChatId: null
});

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
      role: u.role || "user"   // 👈 ДОБАВЬ ЭТУ СТРОКУ
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
// Назначить роль пользователю (только admin)
app.post("/api/admin/set-role", authRequired, (req, res) => {

  if (req.user.role !== "admin") {
    return res.json({ success: false, message: "Нет доступа" });
  }

  const { email, role } = req.body;

  const target = users.get(email);
  if (!target) {
    return res.json({ success: false, message: "Пользователь не найден" });
  }

  if (!["user", "support", "admin"].includes(role)) {
    return res.json({ success: false, message: "Неверная роль" });
  }

  target.role = role;

  res.json({ success: true });
});
/**
 * PUT /profile (обновление профиля)
 * header: Authorization: Bearer <token>
 * body: { username?, avatarUrl?, avatarDataUrl? }
 */
app.put("/profile", authRequired, (req, res) => {
  const u = req.user;

  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const avatarUrl = typeof req.body.avatarUrl === "string" ? req.body.avatarUrl.trim() : "";
  const avatarDataUrl = typeof req.body.avatarDataUrl === "string" ? req.body.avatarDataUrl.trim() : "";

  if (username) {
    if (username.length < 3) return res.json({ success: false, message: "Ник минимум 3 символа." });
    if (username.length > 20) return res.json({ success: false, message: "Ник слишком длинный (макс. 20)." });
    u.username = username;
  }

  // сохраняем аватар: либо URL, либо dataUrl
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
      avatarDataUrl: u.avatarDataUrl || "",
      avatarUrl: u.avatarUrl || "",
    },
  });
});
/**
 * GET /api/settings/notifications
 */
app.get("/api/settings/notifications", authRequired, (req, res) => {
  res.json({
    success: true,
    notify: req.user.notify || {
      site: true,
      email: true,
      telegram: false
    }
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

  if (typeof site === "boolean") req.user.notify.site = site;
  if (typeof email === "boolean") req.user.notify.email = email;
  if (typeof telegram === "boolean") req.user.notify.telegram = telegram;

  res.json({
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
// пополнение (ВРЕМЕННО виртуально)
app.post("/api/balance/deposit", authRequired, (req, res) => {
  const amount = Number(req.body.amount);

  if (!amount || amount <= 0) {
    return res.json({ success:false, message:"Некорректная сумма" });
  }

  req.user.balance += amount;
  addWalletHistory(req.user.email, {
  type: "deposit",
  amount,
  currency: "EUR",
  text: "Пополнение баланса"
});

  res.json({
    success:true,
    balance:req.user.balance
  });
});

// вывод (ВРЕМЕННО виртуально)
app.post("/api/balance/withdraw", authRequired, (req, res) => {
  const amount = Number(req.body.amount);

  if (!amount || amount <= 0) {
    return res.json({ success:false, message:"Некорректная сумма" });
  }

  if (req.user.balance < amount) {
    return res.json({ success:false, message:"Недостаточно средств" });
  }

  req.user.balance -= amount;
  addWalletHistory(req.user.email, {
  type: "withdraw",
  amount: -amount,
  currency: "EUR",
  text: "Вывод средств"
});

  res.json({
    success:true,
    balance:req.user.balance
  });
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

  if (offer.status !== "inactive" && offer.status !== "closed") {
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
  stock,
  method,
  country,
  accountType,
  accountRegion,
  voiceChat,
  category,

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
      "stock",
      "method",
      "country",
      "accountType",
      "accountRegion",
      "voiceChat",
      "category",
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

    const priceNet = roundMoney(Number(price));
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

  game,
  mode,
  category: category || null,

  title: {
    ru: title_ru || "",
    uk: title_uk || "",
    en: title_en || ""
  },

  description: {
    ru: desc_ru || "",
    uk: desc_uk || "",
    en: desc_en || ""
  },
  extra,
  priceNet,
  price: priceGross,

      amount: amount ? Number(amount) : null,
      stock: stock ? Number(stock) : null,

      method: method || null,
      country: country || null,

      accountType: accountType || null,
      accountRegion: accountRegion || null,
voiceChat:
  voiceChat === "Есть VC" ? true :
  voiceChat === "Нету VC" ? false :
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
    title_ru,
    desc_ru,
    title_uk,
    desc_uk,
    title_en,
    desc_en
  } = req.body;

  // 💰 цена
  if (price) {
    const net = roundMoney(Number(price));
    offer.priceNet = net;
    offer.price = calcGrossFromNet(net);
  }

  // 📂 категория
  offer.category = category || null;

  // 📝 названия
  offer.title = {
    ru: title_ru || "",
    uk: title_uk || "",
    en: title_en || ""
  };

  offer.description = {
    ru: desc_ru || "",
    uk: desc_uk || "",
    en: desc_en || ""
  };
// ===== ОБНОВЛЯЕМ ВСЕ ОСНОВНЫЕ ПОЛЯ =====

const {
  amount,
  stock,
  method,
  country,
  accountType,
  accountRegion,
  voiceChat
} = req.body;

if (amount !== undefined) {
  offer.amount = amount ? Number(amount) : null;
}

if (stock !== undefined) {
  offer.stock = stock ? Number(stock) : null;
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
    voiceChat === "Есть VC" ? true :
    voiceChat === "Нету VC" ? false :
    null;
}
// 🔥 ОБНОВЛЕНИЕ EXTRA ПОЛЕЙ (ТОЛЬКО ДИНАМИЧЕСКИЕ ФИЛЬТРЫ)

const BASE_KEYS = [
  "game",
  "mode",
  "price",
  "amount",
  "stock",
  "method",
  "country",
  "accountType",
  "accountRegion",
  "voiceChat",
  "category",

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
      const filename = "optimized-" + Date.now() + ".jpg";
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

  offers.splice(index, 1);

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
  subsTo
} = req.query;

// 🔧 нормализация range-фильтров (subscribers)
const normalizedSubsFrom =
  req.query.subscribers_from ?? subsFrom;

const normalizedSubsTo =
  req.query.subscribers_to ?? subsTo;

// 1️⃣ базовый список
let result = offers.filter(o => o.status === "active");

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
  "subsFrom",   // ✅ ДОБАВЬ
  "subsTo"      // ✅ ДОБАВЬ
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
if (mode === "Аккаунты") {

  // Тип аккаунта (sale / rent)
  if (accountType) {
    result = result.filter(o => o.accountType === accountType);
  }

  // Регион аккаунта
  if (accountRegion) {
    result = result.filter(o => o.accountRegion === accountRegion);
  }

  // Voice Chat
  if (voiceChat !== undefined) {
    result = result.filter(
      o => String(o.voiceChat) === String(voiceChat)
    );
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
if (mode === "Робуксы") {

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
      (t.en && t.en.toLowerCase().includes(q)) ||
      (d.ru && d.ru.toLowerCase().includes(q)) ||
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
  userId: seller.userId || null,   // 👈 ДОБАВЬ
  avatarUrl: seller.avatarUrl || null,
        avatarDataUrl: seller.avatarDataUrl || null,
        online: Boolean(seller.online),
        rating: seller.rating || 0,
        reviewsCount: seller.reviewsCount || 0,
        createdAt: seller.createdAt
      } : {
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
app.get("/api/offers/:id", (req, res) => {
  const { id } = req.params;

  const offer = offers.find(o => o.id === id);
  if (!offer) {
    return res.json({ success: false, message: "Оффер не найден" });
  }

  const seller = users.get(offer.sellerEmail);

  return res.json({
    success: true,
    offer: {
      ...offer,
seller: seller ? {
  username: seller.username || "Продавец",
  userId: seller.userId || null,
        avatarUrl: seller.avatarUrl && seller.avatarUrl.trim() !== ""
          ? seller.avatarUrl
          : null,
        avatarDataUrl: seller.avatarDataUrl || null,
        online: Boolean(seller.online),
        rating: seller.rating || 0,
        reviewsCount: seller.reviewsCount || 0,
        createdAt: seller.createdAt
      } : {
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

  // 👇 ВСТАВИТЬ ВОТ СЮДА
  if (offer.sellerEmail === req.user.email) {
    return res.json({
      success: false,
      message: "Нельзя писать самому себе"
    });
  }

  // 🔥 ИЩЕМ ЧАТ ТОЛЬКО ПО ДВУМ УЧАСТНИКАМ
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

  res.json({ success:true, chat });
});

// ===== GET MY CHATS =====
app.get("/api/chats", authRequired, (req, res) => {
  const myEmail = req.user.email;

  const myChats = chats
    .filter(c => c.buyerEmail === myEmail || c.sellerEmail === myEmail)
    .map(c => {
      const otherEmail = (c.buyerEmail === myEmail) ? c.sellerEmail : c.buyerEmail;
      const otherUser = users.get(otherEmail);

      return {
        ...c,
otherUser: otherUser ? {
  email: otherUser.email,
  username: otherUser.username,
  avatarUrl: otherUser.avatarUrl || null,
  avatarDataUrl: otherUser.avatarDataUrl || null,
  online: Boolean(otherUser.online),
  lastSeen: otherUser.lastSeen || null
} : null
      };
    });

  res.json({ success: true, chats: myChats });
});

// ===== MESSAGES =====
app.post("/api/chats/:id/messages", authRequired, (req,res)=>{
  const { text, media } = req.body;

  const message = {
  id: crypto.randomUUID(),
  chatId: req.params.id,
  fromEmail: req.user.email,
  text,
  media: media || [],
  createdAt: Date.now(),
  read: false
};

messages.push(message);

  const chat = chats.find(c => c.id === req.params.id);

  if (chat) {
    const targetEmail =
      chat.buyerEmail === req.user.email
        ? chat.sellerEmail
        : chat.buyerEmail;

    const targetSocket = onlineSockets.get(targetEmail);
if (targetSocket) {
  io.to(targetSocket).emit("new-message", message);
}

// 🔥 отправителю тоже (если он онлайн)
const mySocket = onlineSockets.get(req.user.email);
if (mySocket) {
  io.to(mySocket).emit("new-message", message);
}
  }

  res.json({ success:true, message });
});
// ===== GET MESSAGES =====
app.get("/api/chats/:id/messages", authRequired, (req, res) => {
  const chatId = req.params.id;

  const chat = chats.find(c => c.id === chatId);
  if (!chat) {
    return res.json({ success:false });
  }

  // проверяем доступ
  if (
    chat.buyerEmail !== req.user.email &&
    chat.sellerEmail !== req.user.email
  ) {
    return res.json({ success:false });
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
  const sellerReviews = reviews.filter(r => r.sellerEmail === seller.email);

  seller.reviewsCount = sellerReviews.length;

  if (seller.reviewsCount >= 10) {
  const avg =
    sellerReviews.reduce((s, r) => s + r.rating, 0) / sellerReviews.length;

  seller.rating = Math.round(avg * 10) / 10; // ⭐ 1 знак после запятой
} else {
  seller.rating = 0; // ❓ рейтинг скрыт
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

  if (offer.sellerEmail === req.user.email) {
    return res.json({ success: false, message: "Нельзя купить у себя" });
  }

  if (offer.status !== "active") {
  return res.json({ success:false, message:"Оффер недоступен" });
}

if (offer.activeUntil && Date.now() > offer.activeUntil) {
  offer.status = "inactive";
  return res.json({ success:false, message:"Оффер истёк" });
}

  // цена продавца (что он получит)
const net = roundMoney(offer.priceNet ?? offer.price);

// цена для покупателя (с комиссией)
const gross = roundMoney(offer.price ?? calcGrossFromNet(net));

// комиссия маркетплейса
const commission = roundMoney(gross - net);

if (req.user.balance < gross) {
  return res.json({ success: false, message: "Недостаточно средств" });
}

/* 1️⃣ СПИСЫВАЕМ ДЕНЬГИ (ESCROW) */
req.user.balance -= gross;

  /* 2️⃣ ГАРАНТИРУЕМ ЧАТ */
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

  /* 3️⃣ СОЗДАЁМ ЗАКАЗ */
  const order = {
  id: crypto.randomUUID(),
  orderNumber: generateOrderCode(),
  offerId,
  chatId: chat.id,
  buyerEmail: req.user.email,
  sellerEmail: offer.sellerEmail,

  price: gross,          // сколько заплатил покупатель
  sellerAmount: net,     // сколько получит продавец
  commission: commission, // комиссия TyPlace

  status: "pending",
  createdAt: Date.now()
};

  orders.push(order);

  /* 4️⃣ СКРЫВАЕМ ОФФЕР ИЗ КАТАЛОГА */
  offer.status = "closed";
offer.activeUntil = null;

  /* 5️⃣ СИСТЕМНОЕ СООБЩЕНИЕ В ЧАТ */
  messages.push({
    id: crypto.randomUUID(),
    chatId: chat.id,
    fromEmail: "system",
    text: "🧾 Покупатель создал заказ. Средства заморожены.",
    createdAt: Date.now()
  });
const seller = users.get(order.sellerEmail);
sendNotification(seller, {
  type: "order",
  text: "У вас новый заказ на TyPlace"
});
  res.json({ success: true, order });
});

// получить заказ
app.get("/api/orders/:id", authRequired, (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.json({ success:false });

  if (
    order.buyerEmail !== req.user.email &&
    order.sellerEmail !== req.user.email
  ) {
    return res.json({ success:false });
  }

  const offer = offers.find(o => o.id === order.offerId);

  res.json({
    success:true,
    order: {
      ...order,
      offer,
      role:
  order.buyerEmail === req.user.email
    ? "buyer"
    : "seller"
    }
  });
});

// покупатель подтверждает заказ
app.post("/api/orders/:id/confirm", authRequired, (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order || order.status !== "pending") {
  return res.json({
    success: false,
    message: "Подтверждение невозможно"
  });
}

  if (order.buyerEmail !== req.user.email) {
    return res.json({ success:false });
  }

  const seller = users.get(order.sellerEmail);
  seller.balance += (order.sellerAmount ?? (order.price - order.commission));

  order.status = "completed";

const chat = chats.find(c => c.id === order.chatId);

const offer = offers.find(o => o.id === order.offerId);
if (offer) offer.status = "closed";

  if (chat) {
    messages.push({
      id: crypto.randomUUID(),
      chatId: chat.id,
      fromEmail: "system",
      text: "✅ Покупатель подтвердил заказ. Сделка завершена.",
      createdAt: Date.now()
    });
  }
  res.json({ success:true });
});

// продавец делает возврат
app.post("/api/orders/:id/refund", authRequired, (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order || order.status !== "pending") {
    return res.json({ success:false });
  }

  if (order.sellerEmail !== req.user.email) {
    return res.json({ success:false });
  }

  const buyer = users.get(order.buyerEmail);
  buyer.balance += order.price;

  order.status = "refunded";

  const chat = chats.find(c => c.id === order.chatId);
  if (chat) {
    messages.push({
      id: crypto.randomUUID(),
      chatId: chat.id,
      fromEmail: "system",
      text: "↩️ Продавец сделал возврат средств.",
      createdAt: Date.now()
    });
  }
  // удалить отзыв, если он был
const reviewIndex = reviews.findIndex(r => r.orderId === order.id);
if (reviewIndex !== -1) {
  reviews.splice(reviewIndex, 1);

  // пересчёт рейтинга продавца
  const seller = users.get(order.sellerEmail);
  const sellerReviews = reviews.filter(r => r.sellerEmail === seller.email);

  seller.reviewsCount = sellerReviews.length;

  if (seller.reviewsCount >= 10) {
  const avg =
    sellerReviews.reduce((s, r) => s + r.rating, 0) / sellerReviews.length;

  seller.rating = Math.round(avg * 10) / 10; // ⭐ 1 знак после запятой
} else {
  seller.rating = 0; // ❓ рейтинг скрыт
}
}
  res.json({ success:true });
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
          id: offer?.id,
          description: offer?.description || "",
          imageUrl: offer?.imageUrl || null,
          price: offer?.price || order.price
        }
      };
    })
    .filter(Boolean);

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

  const userOffers = offers.filter(o =>
    o.sellerEmail === user.email &&
    o.status === "active"
  );

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

updateRates();
setInterval(updateRates, 60 * 60 * 1000);
/* ================== UNREAD COUNT ================== */
/* ================== MARK AS READ ================== */

app.post("/api/chats/:id/read", authRequired, (req, res) => {
  const chatId = req.params.id;
  const myEmail = req.user.email;

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

  // мои чаты
  const myChats = chats.filter(c =>
    c.buyerEmail === myEmail || c.sellerEmail === myEmail
  );

  const myChatIds = myChats.map(c => c.id);

  // считаем сообщения:
  const unread = messages.filter(m =>
    myChatIds.includes(m.chatId) &&
    m.fromEmail !== myEmail &&
    m.read === false
  );

  res.json({
    success: true,
    count: unread.length
  });
});
/* ================== SOCKET.IO ================== */

io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

socket.on("auth", ({ token }) => {
  try {
    const s = sessions.get(String(token || ""));
    if (!s) return;

    // сессия могла истечь
    if (Date.now() > s.expiresAt) {
      sessions.delete(token);
      return;
    }

    onlineSockets.set(s.email, socket.id);
    socket.data.email = s.email;
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
    if ((u.role === "support" || u.role === "admin") && onlineSockets.has(u.email)) {
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
    const orderId = String(req.body.orderId || "").trim().slice(0, 80);
    const message = String(req.body.message || "").trim().slice(0, 2000);
let priority = "normal";

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
if (orderId) {

  const order = orders.find(o => o.id === orderId || o.orderNumber === orderId);

  if (!order) {
    return res.json({
      success: false,
      message: "Заказ не найден"
    });
  }

  // пользователь должен быть участником заказа
  if (
    order.buyerEmail !== req.user.email &&
    order.sellerEmail !== req.user.email
  ) {
    return res.json({
      success: false,
      message: "Вы не являетесь участником этого заказа"
    });
  }
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
    orderId,
    message,
    attachments,
    priority
  });
// 🔔 Уведомляем всех support онлайн
users.forEach(u => {
  if (
    (u.role === "support" || u.role === "admin") &&
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
  if (req.user.role === "support") {
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

  if (t.assignedTo) {
    const u = users.get(t.assignedTo);
    if (u) assignedUsername = u.username;
  }

  const msgs = supportService.getMessages(t.id);
  const unread = msgs.filter(m => 
    m.from === "user" && 
    req.user.role !== "user" &&
    m.userEmail !== req.user.email
  ).length;

  // 🔥 ДОБАВЛЯЕМ CATEGORY LABEL ИЗ CONFIG
  const categoryConfig = SUPPORT_CONFIG[t.category];

  return {
    ...t,
    unread,
    assignedUsername,
    categoryLabel: categoryConfig
      ? categoryConfig.label
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

  const tickets = supportService.getTicketsForUser(req.user);

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
      req.user.role !== "admin"
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
    if (!targetUser || (targetUser.role !== "support" && targetUser.role !== "admin")) {
      return res.json({ success:false, message:"Сотрудник не найден" });
    }

    // только admin может передавать
    if (req.user.role !== "admin") {
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

if (
  ticket.userEmail !== req.user.email &&
  req.user.role !== "admin" &&
  (
    req.user.role !== "support" ||
    (ticket.assignedTo && ticket.assignedTo !== req.user.email)
  )
) {
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
    categoryLabel: categoryConfig ? categoryConfig.label : ticket.category
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

if (
  ticket.userEmail !== req.user.email &&
  req.user.role !== "admin" &&
  (
    req.user.role !== "support" ||
    (ticket.assignedTo && ticket.assignedTo !== req.user.email)
  )
) {
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

    // 🔹 Если support или admin
    if (req.user.role === "support" || req.user.role === "admin") {

      if (
        req.user.role === "support" &&
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

    }

    else {
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
// Получить список пользователей (только admin)
app.get("/api/admin/users", authRequired, (req, res) => {

  if (req.user.role !== "admin") {
    return res.json({ success:false, message:"Нет доступа" });
  }

  const list = Array.from(users.values()).map(u => ({
    email: u.email,
    username: u.username,
    role: u.role || "user",
    banned: Boolean(u.banned),
    balance: u.balance || 0,
    createdAt: u.createdAt
  }));

  res.json({ success:true, users:list });
});


// Забанить / разбанить
app.post("/api/admin/ban", authRequired, (req,res)=>{

  if (req.user.role !== "admin") {
    return res.json({ success:false, message:"Нет доступа" });
  }

  const { email, banned } = req.body;

  const target = users.get(email);
  if (!target) {
    return res.json({ success:false, message:"Пользователь не найден" });
  }

  target.banned = Boolean(banned);

  res.json({ success:true });
});
// Авто-закрытие тикетов через 5 дней после ответа поддержки
setInterval(() => {

  const allTickets = supportService.getAllTickets();
  const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
  const nowTime = Date.now();

  allTickets.forEach(ticket => {

    if (ticket.status === "resolved") return;

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

/* ================== START ================== */
server.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});