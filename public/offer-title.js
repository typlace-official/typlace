function getTextByLang(value){

  let lang = localStorage.getItem("tp_lang") || "ru";

  if (lang === "ua") lang = "uk";

  if (typeof value === "string") return value;

  // ❗ НИКАКОГО fallback
  return value?.[lang] || "";
}

function buildOfferTitle(o) {
  const parts = [];

  const titleText = getTextByLang(o.title);
  if (titleText) parts.push(titleText);

if (o.category) {

  let label = o.category;

  if (o.game && window.tpI18n?.t) {

    const key = `${o.game}.categories.${o.category}`;
    const tr = window.tpI18n.t(key);

    if (tr && tr !== key) {
      label = tr;
    }

  }

  parts.push(label);
}

  const ignoreKeys = [
    "id",
    "game",
    "mode",
    "title",
    "description",
    "seller",
    "sellerEmail",
    "sellerName",
    "price",
    "priceNet",
    "images",
    "imageUrl",
    "status",
    "createdAt",
    "activeUntil",
    "extra",
    "category"
  ];

  Object.entries(o).forEach(([key, value]) => {
    if (ignoreKeys.includes(key)) return;
    if (value === null || value === undefined || value === "") return;

    if (key === "voiceChat") {
      parts.push(value === true ? "Есть VC" : "Нету VC");
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(v => {
        if (v) parts.push(v);
      });
      return;
    }

    if (typeof value === "string" || typeof value === "number") {
      parts.push(value);
    }
  });

  if (o.extra && typeof o.extra === "object") {
    Object.values(o.extra).forEach(val => {
      if (val && val !== "") parts.push(val);
    });
  }

  return [...new Set(parts)].join(", ");
}