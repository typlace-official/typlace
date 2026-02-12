function getTextByLang(value){
  const lang = localStorage.getItem("tp_lang") || "ru";

  if (typeof value === "string") return value;

  return value?.[lang] || value?.ru || "";
}
function buildOfferTitle(o) {
  const parts = [];

  const titleText = getTextByLang(o.title);
  if (titleText) parts.push(titleText);

  if (o.category) parts.push(o.category);

  // 👇 поля которые НЕ нужно выводить
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
    "extra"
  ];

  Object.entries(o).forEach(([key, value]) => {
    if (ignoreKeys.includes(key)) return;
    if (value === null || value === undefined) return;
    if (value === "") return;

    // boolean VC
    if (key === "voiceChat") {
      parts.push(value === true ? "Есть VC" : "Нету VC");
      return;
    }

    // массивы
    if (Array.isArray(value)) {
      value.forEach(v => {
        if (v) parts.push(v);
      });
      return;
    }

    // обычные поля
    if (typeof value === "string" || typeof value === "number") {
      parts.push(value);
    }
  });

  // extra
  if (o.extra && typeof o.extra === "object") {
    Object.values(o.extra).forEach(val => {
      if (val && val !== "") parts.push(val);
    });
  }

  return parts.join(", ");
}