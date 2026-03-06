(function(){
  const TOKEN_KEY = "tp_token";
  const KEY_LANG  = "tp_lang";
  const KEY_CUR   = "tp_currency";

  const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="32" fill="#d9d9d9"/>' +
    '<circle cx="32" cy="26" r="12" fill="#bdbdbd"/>' +
    '<path d="M12 56c4-12 14-18 20-18s16 6 20 18" fill="#bdbdbd"/>' +
    "</svg>"
  );

const LANGS = {
  ru: { label:"Русский" },
  uk: { label:"Українська" },
  en: { label:"English" }
};

  const CURRENCIES_BY_LANG = {
  ru: [
    { id:"UAH", label:"Гривны" },
    { id:"USD", label:"Доллары" },
    { id:"EUR", label:"Евро" }
  ],
  uk: [
    { id:"UAH", label:"Гривні" },
    { id:"USD", label:"Долари" },
    { id:"EUR", label:"Євро" }
  ],
  en: [
    { id:"USD", label:"USD" },
    { id:"EUR", label:"EUR" }
  ]
};


  const DEFAULT_CURRENCY = {
  ru:"UAH",
  uk:"UAH",
  en:"USD"
};

  function isAuthed(){
    return !!localStorage.getItem(TOKEN_KEY);
  }

function getLang(){
  const v = localStorage.getItem(KEY_LANG);
  return (v === "ru" || v === "uk" || v === "en") ? v : "ru";
}

  function setLang(v){ localStorage.setItem(KEY_LANG, v); }

  function getCur(){ return localStorage.getItem(KEY_CUR) || ""; }
  function setCur(v){ localStorage.setItem(KEY_CUR, v); }

  function ensureCurrencyMatchesLang(lang){
    const allowed = (CURRENCIES_BY_LANG[lang] || []).map(x=>x.id);
    let cur = getCur();
    if(!cur || !allowed.includes(cur)){
      cur = DEFAULT_CURRENCY[lang];
      setCur(cur);
    }
    return cur;
  }

  async function mountHeader(){
    const box = document.getElementById("header-container");
    if(!box) return;

    const res = await fetch("/header.html", { cache:"no-cache" });
    const html = await res.text();
    box.innerHTML = html;

    initHeader();
  }

  function initHeader(){
    let scrollY = 0;
    let lastUnreadCount = parseInt(localStorage.getItem("tp_last_unread") || "0");
// ================= SOCKET.IO =================
let socket = null;

if (isAuthed() && window.io) {
  socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 2000
});

  socket.on("connect", async () => {
    console.log("🟢 WebSocket connected");

    // получаем email пользователя
    const res = await fetch("/auth/me", {
      headers:{
        Authorization:"Bearer " + localStorage.getItem(TOKEN_KEY)
      }
    });

    const data = await res.json();
    if (data.success) {
      socket.emit("auth", {
  token: localStorage.getItem(TOKEN_KEY)
});
    }
  });
let lastMessageId = null;
socket.on("new-message", (message) => {

  if (!message || !message.chatId) return;

  // 🚫 защита от повторов
  if (message.id === lastMessageId) return;
  lastMessageId = message.id;

  const isInChat =
    window.tpActiveChatId === message.chatId &&
    document.visibilityState === "visible";

  const myEmail = localStorage.getItem("tp_user_email");
  const isMine = myEmail && message.fromEmail === myEmail;

  if (!isMine) {
    playMessageSound(isInChat);
  }

  if (!isInChat) {
    updateUnreadCount();
  }

  window.dispatchEvent(new CustomEvent("tp:new-message", {
    detail: message
  }));
});

  socket.on("disconnect", () => {
    console.log("🔴 WebSocket disconnected");
  });
}
    const elLogin    = document.getElementById("tpLogin");
    const elRegister = document.getElementById("tpRegister");
    const elProfile  = document.getElementById("tpProfile");
    const elChats    = document.getElementById("tpChats");
    const elChatsBadge = document.getElementById("tpChatsBadge");
    // ===== SOUNDS =====
const soundMessage = new Audio("/sounds/message.mp3");
const soundTick = new Audio("/sounds/tick.mp3");
// 🔓 Просто preload без воспроизведения
soundMessage.preload = "auto";
soundTick.preload = "auto";
soundMessage.volume = 0.8;
soundTick.volume = 0.3;

function playMessageSound(isInChat){
  try{
    if(isInChat){
      soundTick.currentTime = 0;
      soundTick.play();
    }else{
      soundMessage.currentTime = 0;
      soundMessage.play();
    }
  }catch(e){}
}
    const elAvatar   = document.getElementById("tpAvatar");
    const elProfileLabel = document.getElementById("tpProfileLabel");

// DESKTOP
const sInputDesktop = document.getElementById("tpSearch");
const sClearDesktop = document.getElementById("tpClear");

// MOBILE
const sInputMobile  = document.getElementById("tpMobileSearch");
const burgerMobile  = document.getElementById("tpMobileBurger");

function getActiveSearchInput(){
  return window.innerWidth <= 640
    ? sInputMobile
    : sInputDesktop;
}
const sClear = sClearDesktop; // на мобиле clear можно пока не делать

// GLOBAL DROP + OVERLAY
const drop     = document.getElementById("tpDrop");
const dropList = document.getElementById("tpDropList");
const overlay  = document.getElementById("tpOverlay");

const burgerLangToggle = document.getElementById("tpBurgerLangToggle");
const burgerCurToggle  = document.getElementById("tpBurgerCurToggle");

const burgerLangSub = document.getElementById("tpBurgerLangSub");
const burgerCurSub  = document.getElementById("tpBurgerCurSub");

const burgerLangValue = document.getElementById("tpBurgerLangValue");
const burgerCurValue  = document.getElementById("tpBurgerCurValue");

if (burgerLangToggle && burgerCurToggle) {

  function updateBurgerValues() {
    const lang = getLang();
    const cur = ensureCurrencyMatchesLang(lang);

    burgerLangValue.textContent = LANGS[lang].label;

    const curItem = (CURRENCIES_BY_LANG[lang] || [])
      .find(x => x.id === cur);

    burgerCurValue.textContent = curItem ? curItem.label : "";
  }

  function renderBurgerLists() {
    const lang = getLang();

    // LANG LIST
    burgerLangSub.innerHTML = "";
["ru","uk","en"].forEach(id => {

  if (id === getLang()) return; // ❗ не показываем выбранный

  const btn = document.createElement("button");
  btn.className = "tp-item";
  btn.textContent = LANGS[id].label;

btn.onclick = async () => {
  setLang(id);

  if (window.tpI18n?.load) {
    await window.tpI18n.load(id);
    window.tpI18n.apply();
  }

  window.dispatchEvent(
    new CustomEvent("tp:lang-change", {
      detail: { lang: id }
    })
  );

    applyLangAndCurrency();

  renderBurgerLists();
};

  burgerLangSub.appendChild(btn);
});

// CUR LIST
burgerCurSub.innerHTML = "";
const currentCur = ensureCurrencyMatchesLang(lang);

(CURRENCIES_BY_LANG[lang] || []).forEach(x => {

  if (x.id === currentCur) return; // ❗ не показываем выбранную валюту

  const btn = document.createElement("button");
  btn.className = "tp-item";
  btn.textContent = x.label;

  btn.onclick = () => {
    setCur(x.id);
    updateBurgerValues();

    burgerCurSub.classList.remove("open");
    burgerCurToggle.classList.remove("open");
  };

  burgerCurSub.appendChild(btn);
});

    updateBurgerValues();
  }

burgerLangToggle.addEventListener("click", () => {

  const nowOpen = burgerLangSub.classList.toggle("open");
  burgerLangToggle.classList.toggle("open", nowOpen);

  burgerCurSub.classList.remove("open");
  burgerCurToggle.classList.remove("open");
});

burgerCurToggle.addEventListener("click", () => {

  const willOpen = !burgerCurSub.classList.contains("open");

  burgerCurSub.classList.toggle("open", willOpen);
  burgerCurToggle.classList.toggle("open", willOpen);

  burgerLangSub.classList.remove("open");
  burgerLangToggle.classList.remove("open");
});

  renderBurgerLists();
}

const burgerBtn   = document.getElementById("tpBurger");
const burgerPanel = document.getElementById("tpBurgerPanel");

function openBurger(){
  if (!burgerPanel) return;
  burgerPanel.classList.add("show");
  // overlay НЕ включаем для бургера
}

function closeBurger(){
  if (!burgerPanel) return;
  burgerPanel.classList.remove("show");

  // overlay НЕ трогаем (он только для поиска)

  burgerLangSub?.classList.remove("open");
  burgerCurSub?.classList.remove("open");
  burgerLangToggle?.classList.remove("open");
  burgerCurToggle?.classList.remove("open");
}

function toggleBurger(){
  if (!burgerPanel) return;
  burgerPanel.classList.contains("show") ? closeBurger() : openBurger();
}

// клик по бургеру (desktop)
burgerBtn?.addEventListener("click", (e)=>{
  e.stopPropagation();
  toggleBurger();
});

// клик по бургеру (mobile)
if (burgerMobile) {
  burgerMobile.addEventListener("click", (e)=>{
    e.stopPropagation();
    toggleBurger();
  });
}
// клик вне панели — закрыть
document.addEventListener("click", (e)=>{
  if (!burgerPanel?.classList.contains("show")) return;

  const t = e.target;

  if (
    burgerPanel.contains(t) ||
    t.closest("#tpBurger") ||
    t.closest("#tpMobileBurger")
  ) {
    return;
  }

  closeBurger();
});

function closeDrop(){

  if (!document.body.classList.contains("tp-search-open")) {
    return;
  }

  drop.classList.remove("show");
  dropList.innerHTML = "";

  if (overlay && !burgerPanel?.classList.contains("show")) {
  overlay.classList.remove("show");
}
  document.body.classList.remove("tp-search-open");

  // 🔓 Разморозка
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";

  window.scrollTo(0, scrollY);
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  // сначала закрываем поиск, если открыт
  if (document.body.classList.contains("tp-search-open")) {
    closeDrop();
    return;
  }

  // иначе закрываем бургер
  closeBurger();
});
if (overlay) {
overlay.addEventListener("click", () => {
  if (document.body.classList.contains("tp-search-open")) {
    closeDrop();
  }
});
}

document.addEventListener("click", (e) => {
  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  const searchWrap = isMobile
    ? document.querySelector(".tp-mobile-search")
    : document.querySelector(".tp-search");

  if (drop.classList.contains("show")) {
    if (!searchWrap || !searchWrap.contains(e.target)) {
      closeDrop();
    }
  }
});

    async function applyAuthUI(){
  const authed = isAuthed();
  const lang = getLang();

// всегда показываем профиль и чаты
elProfile.style.display = "inline-flex";
elChats.style.display   = "inline-flex";

if(!authed){
  elAvatar.src = DEFAULT_AVATAR;

  // если не авторизован — клики ведут на логин
  elProfile.href = "/auth.html?mode=login";
  elChats.href   = "/auth.html?mode=login";
  return;
}

// если авторизован — нормальные ссылки
elProfile.href = "/profile.html";
elChats.href   = "/chats.html";

  // 🔥 получаем реальные данные пользователя
  const res = await fetch("/auth/me", {
    headers:{
      Authorization:"Bearer " + localStorage.getItem(TOKEN_KEY)
    }
  });

  const data = await res.json();

  if(!data.success){
    elAvatar.src = DEFAULT_AVATAR;
    return;
  }

  const user = data.user;
  // 🔥 СОХРАНЯЕМ МОЙ USER ID
if (user.userId) {
  localStorage.setItem("tp_user_id", user.userId);
}

  elAvatar.src =
    user.avatarDataUrl ||
    user.avatarUrl ||
    DEFAULT_AVATAR;
// 🔥 СОХРАНЯЕМ ДЛЯ ЧАТОВ
localStorage.setItem("tp_user_email", user.email);
localStorage.setItem(
  "tp_avatar",
  user.avatarUrl || user.avatarDataUrl || ""
);

}

async function updateUnreadCount(){
  if (!isAuthed()) {
    if (elChatsBadge) elChatsBadge.style.display = "none";
    return;
  }

  try{
    const res = await fetch("/api/chats/unread-count", {
      headers:{
        Authorization:"Bearer " + localStorage.getItem(TOKEN_KEY)
      }
    });

    const data = await res.json();

    if (!data.success) return;
    if (!elChatsBadge) return;

    const count = data.count || 0;

// 🔢 badge
if (count > 0) {
  elChatsBadge.textContent = count > 99 ? "99+" : count;
  elChatsBadge.style.display = "flex";
} else {
  elChatsBadge.style.display = "none";
}

// 💾 запоминаем последнее значение
lastUnreadCount = count;
localStorage.setItem("tp_last_unread", count);


    if (!elChatsBadge) return;

  } catch(e){}
}
    function applyLangAndCurrency(){
      const lang = getLang();
      const cur = ensureCurrencyMatchesLang(lang);

    }

    function escReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
    function highlight(t,q){
      if(!q) return t;
      return t.replace(new RegExp("("+escReg(q)+")","ig"),'<span class="tp-highlight">$1</span>');
    }

function renderSearch(q){
  const query = (q || "").trim().toLowerCase();
  if (!query) {
    closeDrop();
    return;
  }

  const lang = getLang();
  const games = window.GAMES_LIST || [];

  const results = games
    .filter(g => g.name.toLowerCase().includes(query))
    .slice(0, 10);

  dropList.innerHTML = "";

if (results.length === 0) {
  const empty = document.createElement("div");
  empty.className = "tp-row tp-row-empty";
  empty.textContent =
    lang === "en" ? "Nothing found" :
    lang === "uk" ? "Нічого не знайдено" :
    "Не найдено";

  dropList.appendChild(empty);
} else {
  results.forEach(game => {
    const row = document.createElement("div");
    row.className = "tp-row";

    row.innerHTML = `
      <img
        class="tp-row-img"
        src="/img/games/${game.file}"
        alt="${game.name}"
        onerror="this.style.display='none'"
      >
      <div class="tp-row-text">
        <b>${highlight(game.name, query)}</b>
      </div>
    `;

row.onclick = () => {
  closeDrop();
  location.href = "/game.html?game=" + game.id;
};

    dropList.appendChild(row);
  });
}

if (!drop.classList.contains("show")) {

  drop.classList.add("show");

  if (overlay) overlay.classList.add("show");

  document.body.classList.add("tp-search-open");

  // 🔒 Замораживаем страницу
  scrollY = window.scrollY;

  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

}
function bindSearchInput(input){
  if(!input) return;

  input.addEventListener("input", ()=>{
    const v = input.value || "";
    if (sClear) sClear.hidden = !v.trim();
    renderSearch(v);
  });

  input.addEventListener("focus", ()=>{
    if((input.value||"").trim()){
      renderSearch(input.value);
    }
  });
}

bindSearchInput(sInputDesktop);
bindSearchInput(sInputMobile);

if (sClear) {
  sClear.onclick = () => {
    const input = getActiveSearchInput();
    if (input) input.value = "";
    sClear.hidden = true;
    closeDrop();
    input?.focus();
  };
}

    window.addEventListener("storage", (e)=>{
      if(e.key === TOKEN_KEY){
        applyAuthUI();
      }
    });

applyLangAndCurrency();
applyAuthUI();
updateUnreadCount();
if (window.tpI18n?.apply) {
  window.tpI18n.apply();
}
// === ACTIVE HEADER ICON ===
const path = location.pathname;

if (path.includes("help")) {
  document.querySelector(".tp-help")?.classList.add("is-active");
}

if (path.includes("chats")) {
  document.querySelector(".tp-chat")?.classList.add("is-active");
}

if (path.includes("profile")) {
  document.querySelector(".tp-profile")?.classList.add("is-active");
}
// === ACTIVE MOBILE BOTTOM MENU ===
document.querySelectorAll(".tp-bottom-item").forEach(link => {

  const href = link.getAttribute("href");

  if (location.pathname.includes(href)) {
    link.classList.add("is-active");
  }

});
// === ACTIVE AUTH TAB ===
const url = new URL(location.href);
const mode = url.searchParams.get("mode");

if (elLogin && elRegister) {

  elLogin.classList.remove("is-active");
  elRegister.classList.remove("is-active");

  if (mode === "login") {
    elLogin.classList.add("is-active");
  }

  if (mode === "register") {
    elRegister.classList.add("is-active");
  }

}
window.addEventListener("auth:mode-change", (e) => {

  if (!elLogin || !elRegister) return;

  const m = e.detail.mode;

  elLogin.classList.remove("is-active");
  elRegister.classList.remove("is-active");

  if (m === "login") {
    elLogin.classList.add("is-active");
  }

  if (m === "register") {
    elRegister.classList.add("is-active");
  }

});
// ===== iOS KEYBOARD FIX (PROPER VERSION) =====
// ===== SCROLL CLOSE KEYBOARD (NO TEXT MODE) =====

if (sInputMobile) {

  let startY = 0;

  window.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {

    const searchOpen = document.body.classList.contains("tp-search-open");

    // Если уже открыт поиск (есть текст) — ничего не делаем
    if (searchOpen) return;

    const active = document.activeElement === sInputMobile;
    if (!active) return;

    const diff = e.touches[0].clientY - startY;

if (Math.abs(diff) > 10) {
  sInputMobile.blur();
}

  }, { passive: true });

}
if (window.visualViewport && sInputMobile) {

  const headerMobile = document.querySelector(".tp-header-mobile");
  const bottomNav = document.querySelector(".tp-bottom-mobile");

  function updateViewport() {

    const viewportHeight = window.visualViewport.height;
    const windowHeight = window.innerHeight;

    const keyboardOpen = viewportHeight < windowHeight - 120;

    if (keyboardOpen) {

      // скрываем нижний бар
      if (bottomNav) bottomNav.style.display = "none";

    } else {

      // возвращаем
      if (bottomNav) bottomNav.style.display = "flex";

    }
  }

  window.visualViewport.addEventListener("resize", updateViewport);
  window.visualViewport.addEventListener("scroll", updateViewport);

}
  }

  mountHeader();
// ================== PRICE FORMATTER ==================
let __ratesCache = null;

async function getRates(){
  if (__ratesCache) return __ratesCache;

  const res = await fetch("/api/rates");
  const data = await res.json();

  if (data.success) {
    __ratesCache = data;
    return data;
  }
  throw new Error("Rates not available");
}

// price — ВСЕГДА В EUR (как на сервере)
window.formatPrice = async function(priceEUR){
  const cur = localStorage.getItem("tp_currency") || "EUR";
  const ratesData = await getRates();

  const rate = ratesData.rates[cur] || 1;
  const value = Math.round(priceEUR * rate * 100) / 100;

  const symbols = {
    EUR: "€",
    USD: "$",
    UAH: "₴"
  };

  return `${value} ${symbols[cur] || cur}`;
}
})();
