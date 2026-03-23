function getCurrentLang() {
  const lang = (localStorage.getItem("tp_lang") || "ru").trim().toLowerCase();
  return ["ru", "uk", "en"].includes(lang) ? lang : "ru";
}

function getTextByLang(value) {
  const lang = getCurrentLang();

  if (typeof value === "string") return value.trim();
  return String(value?.[lang] || "").trim();
}

function getModeConfig(o) {
  return window.GAMES?.[o.game]?.modes?.[o.mode] || null;
}

function translateCategory(o) {
  if (!o.category) return "";

  if (o.game && window.tpI18n?.t) {
    const key = `${o.game}.categories.${o.category}`;
    const tr = window.tpI18n.t(key);

    if (tr && tr !== key) {
      return tr.trim();
    }
  }

  return String(o.category).trim();
}

function getFilterOptionLabel(modeConfig, filterKey, value) {
  if (!modeConfig?.filters?.[filterKey]) return "";

  const filter = modeConfig.filters[filterKey];
  const options = Array.isArray(filter.options) ? filter.options : [];

  const found = options.find(opt => {
    if (typeof opt === "object") return String(opt.value) === String(value);
    return String(opt) === String(value);
  });

  if (!found) return String(value).trim();

  if (typeof found === "object") {
    if (found.labelKey && window.tpI18n?.t) {
      const tr = window.tpI18n.t(found.labelKey);
      if (tr && tr !== found.labelKey) return tr.trim();
    }

    return String(found.label || found.value || "").trim();
  }

  return String(found).trim();
}

function resolveAmount(o) {
  if (o.amount !== null && o.amount !== undefined && o.amount !== "") {
    return String(o.amount).trim();
  }

  const extra = o.extra || {};

  if (extra.amount_exact) return String(extra.amount_exact).trim();
  if (extra.amount_official && extra.amount_official !== "other") return String(extra.amount_official).trim();
  if (extra.amount_giftcard && extra.amount_giftcard !== "other") return String(extra.amount_giftcard).trim();
  if (extra.amount_premium) return String(extra.amount_premium).trim();

  return "";
}

function resolveTitlePart(o, part, modeConfig) {
  switch (part) {
    case "title":
      return getTextByLang(o.title);

    case "category":
      return translateCategory(o);

    case "voiceChat":
      if (o.voiceChat === true) {
        return window.tpI18n?.t?.("common.vc_yes") || "Есть VC";
      }
      if (o.voiceChat === false) {
        return window.tpI18n?.t?.("common.vc_no") || "Нету VC";
      }
      return "";

    case "amount":
      return resolveAmount(o);

    case "method":
    case "accountType":
    case "accountRegion":
    case "country": {
      const directValue =
        o[part] !== undefined && o[part] !== null && o[part] !== ""
          ? o[part]
          : o.extra?.[part];

      if (directValue === undefined || directValue === null || directValue === "") {
        return "";
      }

      return getFilterOptionLabel(modeConfig, part, directValue);
    }

    default: {
      const directValue =
        o[part] !== undefined && o[part] !== null && o[part] !== ""
          ? o[part]
          : o.extra?.[part];

      if (directValue === undefined || directValue === null || directValue === "") {
        return "";
      }

      return String(directValue).trim();
    }
  }
}

function getTitlePartsForMode(o, modeConfig) {
  if (Array.isArray(modeConfig?.titleParts) && modeConfig.titleParts.length) {
    return modeConfig.titleParts;
  }

  if (Array.isArray(modeConfig?.categories) && modeConfig.categories.length) {
    return ["title", "category"];
  }

  return ["title"];
}

function buildOfferTitle(o) {
  const modeConfig = getModeConfig(o);
  const titleParts = getTitlePartsForMode(o, modeConfig);

  const parts = titleParts
    .map(part => resolveTitlePart(o, part, modeConfig))
    .filter(Boolean);

  const finalParts = [...new Set(parts)];

  return finalParts.length ? finalParts.join(", ") : "Предложение";
}

window.buildOfferTitle = buildOfferTitle;