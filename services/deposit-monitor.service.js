const path = require("path");
const crypto = require("crypto");
const { readJson, writeJson } = require("./json-store.service");
const { listDepositWallets } = require("./deposit-wallet.service");
const { getConfirmedUsdtTransfers } = require("./tron.service");

const DEPOSITS_FILE = path.join(__dirname, "..", "data", "tron-deposits.json");
const PROCESSED_FILE = path.join(__dirname, "..", "data", "tron-processed-txs.json");

function listDeposits() {
  return readJson(DEPOSITS_FILE, []);
}

function listProcessedKeys() {
  return readJson(PROCESSED_FILE, []);
}

async function scanAllDepositWallets(onCredit) {
  const wallets = listDepositWallets();
  const deposits = listDeposits();
  const processed = new Set(listProcessedKeys());

  let depositsChanged = false;
  let processedChanged = false;

  for (const wallet of wallets) {
    let payload;

    try {
      payload = await getConfirmedUsdtTransfers(wallet.address);
    } catch (e) {
      console.log("scan wallet failed:", wallet.address, e.message);
      continue;
    }

    const txs = Array.isArray(payload?.data) ? payload.data : [];

    for (const tx of txs) {
      const txid = String(tx.transaction_id || "");
      const logIndex = Number(tx.log_index || 0);
      const uniqueKey = `${txid}:${logIndex}`;

      if (!txid) continue;
if (!tx.from) continue;
      if (processed.has(uniqueKey)) continue;
      if ((tx.to || "").toLowerCase() !== wallet.address.toLowerCase()) continue;

      const decimals = Number(tx?.token_info?.decimals || 6);
      const amountRaw = String(tx.value || "0");
      const amount = Number(amountRaw) / Math.pow(10, decimals);
// минимальный депозит 1 USDT
if (amount < 1) continue;
      if (!(amount > 0)) continue;

      await onCredit({
        wallet,
        tx,
        txid,
        logIndex,
        amount,
        amountRaw,
        decimals
      });

      deposits.push({
        id: crypto.randomUUID(),
        email: wallet.email,
        userId: wallet.userId || null,
        address: wallet.address,
        currency: "USDT",
        network: "TRC20",
        txHash: txid,
        logIndex,
        from: tx.from || "",
        to: tx.to || "",
        amount,
        amountRaw,
        decimals,
        status: "completed",
        createdAt: Date.now(),
        confirmedAt: Date.now()
      });

      processed.add(uniqueKey);
      depositsChanged = true;
      processedChanged = true;
    }
  }

  if (depositsChanged) {
    writeJson(DEPOSITS_FILE, deposits);
  }

  if (processedChanged) {
    writeJson(PROCESSED_FILE, Array.from(processed));
  }
}

module.exports = {
  listDeposits,
  scanAllDepositWallets
};