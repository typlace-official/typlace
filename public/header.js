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
  ua: { label:"Українська" },
  en: { label:"English" }
};

  const CURRENCIES_BY_LANG = {
  ru: [
    { id:"UAH", label:"Гривны" },
    { id:"USD", label:"Доллары" },
    { id:"EUR", label:"Евро" }
  ],
  ua: [
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
  ua:"UAH",
  en:"USD"
};

  function isAuthed(){
    return !!localStorage.getItem(TOKEN_KEY);
  }

  function getLang(){
    const v = localStorage.getItem(KEY_LANG);
    return (v === "ru" || v === "ua" || v === "en") ? v : "en";
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
      socket.emit("auth", data.user.email);
    }
  });

socket.on("new-message", (message) => {

  if (!message || !message.chatId) return;

  const isInChat = window.tpActiveChatId === message.chatId;

  // 🔊 звук
  playMessageSound(isInChat);

  // 🔢 badge обновляем ТОЛЬКО если не в открытом чате
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
// 🔓 Разблокировка аудио после первого клика
function unlockAudio(){
  soundMessage.play().then(()=>{
    soundMessage.pause();
    soundMessage.currentTime = 0;
  }).catch(()=>{});

  soundTick.play().then(()=>{
    soundTick.pause();
    soundTick.currentTime = 0;
  }).catch(()=>{});

  document.removeEventListener("click", unlockAudio);
}

document.addEventListener("click", unlockAudio);

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

    const langBtn    = document.getElementById("tpLangBtn");
    const langText   = document.getElementById("tpLangText");
    const langPanel  = document.getElementById("tpLangPanel");

    const curBtn     = document.getElementById("tpCurBtn");
    const curText    = document.getElementById("tpCurText");
    const curPanel   = document.getElementById("tpCurPanel");

    const sInput   = document.getElementById("tpSearch");
    const sClear   = document.getElementById("tpClear");
    const drop     = document.getElementById("tpDrop");
    const dropList = document.getElementById("tpDropList");
    const overlay  = document.getElementById("tpOverlay");

    function closePanels(){
      langPanel.classList.remove("show");
      curPanel.classList.remove("show");
    }

function closeDrop(){

  // если поиск не открыт — просто выходим
  if (!document.body.classList.contains("tp-search-open")) {
    return;
  }

  drop.classList.remove("show");
  dropList.innerHTML = "";

  if (overlay) overlay.classList.remove("show");

  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";

  document.body.classList.remove("tp-search-open");

  window.scrollTo(0, scrollY);
}

// ⬛ клик по затемнению — закрывает поиск
if (overlay) {
  overlay.addEventListener("click", () => {
    closeDrop();
    closePanels();
  });
}
// 🔽 Закрытие поиска при клике вне поля поиска
document.addEventListener("click", (e) => {

  const searchWrap = document.querySelector(".tp-search");

  // если поиск открыт
  if (drop.classList.contains("show")) {

    // если клик НЕ внутри поиска
    if (!searchWrap.contains(e.target)) {
      closeDrop();
    }

  }

});
    async function applyAuthUI(){
  const authed = isAuthed();
  const lang = getLang();

  elLogin.style.display    = authed ? "none" : "inline-flex";
  elRegister.style.display = authed ? "none" : "inline-flex";
  elProfile.style.display  = authed ? "inline-flex" : "none";
  elChats.style.display    = authed ? "inline-flex" : "none";

  if(!authed){
    elAvatar.src = DEFAULT_AVATAR;
    return;
  }

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
  elProfileLabel.textContent =
    lang === "en" ? "Profile" :
    lang === "ua" ? "Профіль" :
    "Профиль";
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

      langText.textContent = LANGS[lang].label;

      const item = CURRENCIES_BY_LANG[lang].find(x=>x.id===cur);
      curText.textContent = item ? item.label : "";

      sInput.placeholder =
  lang === "en" ? "Search" :
  lang === "ua" ? "Пошук" :
  "Поиск";


      elLogin.textContent =
  lang === "en" ? "Login" :
  lang === "ua" ? "Вхід" :
  "Вход";
      elRegister.textContent =
  lang === "en" ? "Sign up" :
  lang === "ua" ? "Реєстрація" :
  "Регистрация";

      langPanel.innerHTML = "";
      ["ru","ua","en"].forEach(id=>{
        const b = document.createElement("button");
        b.className="tp-item";
        b.innerHTML = `<span>${LANGS[id].label}</span><small>${lang===id?"✓":""}</small>`;
        b.onclick = (e)=>{
  e.preventDefault();

  setLang(id);
  applyLangAndCurrency();
  applyAuthUI();
  closePanels();

};
        langPanel.appendChild(b);
      });

      curPanel.innerHTML = "";
      CURRENCIES_BY_LANG[lang].forEach(x=>{
        const b = document.createElement("button");
        b.className="tp-item";
        b.innerHTML = `<span>${x.label}</span><small>${x.id===cur?"✓":""}</small>`;
        b.onclick = (e)=>{
  e.preventDefault();

  setCur(x.id);
  applyLangAndCurrency();
  closePanels();
  window.dispatchEvent(new Event("tp:currency-change"));

};
        curPanel.appendChild(b);
      });
// === CHATS LABEL ===
const chatsLabel = document.getElementById("tpChatsLabel");
if (chatsLabel) {
  if (lang === "ru") chatsLabel.textContent = "Чаты";
  else if (lang === "ua") chatsLabel.textContent = "Чати";
  else chatsLabel.textContent = "Chats";
}
    }

    function togglePanel(panel){
  const wrap = panel.closest(".tp-pill-wrap");
  const isOpen = panel.classList.contains("show");

  // закрываем всё
  langPanel.classList.remove("show");
  curPanel.classList.remove("show");
  document.querySelectorAll(".tp-pill-wrap").forEach(w=>w.classList.remove("open"));
  closeDrop();

  if (!isOpen) {
    panel.classList.add("show");
    wrap.classList.add("open"); // 🔥 для поворота стрелки
  }
}

    langBtn.onclick = e=>{ e.stopPropagation(); togglePanel(langPanel); };
    curBtn.onclick  = e=>{ e.stopPropagation(); togglePanel(curPanel); };
// 🔽 Закрытие языковой и валютной панели при клике вне их
document.addEventListener("click", (e) => {

  const langWrap = langBtn.closest(".tp-pill-wrap");
  const curWrap  = curBtn.closest(".tp-pill-wrap");

  // если клик вне языка
  if (!langWrap.contains(e.target)) {
    langPanel.classList.remove("show");
    langWrap.classList.remove("open");
  }

  // если клик вне валюты
  if (!curWrap.contains(e.target)) {
    curPanel.classList.remove("show");
    curWrap.classList.remove("open");
  }

});
    document.addEventListener("keydown", e=>{
      if(e.key==="Escape"){
        closePanels();
        closeDrop();
      }
    });

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
    lang === "ua" ? "Нічого не знайдено" :
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
      closePanels();
      location.href = "/game.html?game=" + game.id;
    };

    dropList.appendChild(row);
  });
}


// если уже открыт — ничего не делаем
if (!drop.classList.contains("show")) {

  drop.classList.add("show");

  if (overlay) overlay.classList.add("show");

  document.body.classList.add("tp-search-open");

  // 🔒 блокируем скролл только ОДИН раз
  scrollY = window.scrollY;

  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

}
    sInput.addEventListener("input", ()=>{
      const v = sInput.value || "";
      sClear.hidden = !v.trim();
      renderSearch(v);
    });

    sInput.addEventListener("focus", ()=>{
      if((sInput.value||"").trim()){
        renderSearch(sInput.value);
      }
    });

    sClear.onclick=()=>{
      sInput.value="";
      sClear.hidden = true;
      closeDrop();
      sInput.focus();
    };

    window.addEventListener("storage", (e)=>{
      if(e.key === TOKEN_KEY){
        applyAuthUI();
      }
    });

applyLangAndCurrency();
applyAuthUI();
updateUnreadCount();

// === ACTIVE AUTH TAB ===
const url = new URL(location.href);
const mode = url.searchParams.get("mode");

// сначала снимаем активность с обоих
elLogin.classList.remove("is-active");
elRegister.classList.remove("is-active");

// включаем нужную
if (mode === "login") {
  elLogin.classList.add("is-active");
}

if (mode === "register") {
  elRegister.classList.add("is-active");
}
// 🔁 синхронизация с auth.html (вкладки снизу)
window.addEventListener("auth:mode-change", (e) => {
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