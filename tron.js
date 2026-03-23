const TronWeb = require("tronweb");

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  privateKey: process.env.TRON_PRIVATE_KEY
});

module.exports = tronWeb;