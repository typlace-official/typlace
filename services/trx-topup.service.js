const { TronWeb } = require("tronweb");
const { listDepositWallets } = require("./deposit-wallet.service");

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  headers: process.env.TRONGRID_API_KEY
    ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY }
    : undefined,
  privateKey: process.env.TRON_HOT_WALLET_PRIVATE_KEY
});

const MIN_TRX_BALANCE_SUN = 2_000_000; // 2 TRX — если на депозитном меньше, пополняем
const TOPUP_AMOUNT_SUN = 5_000_000;    // 5 TRX — сколько отправляем
const HOT_WALLET_RESERVE_SUN = 10_000_000; // 10 TRX — запас на hot wallet

function sunToTrx(sun) {
  return Number(sun || 0) / 1_000_000;
}

async function topupWallet(address) {
  const hotAddress = process.env.TRON_HOT_WALLET_ADDRESS;

  if (!hotAddress || !process.env.TRON_HOT_WALLET_PRIVATE_KEY) {
    console.log("TRX topup skipped: no hot wallet env");
    return false;
  }

  if (!address) return false;

  if (!tronWeb.isAddress(address)) {
    console.log("TRX topup skipped: invalid address", address);
    return false;
  }

  if (address === hotAddress) {
    return false;
  }

  const walletBalanceSun = await tronWeb.trx.getBalance(address);

  // На кошельке уже достаточно TRX
  if (Number(walletBalanceSun) >= MIN_TRX_BALANCE_SUN) {
    return false;
  }

  const hotBalanceSun = await tronWeb.trx.getBalance(hotAddress);

  // На hot wallet не хватает TRX даже на одну отправку + запас
  if (Number(hotBalanceSun) < TOPUP_AMOUNT_SUN + HOT_WALLET_RESERVE_SUN) {
    console.log(
      `TRX topup skipped: hot wallet balance is too low (${sunToTrx(hotBalanceSun)} TRX)`
    );
    return false;
  }

  const tx = await tronWeb.transactionBuilder.sendTrx(
    address,
    TOPUP_AMOUNT_SUN,
    hotAddress
  );

  const signed = await tronWeb.trx.sign(tx);
  const result = await tronWeb.trx.sendRawTransaction(signed);

  if (!result?.result) {
    throw new Error(result?.code || result?.message || "TRX topup failed");
  }

  console.log(
    `TRX topup success: ${address}, +${sunToTrx(TOPUP_AMOUNT_SUN)} TRX, txid=${result.txid || ""}`
  );

  return true;
}

async function topupAllWallets() {
  const hotAddress = process.env.TRON_HOT_WALLET_ADDRESS;
  const hotPrivateKey = process.env.TRON_HOT_WALLET_PRIVATE_KEY;

  if (!hotAddress || !hotPrivateKey) {
    console.log("TRX topup skipped: no hot wallet env");
    return;
  }

  if (!tronWeb.isAddress(hotAddress)) {
    console.log("TRX topup skipped: invalid hot wallet address");
    return;
  }

  const wallets = listDepositWallets();

  if (!Array.isArray(wallets) || wallets.length === 0) {
    return;
  }

  const hotBalanceSun = await tronWeb.trx.getBalance(hotAddress);

  // Если на hot wallet мало TRX — вообще не пытаемся топапить, чтобы не спамить ошибки
  if (Number(hotBalanceSun) < TOPUP_AMOUNT_SUN + HOT_WALLET_RESERVE_SUN) {
    console.log(
      `TRX topup skipped: hot wallet has only ${sunToTrx(hotBalanceSun)} TRX`
    );
    return;
  }

  for (const w of wallets) {
    try {
      await topupWallet(w.address);
    } catch (e) {
      console.log("TRX topup failed:", w.address, e.message);
    }
  }
}

module.exports = {
  topupAllWallets,
  topupWallet
};