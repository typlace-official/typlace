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
const MUTED_CHATS_KEY = "tp_muted_chats";

function getMutedChats(){
  try{
    const raw = JSON.parse(localStorage.getItem(MUTED_CHATS_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  }catch{
    return [];
  }
}

function isChatMuted(chatId){
  if(!chatId) return false;
  return getMutedChats().includes(chatId);
}
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

// ================= SOCKET.IO =================
let socket = null;

if (isAuthed() && window.io) {
  socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 2000
});

socket.on("connect", () => {
  console.log("🟢 WebSocket connected");

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  socket.emit("auth", { token });
});

let lastMessageId = null;

socket.on("new-message", (message) => {
  if (!message || !message.chatId) return;

  if (message.id === lastMessageId) return;
  lastMessageId = message.id;

  const myEmail = localStorage.getItem("tp_user_email");
  const safeMyEmail = String(myEmail || "").trim().toLowerCase();
  const safeFromEmail = String(message.fromEmail || "").trim().toLowerCase();

  const isMine = safeMyEmail && safeFromEmail === safeMyEmail;
  const isInOpenChat = isChatActuallyOpen(message.chatId);

  if (shouldPlayMessageSound(message)) {
    playMessageSound();
  }

  // бейдж обновляем только для входящих сообщений,
  // которые не открыты прямо сейчас в активном чате
  if (!isMine && !isInOpenChat) {
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
    const elProfileMobile = document.getElementById("tpProfileMobile");
const elChatsMobile   = document.getElementById("tpChatsMobile");
    const elChatsBadges = [
  document.getElementById("tpChatsBadge"),
  document.getElementById("tpChatsBadgeMobile")
].filter(Boolean);
    // ===== SOUNDS =====
const soundMessage = new Audio("/sounds/message.mp3");
soundMessage.preload = "auto";
soundMessage.volume = 0.8;

function isChatsPage(){
  return /\/chats(?:\.html)?$/i.test(location.pathname) || location.pathname.includes("chats");
}

function isMobileChatLayout(){
  return window.matchMedia("(max-width: 640px)").matches;
}

function isChatActuallyOpen(chatId){
  if (!chatId) return false;
  if (!isChatsPage()) return false;
  if (window.tpActiveChatId !== chatId) return false;
  if (document.visibilityState !== "visible") return false;

  // На телефоне чат считается реально открытым
  // только когда открыта правая панель
  if (isMobileChatLayout()) {
    return document.body.classList.contains("tp-chat-open");
  }

  // На десктопе, если activeChatId совпадает — чат реально открыт
  return true;
}

function shouldPlayMessageSound(message){
  if (!message || !message.chatId) return false;

  const myEmail = localStorage.getItem("tp_user_email");
  const safeMyEmail = String(myEmail || "").trim().toLowerCase();
  const safeFromEmail = String(message.fromEmail || "").trim().toLowerCase();

  const isMine = safeMyEmail && safeFromEmail === safeMyEmail;
  const muted = isChatMuted(message.chatId);
  const chatOpenNow = isChatActuallyOpen(message.chatId);

  if (isMine) return false;
  if (muted) return false;
  if (chatOpenNow) return false;

  return true;
}

function playMessageSound(){
  try{
    soundMessage.currentTime = 0;
    soundMessage.play();
  }catch(e){}
}
    const elAvatar   = document.getElementById("tpAvatar");
    window.addEventListener("tp:profile-updated", (e) => {
  const user = e.detail?.user;
  if (!user) return;

  const avatarSrc =
    user.avatarUrl ||
    user.avatarDataUrl ||
    DEFAULT_AVATAR;

  if (elAvatar) {
    elAvatar.src = avatarSrc;
  }

  if (user.email) {
    localStorage.setItem("tp_user_email", user.email);
  }

  if (user.userId) {
    localStorage.setItem("tp_user_id", user.userId);
  }

  localStorage.setItem("tp_avatar", avatarSrc);
});
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
  const prevCur = getCur();

  setLang(id);
  const newCur = ensureCurrencyMatchesLang(id);

  if (window.tpI18n?.load) {
    await window.tpI18n.load(id);
    window.tpI18n.apply();
  }

  window.dispatchEvent(
    new CustomEvent("tp:lang-change", {
      detail: { lang: id }
    })
  );

  if (prevCur !== newCur) {
    if (window.tpMoney?.emitCurrencyChanged) {
      window.tpMoney.emitCurrencyChanged();
    } else {
      window.dispatchEvent(
        new CustomEvent("tp:currency-change", {
          detail: { currency: newCur }
        })
      );
    }
  }

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

  if (window.tpMoney?.emitCurrencyChanged) {
    window.tpMoney.emitCurrencyChanged();
  } else {
    window.dispatchEvent(
      new CustomEvent("tp:currency-change", {
        detail: { currency: x.id }
      })
    );
  }

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

  if (elProfile) elProfile.style.display = "inline-flex";
  if (elChats) elChats.style.display = "inline-flex";

  if(!authed){
    if (elAvatar) {
      elAvatar.src = DEFAULT_AVATAR;
    }

    if (elProfile) elProfile.href = "/auth.html?mode=login";
    if (elChats) elChats.href = "/auth.html?mode=login";
    if (elProfileMobile) elProfileMobile.href = "/auth.html?mode=login";
    if (elChatsMobile) elChatsMobile.href = "/auth.html?mode=login";

    return;
  }

  if (elProfile) elProfile.href = "/profile.html";
  if (elChats) elChats.href = "/chats.html";
  if (elProfileMobile) elProfileMobile.href = "/profile.html";
  if (elChatsMobile) elChatsMobile.href = "/chats.html";

  const res = await fetch("/auth/me", {
    headers:{
      Authorization:"Bearer " + localStorage.getItem(TOKEN_KEY)
    }
  });

  if (res.status === 403) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "/banned.html";
    return;
  }

  const data = await res.json().catch(() => ({}));

  if(!data.success){
    if (elAvatar) {
      elAvatar.src = DEFAULT_AVATAR;
    }
    return;
  }

  const user = data.user;

  if (user.userId) {
    localStorage.setItem("tp_user_id", user.userId);
  }

  if (elAvatar) {
    elAvatar.src =
      user.avatarDataUrl ||
      user.avatarUrl ||
      DEFAULT_AVATAR;
  }

  localStorage.setItem("tp_user_email", user.email);
  localStorage.setItem(
    "tp_avatar",
    user.avatarUrl || user.avatarDataUrl || ""
  );
}

(function initKeyboardAwareBottomBar(){
  const media = window.matchMedia("(max-width: 640px) and (hover: none) and (pointer: coarse)");
  let typingFocused = false;

  function isTypingElement(el){
    if (!el) return false;
    const tag = (el.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
  }

  function updateKeyboardState(){
    if (!media.matches) {
      document.body.classList.remove("tp-keyboard-open");
      return;
    }

    const vv = window.visualViewport;
    const diff = vv ? (window.innerHeight - vv.height) : 0;

    const keyboardOpen = typingFocused || diff > 120;

    document.body.classList.toggle("tp-keyboard-open", keyboardOpen);
  }

  window.addEventListener("focusin", (e) => {
    if (isTypingElement(e.target)) {
      typingFocused = true;
      updateKeyboardState();
    }
  });

  window.addEventListener("focusout", () => {
    setTimeout(() => {
      typingFocused = isTypingElement(document.activeElement);
      updateKeyboardState();
    }, 120);
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateKeyboardState);
    window.visualViewport.addEventListener("scroll", updateKeyboardState);
  }

  window.addEventListener("orientationchange", () => {
    setTimeout(updateKeyboardState, 250);
  });

  updateKeyboardState();
})();

async function updateUnreadCount(){
  if (!isAuthed()) {
    elChatsBadges.forEach(badge => {
      badge.style.display = "none";
      badge.textContent = "";
    });
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

    const count = Number(data.count || 0);
    const text = count > 99 ? "99+" : String(count);

    elChatsBadges.forEach(badge => {
      if (count > 0) {
        badge.textContent = text;
        badge.style.display = "flex";
      } else {
        badge.textContent = "";
        badge.style.display = "none";
      }
    });

  } catch(e){}
}

function applyLangAndCurrency(){
  const lang = getLang();
  ensureCurrencyMatchesLang(lang);

  if (window.tpI18n?.apply) {
    window.tpI18n.apply();
  }
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
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    updateUnreadCount();
  }
});

window.addEventListener("focus", () => {
  updateUnreadCount();
});

window.addEventListener("pageshow", () => {
  updateUnreadCount();
});
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

  }

mountHeader();

// совместимость со старым кодом
window.formatPrice = async function(baseAmount){
  if (window.tpMoney && typeof window.tpMoney.formatPrice === "function") {
    return await window.tpMoney.formatPrice(baseAmount);
  }

  return String(baseAmount ?? "");
};

})();