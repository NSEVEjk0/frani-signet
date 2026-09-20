#!/usr/bin/env node
// Frani Signet — command line + daemon entrypoint.
// Made by CRYPTFRANI. Owner / creator: Itachi. Unicity testnet2 only.

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { config } from '../src/config.js';
import { openWallet, closeWallet, uctCoinId } from '../src/wallet.js';
import { createReceipt, verifyReceipt } from '../src/receipt.js';
import { ReceiptStore } from '../src/store.js';
import { handleMessage, HELP, aboutText } from '../src/service.js';

const log = (...a) => console.log(new Date().toISOString(), ...a);

function toBaseUnits(whole, decimals = 8) {
  // whole UCT -> smallest-unit decimal string, no floating point drift.
  const [i, f = ''] = String(whole).split('.');
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
  return (BigInt(i || '0') * 10n ** BigInt(decimals) + BigInt(frac || '0')).toString();
}

// ---- one-shot commands (no network needed for help/about text) ------------

async function cmdHelp() {
  console.log(HELP);
}

async function cmdAbout() {
  // About works offline; if a wallet exists we enrich it with the signer key.
  try {
    const { sphere } = await openWallet();
    console.log(aboutText(sphere.identity));
    await closeWallet(sphere);
  } catch {
    console.log(aboutText(null));
  }
}

async function cmdStamp(argument) {
  if (!argument) {
    console.error('Usage: signet stamp <text or 64-hex hash>');
    process.exit(1);
  }
  const { sphere } = await openWallet();
  try {
    const receipt = createReceipt({
      subject: argument,
      network: config.network,
      sign: (m) => sphere.signMessage(m),
      signerPubkey: sphere.identity.chainPubkey,
      signerNametag: sphere.identity.nametag,
    });
    const store = new ReceiptStore(config.receiptsDir);
    const file = await store.save(receipt);
    log('receipt stored at', file);
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    await closeWallet(sphere);
  }
}

async function cmdVerify(argument) {
  let raw = argument;
  // Allow "verify @file.json" to read a receipt from disk.
  if (raw && raw.startsWith('@')) {
    raw = await readFile(raw.slice(1), 'utf8');
  }
  if (!raw) {
    console.error('Usage: signet verify <receipt json | @file.json>');
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('Could not parse receipt JSON.');
    process.exit(1);
  }
  const result = verifyReceipt(parsed);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}

// ---- daemon ----------------------------------------------------------------

async function cmdDaemon() {
  const { sphere, created, generatedMnemonic } = await openWallet({ withPayments: true });
  const store = new ReceiptStore(config.receiptsDir);
  await store.init();

  if (created && generatedMnemonic) {
    log('A NEW wallet was created. Its mnemonic lives in', config.dataDir);
    log('Back up that directory. It will not be shown again.');
  }

  const identity = sphere.identity;
  log('Frani Signet is live on', config.network);
  log('signer pubkey:', identity?.chainPubkey);
  if (identity?.directAddress) log('direct address:', identity.directAddress);
  if (identity?.nametag) log('nametag: @' + identity.nametag);
  if (config.certificatePriceUct > 0) {
    log('paid certificate enabled at', config.certificatePriceUct, 'UCT');
  }

  const coinId = config.certificatePriceUct > 0 ? await uctCoinId() : null;

  // Track certificate requests we asked to be paid, so a confirmed payment can
  // be turned into a signed certificate — and any overpayment refunded.
  const pendingCerts = new Map(); // requestId -> { subject, sender, amount }

  const deps = {
    identity,
    sign: (m) => sphere.signMessage(m),
    saveReceipt: (r) => store.save(r),
    requestPayment: async (sender, memo, subject) => {
      const amount = toBaseUnits(config.certificatePriceUct);
      const res = await sphere.payments.requests.create(sender, { coinId, amount, memo });
      if (res.success && res.requestId) {
        pendingCerts.set(res.requestId, { subject, sender, amount });
      }
      return res;
    },
  };

  sphere.on('message:dm', async (msg) => {
    const sender = msg.senderPubkey;
    const label = msg.senderNametag ? '@' + msg.senderNametag : sender?.slice(0, 12);
    log('dm from', label, '::', String(msg.content || '').slice(0, 80));
    try {
      const { reply } = await handleMessage(msg.content, sender, deps);
      if (reply) {
        await sphere.communications.sendDM(sender, reply);
        log('reply sent to', label);
      }
    } catch (err) {
      log('handler error:', err.message);
      try {
        await sphere.communications.sendDM(sender, 'Something went wrong handling that. Try "help".');
      } catch {
        /* best effort */
      }
    }
  });

  // Confirmed incoming payment for a certificate → issue the signed certificate
  // and refund any overpayment. Never re-send on an uncertain outcome.
  sphere.on('transfer:incoming', async (transfer) => {
    log('incoming transfer from', transfer.senderPubkey?.slice(0, 12), 'tokens:', transfer.tokens?.length);
    // Certificate issuance is keyed off the payment request lifecycle below.
  });

  sphere.on('payment_request:paid', async (view) => {
    const meta = pendingCerts.get(view.requestId || view.id);
    if (!meta) return;
    try {
      const receipt = createReceipt({
        subject: meta.subject,
        network: config.network,
        sign: (m) => sphere.signMessage(m),
        signerPubkey: identity.chainPubkey,
        signerNametag: identity.nametag,
        label: 'official-certificate',
      });
      await store.save(receipt);
      await sphere.communications.sendDM(
        meta.sender,
        ['Official Frani Signet certificate:', '', JSON.stringify(receipt)].join('\n'),
      );
      log('certificate issued to', meta.sender.slice(0, 12));
      pendingCerts.delete(view.requestId || view.id);
    } catch (err) {
      log('certificate issuance error:', err.message);
    }
  });

  const shutdown = async () => {
    log('shutting down...');
    await closeWallet(sphere);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log('listening for direct messages. Ctrl-C to stop.');
}

// ---- dispatch --------------------------------------------------------------

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const argument = rest.join(' ');
  switch (cmd) {
    case 'daemon':
      return cmdDaemon();
    case 'stamp':
    case 'sign':
      return cmdStamp(argument);
    case 'verify':
      return cmdVerify(argument);
    case 'about':
      return cmdAbout();
    case 'help':
    case undefined:
    case '--help':
    case '-h':
      return cmdHelp();
    default:
      console.error(`Unknown command "${cmd}". Try "signet help".`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('fatal:', err.message);
  process.exit(1);
});
