const { TronWeb } = require("tronweb");
const { listDepositWallets, decrypt } = require("./deposit-wallet.service");

const USDT_CONTRACT = process.env.TRON_USDT_CONTRACT;
if (!USDT_CONTRACT) {
  throw new Error("TRON_USDT_CONTRACT env missing");
}

async function sweepWallet(wallet){

try{

const privateKey = decrypt(wallet.privateKeyEnc);

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  headers: process.env.TRONGRID_API_KEY
    ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY }
    : undefined,
  privateKey
});

const contract = await tronWeb.contract().at(USDT_CONTRACT);

const balance = await contract.balanceOf(wallet.address).call();

const amount = Number(balance.toString());

if(amount <= 0){
return;
}

const hotWallet = process.env.TRON_HOT_WALLET_ADDRESS;

if (!hotWallet) {
  console.log("Sweep skipped: no hot wallet");
  return;
}

await contract.transfer(
hotWallet,
amount
).send({
feeLimit:100000000
});

console.log("Sweep success", wallet.address);

}catch(e){

console.log("Sweep error", wallet.address, e.message);

}

}

async function sweepAllWallets(){

const wallets = listDepositWallets();

for(const wallet of wallets){

await sweepWallet(wallet);

}

}

module.exports = {
sweepAllWallets
};