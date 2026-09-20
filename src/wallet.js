// Frani Signet — wallet boundary.
// Thin wrapper around the Sphere SDK. The service holds its own keys via the
// SDK's file storage; it never asks anyone for a seed or private key, and it
// only ever operates on testnet2.

import { Sphere, TokenRegistry, getCoinIdBySymbol } from '@unicitylabs/sphere-sdk';
import { createNodeProviders, createWalletApiProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { config, assertTestnet2 } from './config.js';

export async function openWallet() {
  assertTestnet2();

  const base = createNodeProviders({
    network: config.network,
    dataDir: config.dataDir,
    oracle: { apiKey: config.oracleApiKey },
  });

  // The SDK composes money through the wallet-api vertical, which is required
  // even when a run only signs. We always compose it against testnet2.
  const initInput = createWalletApiProviders(base, {
    baseUrl: config.walletApiBaseUrl,
    network: config.network,
    deviceId: config.deviceId,
  });

  const initOptions = {
    ...initInput,
    network: config.network,
    autoGenerate: true,
  };
  if (config.nametag) initOptions.nametag = config.nametag;

  const { sphere, created, generatedMnemonic } = await Sphere.init(initOptions);

  return { sphere, created, generatedMnemonic };
}

export async function closeWallet(sphere) {
  try {
    if (sphere) await sphere.destroy();
  } finally {
    TokenRegistry.destroy();
  }
}

// Resolve the UCT coin id, waiting for the token registry to be ready.
export async function uctCoinId() {
  await TokenRegistry.waitForReady().catch(() => {});
  return getCoinIdBySymbol('UCT');
}
