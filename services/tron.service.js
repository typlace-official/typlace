const { TronWeb } = require("tronweb");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

function createTronClient(privateKey = "") {
  const options = {
    fullHost: "https://api.trongrid.io",
    headers: process.env.TRONGRID_API_KEY
      ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY }
      : undefined
  };

  if (privateKey) {
    options.privateKey = privateKey;
  }

  return new TronWeb(options);
}

async function createAccount() {
  const tronWeb = createTronClient();
  return tronWeb.createAccount();
}

async function getConfirmedUsdtTransfers(address) {

  if (!address) {
    throw new Error("address required");
  }
const params = new URLSearchParams({
  only_confirmed: "true",
  limit: "100",
  order_by: "block_timestamp,desc",
  contract_address: process.env.TRON_USDT_CONTRACT
});

  const res = await fetch(
    `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?${params.toString()}`,
    {
      headers: {
        accept: "application/json",
        ...(process.env.TRONGRID_API_KEY
          ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY }
          : {})
      }
    }
  );

  if (!res.ok) {
    throw new Error(`TronGrid error ${res.status}`);
  }

  return res.json();
}

module.exports = {
  createTronClient,
  createAccount,
  getConfirmedUsdtTransfers
};