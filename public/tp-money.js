// public/tp-money.js
(function(){
  const KEY_CUR = "tp_currency";

  let __ratesCache = null;
  let __ratesAt = 0;
  const CACHE_MS = 10 * 60 * 1000; // 10 минут

  async function getRates(){
    const fresh = __ratesCache && (Date.now() - __ratesAt < CACHE_MS);
    if (fresh) return __ratesCache;

    const res = await fetch("/api/rates", { cache:"no-store" });
    const data = await res.json();

    if (data && data.success && data.rates) {
      __ratesCache = data;
      __ratesAt = Date.now();
      return data;
    }
    throw new Error("Rates not available");
  }

  function getCur(){
    return localStorage.getItem(KEY_CUR) || "EUR";
  }

  function round2(n){
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function symbol(cur){
    return cur === "EUR" ? "€" :
           cur === "USD" ? "$" :
           cur === "UAH" ? "₴" : cur;
  }

  // eur -> выбранная валюта пользователя
  async function formatPrice(eur){
    const cur = getCur();
    const ratesData = await getRates();
    const rate = ratesData.rates[cur] || 1;

    const value = round2(Number(eur) * rate);
    return `${value} ${symbol(cur)}`;
  }

  // удобно иногда получать просто число в валюте пользователя
  async function convertFromEUR(eur){
    const cur = getCur();
    const ratesData = await getRates();
    const rate = ratesData.rates[cur] || 1;
    return round2(Number(eur) * rate);
  }

  // выбранная валюта -> EUR
async function convertToEUR(amount){
  const cur = getCur();
  const ratesData = await getRates();
  const rate = ratesData.rates[cur] || 1;
  return round2(Number(amount) / rate);
}

  // событие для обновления страниц при смене валюты
  function emitCurrencyChanged(){
    window.dispatchEvent(new CustomEvent("tp:currency-change", { detail:{ currency:getCur() } }));
  }

  // экспортируем в window
  window.tpMoney = {
  getRates,
  formatPrice,
  convertFromEUR,
  convertToEUR, // ← ВАЖНО
  emitCurrencyChanged
};
})();