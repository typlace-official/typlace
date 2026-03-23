const path = require("path");
const crypto = require("crypto");
const { readJson, writeJson } = require("./json-store.service");
const { createAccount } = require("./tron.service");

const FILE = path.join(__dirname, "..", "data", "tron-deposit-wallets.json");

function getMasterKey() {
  const raw = String(process.env.DEPOSIT_MASTER_KEY || "");
  if (raw.length < 16) {
    throw new Error("DEPOSIT_MASTER_KEY is required");
  }

  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(text) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(text), "utf8"),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  return [
    iv.toString("hex"),
    tag.toString("hex"),
    encrypted.toString("hex")
  ].join(":");
}

function decrypt(enc){

const key = getMasterKey();

const parts = enc.split(":");

const iv = Buffer.from(parts[0], "hex");
const tag = Buffer.from(parts[1], "hex");
const data = Buffer.from(parts[2], "hex");

const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);

const decrypted = Buffer.concat([
decipher.update(data),
decipher.final()
]);

return decrypted.toString("utf8");

}

function listDepositWallets() {
  return readJson(FILE, []);
}

function saveDepositWallets(items) {
  writeJson(FILE, items);
}

async function getOrCreateDepositWallet(user) {
  const wallets = listDepositWallets();

  let wallet = wallets.find(
    (w) =>
      w.email === user.email &&
      w.network === "TRON" &&
      w.token === "USDT"
  );

  if (wallet) {
    return wallet;
  }

  const account = await createAccount();

  wallet = {
    id: crypto.randomUUID(),
    email: user.email,
    userId: user.userId || null,
    network: "TRON",
    token: "USDT",
    address: account.address.base58,
    privateKeyEnc: encrypt(account.privateKey),
    createdAt: Date.now()
  };

  wallets.push(wallet);
  saveDepositWallets(wallets);

  return wallet;
}

module.exports = {
  listDepositWallets,
  getOrCreateDepositWallet,
  decrypt
};