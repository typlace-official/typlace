(function () {
  const ROLE_CONFIG = {
    admin: {
      className: "tp-badge tp-badge--admin",
      translationKey: "common.badges.admin"
    },
    super_admin: {
      className: "tp-badge tp-badge--super-admin",
      translationKey: "common.badges.super_admin"
    },
    moderator: {
      className: "tp-badge tp-badge--moderator",
      translationKey: "common.badges.moderator"
    },
    support: {
      className: "tp-badge tp-badge--support",
      translationKey: "common.badges.support"
    },
    resolution: {
      className: "tp-badge tp-badge--resolution",
      translationKey: "common.badges.resolution"
    },
    official: {
      className: "tp-verified",
      translationKey: "common.badges.official"
    },
    system: {
      className: "tp-badge tp-badge--system",
      translationKey: "system_messages.label"
    }
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        case "'": return "&#39;";
        default: return char;
      }
    });
  }

  function normalizeRole(role) {
    const safeRole = String(role || "").trim().toLowerCase();
    return ROLE_CONFIG[safeRole] ? safeRole : "user";
  }

  function getRoleConfig(role) {
    const safeRole = normalizeRole(role);
    return ROLE_CONFIG[safeRole] || null;
  }

  function resolvePath(obj, path) {
    if (!obj || !path) return undefined;

    return String(path)
      .split(".")
      .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
  }

  function getI18nSources() {
    const i18n = window.tpI18n || {};
    const lang = i18n.currentLang;

    const sources = [
      i18n.dict,
      i18n.data,
      i18n.messages,
      i18n.translations,
      i18n.localeData
    ];

    const expanded = [];

    sources.forEach((src) => {
      if (!src) return;

      expanded.push(src);

      if (lang && src[lang]) {
        expanded.push(src[lang]);
      }
    });

    return expanded;
  }

  function makeNeutralFallback(role) {
    return String(role || "")
      .trim()
      .replaceAll("_", " ")
      .toUpperCase() || "";
  }

  function getTranslatedLabel(role) {
    const safeRole = normalizeRole(role);
    const config = getRoleConfig(safeRole);

    if (!config) return "";

    const i18n = window.tpI18n;

    if (i18n && typeof i18n.t === "function") {
      const translated = i18n.t(config.translationKey);

      if (
        typeof translated === "string" &&
        translated.trim() &&
        translated !== config.translationKey
      ) {
        return translated.trim();
      }
    }

    const sources = getI18nSources();

    for (const source of sources) {
      const value = resolvePath(source, config.translationKey);

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return makeNeutralFallback(safeRole);
  }

  function getBadgeMeta(role) {
    const safeRole = normalizeRole(role);
    const config = getRoleConfig(safeRole);

    if (!config) return null;

    return {
      role: safeRole,
      className: config.className,
      label: getTranslatedLabel(safeRole)
    };
  }

  function getVerifiedHtml() {
    const label = escapeHtml(getTranslatedLabel("official") || "Official");

    return `
      <span class="tp-verified" aria-label="${label}" title="${label}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#1d9bf0"></circle>
          <path
            d="M9.15 12.45l1.85 1.85 4.2-4.8"
            fill="none"
            stroke="#ffffff"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          ></path>
        </svg>
      </span>
    `.trim();
  }

  function getBadgeHtml(role) {
    const meta = getBadgeMeta(role);

    if (!meta) return "";

    if (meta.role === "official") {
      return getVerifiedHtml();
    }

    return `<span class="${meta.className}">${escapeHtml(meta.label)}</span>`;
  }

  function renderNameWithBadge(name, role) {
    const safeName = escapeHtml(name || "");
    const badgeHtml = getBadgeHtml(role);

    if (!badgeHtml) {
      return `<span class="tp-name-text">${safeName}</span>`;
    }

    return `
      <span class="tp-name-with-badge">
        <span class="tp-name-text">${safeName}</span>
        ${badgeHtml}
      </span>
    `.trim();
  }

  function applyNameWithBadge(element, name, role) {
    if (!element) return;

    element.dataset.tpBadgeName = name || "";
    element.dataset.tpBadgeRole = role || "";

    element.innerHTML = renderNameWithBadge(name, role);
  }

  function refreshElementBadge(element) {
    if (!element) return;

    const name = element.dataset.tpBadgeName || "";
    const role = element.dataset.tpBadgeRole || "";

    element.innerHTML = renderNameWithBadge(name, role);
  }

  function refreshAllBadges(root = document) {
    root.querySelectorAll("[data-tp-badge-role], [data-tp-badge-name]").forEach(refreshElementBadge);
  }

  function hasBadge(role) {
    const safeRole = normalizeRole(role);
    return safeRole !== "user";
  }

  window.tpBadges = {
    escapeHtml,
    normalizeRole,
    getRoleConfig,
    getBadgeMeta,
    getTranslatedLabel,
    getBadgeHtml,
    renderNameWithBadge,
    applyNameWithBadge,
    refreshElementBadge,
    refreshAllBadges,
    hasBadge
  };

  document.addEventListener("DOMContentLoaded", () => {
    refreshAllBadges();
  });

  window.addEventListener("languagechange", () => {
    refreshAllBadges();
  });

  window.addEventListener("tp:i18n-loaded", () => {
    refreshAllBadges();
  });

  window.addEventListener("tp:lang-changed", () => {
    refreshAllBadges();
  });

  window.addEventListener("tp:lang-change", () => {
    refreshAllBadges();
  });
})();