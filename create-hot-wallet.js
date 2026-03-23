const { TronWeb } = require("tronweb");

async function createWallet() {
  const tronWeb = new TronWeb({
    fullHost: "https://api.trongrid.io"
  });

  const account = await tronWeb.createAccount();

  console.log("HOT WALLET CREATED");
  console.log("Address:", account.address.base58);
  console.log("Private Key:", account.privateKey);
}

createWallet();