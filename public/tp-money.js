// public/tp-money.js
(function(){
  const KEY_CUR = "tp_currency";

  let __ratesCache = null;
  let __ratesAt = 0;
  const CACHE_MS = 10 * 60 * 1000; // 10 минут

  async function getRates(){
    const fresh = __ratesCache && (Date.now() - __ratesAt < CACHE_MS);
    if (fresh) return __ratesCache;

    const res = await fetch("/api/rates", { cache: "no-store" });
    const data = await res.json();

    if (data && data.success && data.rates) {
      __ratesCache = data;
      __ratesAt = Date.now();
      return data;
    }

    throw new Error("Rates not available");
  }

  function getCur(){
    return localStorage.getItem(KEY_CUR) || "UAH";
  }

  function round2(n){
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function symbol(cur){
    return cur === "EUR" ? "€" :
           cur === "USD" ? "$" :
           cur === "UAH" ? "₴" : cur;
  }

  // base = UAH
  function convertFromBaseRaw(amountBase, targetCur, rates){
    const value = Number(amountBase) || 0;
    const cur = targetCur || getCur();

    if (cur === "UAH") {
      return round2(value);
    }

    if (cur === "USD") {
      // rates.USD = сколько USD в 1 UAH
      return round2(value * Number(rates.USD || 0));
    }

    if (cur === "EUR") {
      // rates.EUR = сколько EUR в 1 UAH
      return round2(value * Number(rates.EUR || 0));
    }

    return round2(value);
  }

  async function formatPrice(amountBase){
    const cur = getCur();
    const ratesData = await getRates();
    const value = convertFromBaseRaw(amountBase, cur, ratesData.rates);
    return `${value} ${symbol(cur)}`;
  }

  async function convertFromBase(amountBase, targetCur){
    const ratesData = await getRates();
    return convertFromBaseRaw(amountBase, targetCur || getCur(), ratesData.rates);
  }

  async function convertToBase(amount, sourceCur){
    const cur = sourceCur || getCur();
    const value = Number(amount) || 0;
    const ratesData = await getRates();
    const rates = ratesData.rates;

    if (cur === "UAH") {
      return round2(value);
    }

    if (cur === "USD") {
      // USD -> UAH
      return round2(value / Number(rates.USD || 1));
    }

    if (cur === "EUR") {
      // EUR -> UAH
      return round2(value / Number(rates.EUR || 1));
    }

    return round2(value);
  }

  function emitCurrencyChanged(){
    window.dispatchEvent(
      new CustomEvent("tp:currency-change", {
        detail: { currency: getCur() }
      })
    );
  }

  window.tpMoney = {
    getRates,
    formatPrice,
    convertFromBase,
    convertToBase,

    // временные алиасы, чтобы старый код не сломался сразу
    convertFromEUR: convertFromBase,
    convertToEUR: convertToBase,

    emitCurrencyChanged
  };
})();