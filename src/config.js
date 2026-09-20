// Frani Signet — configuration
// Made by CRYPTFRANI. Owner / creator: Itachi.
//
// Every network-bearing value is read from the environment with a testnet2
// default. The service is testnet2-only by design: see assertTestnet2().

import process from 'node:process';

export const NETWORK = process.env.SIGNET_NETWORK || 'testnet2';

export const config = {
  network: NETWORK,
  dataDir: process.env.SIGNET_DATA_DIR || './wallet-data',
  walletApiBaseUrl:
    process.env.SIGNET_WALLET_API || 'https://wallet-api.unicity.network',
  // Public testnet2 oracle key — not a secret. Override for other environments.
  oracleApiKey:
    process.env.SIGNET_ORACLE_KEY || 'sk_ddc3cfcc001e4a28ac3fad7407f99590',
  deviceId: process.env.SIGNET_DEVICE_ID || 'frani-signet-1',
  // Optional @nametag to register on first run.
  nametag: process.env.SIGNET_NAMETAG || '',
  // Optional paid "official certificate" — amount in whole UCT. 0 disables it.
  certificatePriceUct: Number(process.env.SIGNET_CERT_PRICE_UCT || '0'),
  // Directory where issued receipts are archived as JSON.
  receiptsDir: process.env.SIGNET_RECEIPTS_DIR || './receipts',
};

// Hard guard: refuse to run against anything that is not testnet2 unless the
// operator has very explicitly opted into another network. This keeps testnet
// and mainnet strictly separate.
export function assertTestnet2() {
  if (config.network !== 'testnet2' && !process.env.SIGNET_ALLOW_NONTESTNET2) {
    throw new Error(
      `Frani Signet is testnet2-only. Refusing to start on '${config.network}'. ` +
        `Set SIGNET_ALLOW_NONTESTNET2=1 only if you truly mean it.`,
    );
  }
}
