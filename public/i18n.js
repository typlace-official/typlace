window.tpI18n = {
  translations: {},
  currentLang: localStorage.getItem("tp_lang") || "ru",

  async load(lang) {
    this.currentLang = lang;

    // загружаем common
    const commonRes = await fetch(`/locales/${lang}/common.json`, { cache: "no-cache" });
    const common = await commonRes.json();

    // загружаем roblox (если существует)
    let roblox = {};
    try {
      const robloxRes = await fetch(`/locales/${lang}/roblox.json`, { cache: "no-cache" });
      if (robloxRes.ok) {
        roblox = await robloxRes.json();
      }
    } catch(e){}

// имя страницы (cookie, privacy, index и т.д.)
const pageName =
  location.pathname.split("/").pop().replace(".html", "") || "index";

// пробуем загрузить json страницы
let page = {};
try {
  const pageRes = await fetch(`/locales/${lang}/${pageName}.json`, { cache: "no-cache" });
  if (pageRes.ok) {
    page = await pageRes.json();
  }
} catch (e) {}

this.translations = { common, roblox, page };

this.apply();
  },

t(key, params = {}) {
  const parts = key.split(".");
  let value = this.translations;

  for (const p of parts) {
    value = value?.[p];
  }

  if (value == null) return key;

  Object.keys(params).forEach(k => {
    value = value.replace(new RegExp(`{{\\s*${k}\\s*}}`, "g"), params[k]);
  });

  return value;
},

plural(n, one, few, many) {
  n = Math.abs(n) % 100;
  const n1 = n % 10;

  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
},

pluralKey(baseKey, count) {
  const form = this.plural(count, "one", "few", "many");
  return this.t(`${baseKey}_${form}`, { count });
},
apply(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    el.innerHTML = this.t(el.dataset.i18n);
  });

  root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = this.t(el.dataset.i18nPlaceholder);
  });

  // ✅ перевод <title data-i18n="">
  const titleEl = document.querySelector("title[data-i18n]");
  if (titleEl) {
    document.title = this.t(titleEl.dataset.i18n);
  }
}
};

// первая загрузка
document.addEventListener("DOMContentLoaded", async () => {
  await window.tpI18n.load(window.tpI18n.currentLang);
});