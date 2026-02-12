let RATES = null;

async function loadRates(){
  const res = await fetch("/api/rates");
  const data = await res.json();
  if (data.success) {
    RATES = data.rates;
  }
}

function convertFromEUR(amountEUR, target){
  if (!RATES || !RATES[target]) return amountEUR;
  return Math.round(amountEUR * RATES[target] * 100) / 100;
}

// загрузка сразу
loadRates();