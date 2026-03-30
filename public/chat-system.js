(function () {
  const SYSTEM_TEXT_KEYS = Object.freeze({
    order_created: "common.system_messages.order_created",
    order_confirmed: "common.system_messages.order_confirmed",
    order_refunded: "common.system_messages.order_refunded",
    order_confirmed_admin: "common.system_messages.order_confirmed_admin",
    order_refunded_admin: "common.system_messages.order_refunded_admin",
    review_created: "common.system_messages.review_created",

    resolution_requested: "common.system_messages.resolution_requested",
    resolution_assigned: "common.system_messages.resolution_assigned",
    resolution_confirmed: "common.system_messages.resolution_confirmed",
    resolution_refunded: "common.system_messages.resolution_refunded"
  });

  const SYSTEM_LABEL_KEY = "common.system_messages.label";
  const FALLBACK_USER_KEY = "common.system_messages.fallback_user";
  const FALLBACK_ORDER_KEY = "common.system_messages.fallback_order";
  const FALLBACK_TEXT_KEY = "common.system_messages.fallback_text";

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pickFirst(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const str = String(value).trim();
      if (str) return str;
    }
    return "";
  }

  function getCurrentLang() {
    const lang =
      window.tpI18n?.currentLang ||
      localStorage.getItem("tp_lang") ||
      "ru";

    return ["ru", "uk", "en"].includes(lang) ? lang : "ru";
  }

  function getLocale() {
    const lang = getCurrentLang();
    if (lang === "uk") return "uk-UA";
    if (lang === "en") return "en-US";
    return "ru-RU";
  }

  function formatTime(createdAt) {
    const date = new Date(createdAt || Date.now());

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString(getLocale(), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function t(key, params = {}) {
    if (!window.tpI18n?.t) return "";
    const value = window.tpI18n.t(key, params);
    if (!value || value === key) return "";
    return String(value);
  }

  function isSystemMessage(message) {
    if (!message || typeof message !== "object") return false;

    return (
      message.fromEmail === "system" ||
      Boolean(message.systemType) ||
      Boolean(message.meta?.systemType)
    );
  }

  function extractSystemData(message) {
    const meta =
      message?.meta && typeof message.meta === "object" && !Array.isArray(message.meta)
        ? message.meta
        : {};

    return {
      systemType: pickFirst(message?.systemType, meta.systemType),
      orderId: pickFirst(message?.orderId, meta.orderId),
      orderNumber: pickFirst(message?.orderNumber, meta.orderNumber),
      actorUserId: pickFirst(message?.actorUserId, meta.actorUserId),
      actorUsername: pickFirst(message?.actorUsername, meta.actorUsername),
      actorRole: pickFirst(message?.actorRole, meta.actorRole)
    };
  }

  function renderUserLink(userId, username) {
    const safeName = esc(username || t(FALLBACK_USER_KEY));

    if (!userId) {
      return `<span>${safeName}</span>`;
    }

    return `<a class="tp-system-link" href="/profile.html?id=${encodeURIComponent(userId)}">${safeName}</a>`;
  }

  function renderOrderLink(orderId, orderNumber) {
    const safeLabel = esc(orderNumber || t(FALLBACK_ORDER_KEY));

    if (!orderId) {
      return `<span>${safeLabel}</span>`;
    }

    return `<a class="tp-system-link" href="/order.html?id=${encodeURIComponent(orderId)}">${safeLabel}</a>`;
  }

  function buildSystemHtml(message) {
    const data = extractSystemData(message);
    const key = SYSTEM_TEXT_KEYS[data.systemType] || FALLBACK_TEXT_KEY;

    return (
      t(key, {
        actor: renderUserLink(data.actorUserId, data.actorUsername),
        order: renderOrderLink(data.orderId, data.orderNumber)
      }) ||
      t(FALLBACK_TEXT_KEY)
    );
  }

  function renderSystemMessage(message) {
    return `
      <div class="msg msg-system" data-msg-id="${esc(message?.id || "")}">
        <div class="msg-body msg-body--system">
          <div class="msg-system-badge">${esc(t(SYSTEM_LABEL_KEY))}</div>
          <div class="msg-system-text">${buildSystemHtml(message)}</div>
          <span class="msg-time msg-time--system">${esc(formatTime(message?.createdAt))}</span>
        </div>
      </div>
    `;
  }

  window.tpChatSystem = {
    isSystemMessage,
    extractSystemData,
    buildSystemHtml,
    renderSystemMessage
  };
})();