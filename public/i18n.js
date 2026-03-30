(() => {
  const SUPPORTED_LANGS = ["ru", "uk", "en"];
  const DEFAULT_LANG = "ru";
  const CACHE = new Map();

  function normalizeLang(lang) {
    const safeLang = String(lang || "").trim().toLowerCase();
    return SUPPORTED_LANGS.includes(safeLang) ? safeLang : DEFAULT_LANG;
  }

  function getPageName() {
    const fileName = location.pathname.split("/").pop() || "";
    const pageName = fileName.replace(".html", "").trim();
    return pageName || "index";
  }

  async function fetchJson(url, { optional = false } = {}) {
    try {
      const res = await fetch(url);

      if (!res.ok) {
        if (optional) return {};
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      if (!optional) {
        console.error(`i18n load failed: ${url}`, err);
      }
      return {};
    }
  }

  function resolvePath(obj, key) {
    return String(key || "")
      .split(".")
      .reduce((acc, part) => acc?.[part], obj);
  }

  function interpolate(value, params = {}) {
    if (typeof value !== "string") return value;

    return value.replace(/{{\s*([\w.-]+)\s*}}/g, (_, key) => {
      const replacement = params[key];
      return replacement == null ? "" : String(replacement);
    });
  }

  function getPluralForm(lang, count) {
    const n = Math.abs(Number(count) || 0);

    if (lang === "en") {
      return n === 1 ? "one" : "many";
    }

    const mod100 = n % 100;
    const mod10 = n % 10;

    if (mod100 > 10 && mod100 < 20) return "many";
    if (mod10 === 1) return "one";
    if (mod10 >= 2 && mod10 <= 4) return "few";
    return "many";
  }

  const tpI18n = {
    translations: {
      common: {},
      roblox: {},
      page: {}
    },

    currentLang: normalizeLang(localStorage.getItem("tp_lang")),

    async load(lang) {
      const safeLang = normalizeLang(lang);
      const pageName = getPageName();
      const cacheKey = `${safeLang}:${pageName}`;

      let loaded = CACHE.get(cacheKey);

      if (!loaded) {
        const [common, roblox, page] = await Promise.all([
          fetchJson(`/locales/${safeLang}/common.json`),
          fetchJson(`/locales/${safeLang}/roblox.json`, { optional: true }),
          fetchJson(`/locales/${safeLang}/${pageName}.json`, { optional: true })
        ]);

        loaded = { common, roblox, page };
        CACHE.set(cacheKey, loaded);
      }

      this.currentLang = safeLang;
      this.translations = loaded;

      localStorage.setItem("tp_lang", safeLang);
      document.documentElement.lang = safeLang;

      this.apply();

      const detail = { lang: safeLang };

      document.dispatchEvent(new CustomEvent("tp:lang-change", { detail }));
      window.dispatchEvent(new CustomEvent("tp:lang-change", { detail }));

      return this.translations;
    },

    async setLang(lang) {
      return await this.load(lang);
    },

get(key, fallback = null) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return fallback;

  // 1) обычный поиск:
  // common.home -> translations.common.home
  // page.title  -> translations.page.title
  const direct = resolvePath(this.translations, safeKey);
  if (direct != null) {
    return direct;
  }

  // 2) fallback-поиск внутри common/page/roblox,
  // чтобы работали ключи, которые лежат в common.json
  const fromCommon = resolvePath(this.translations.common, safeKey);
  if (fromCommon != null) {
    return fromCommon;
  }

  const fromPage = resolvePath(this.translations.page, safeKey);
  if (fromPage != null) {
    return fromPage;
  }

  const fromRoblox = resolvePath(this.translations.roblox, safeKey);
  if (fromRoblox != null) {
    return fromRoblox;
  }

  return fallback;
},

    t(key, params = {}) {
      const value = this.get(key);

      if (value == null) {
        return key;
      }

      if (typeof value !== "string") {
        return String(value);
      }

      return interpolate(value, params);
    },

    plural(count, one, few, many) {
      const form = getPluralForm(this.currentLang, count);

      if (form === "one") return one;
      if (form === "few") return few;
      return many;
    },

    pluralKey(baseKey, count, params = {}) {
      const form = getPluralForm(this.currentLang, count);
      return this.t(`${baseKey}_${form}`, { count, ...params });
    },

    apply(root = document) {
      if (!root || !root.querySelectorAll) return;

      root.querySelectorAll("[data-i18n]").forEach(el => {
        el.textContent = this.t(el.dataset.i18n);
      });

      root.querySelectorAll("[data-i18n-html]").forEach(el => {
        el.innerHTML = this.t(el.dataset.i18nHtml);
      });

      root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        el.placeholder = this.t(el.dataset.i18nPlaceholder);
      });

      root.querySelectorAll("[data-i18n-title]").forEach(el => {
        el.title = this.t(el.dataset.i18nTitle);
      });

      root.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
        el.setAttribute("aria-label", this.t(el.dataset.i18nAriaLabel));
      });

      root.querySelectorAll("[data-i18n-value]").forEach(el => {
        el.value = this.t(el.dataset.i18nValue);
      });

      const titleEl = document.querySelector("title[data-i18n]");
      if (titleEl) {
        document.title = this.t(titleEl.dataset.i18n);
      }
    }
  };

  window.tpI18n = tpI18n;

  document.documentElement.lang = tpI18n.currentLang;

  window.tpI18nReady = tpI18n
    .load(tpI18n.currentLang)
    .catch(err => {
      console.error("tpI18n init failed:", err);
    })
    .finally(() => {
      window.dispatchEvent(new CustomEvent("tp:i18n-ready"));
    });
})();