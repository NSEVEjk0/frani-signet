// Frani Signet — DM command handler.
// Turns incoming direct messages into stamp / verify / help / about replies,
// and issues a payment request for the optional paid certificate.

import { createReceipt, verifyReceipt } from './receipt.js';
import { config } from './config.js';

const HELP = [
  'Frani Signet — signed proof-of-existence on Unicity testnet2.',
  '',
  'Commands (DM me):',
  '  stamp <text or 64-hex hash>   → a free, signed timestamp receipt',
  '  verify <receipt json>          → check a receipt I (or anyone) issued',
  '  certificate <text or hash>     → request an official signed certificate',
  '  about                          → what this service is',
  '  help                           → this message',
].join('\n');

function aboutText(identity) {
  const lines = [
    'Frani Signet',
    'A signed proof-of-existence service. Send text or a hash and receive a',
    'timestamped secp256k1 receipt that anyone can verify offline.',
    '',
    `Signer pubkey: ${identity?.chainPubkey || '(unknown)'}`,
  ];
  if (identity?.nametag) lines.push(`Nametag: @${identity.nametag}`);
  lines.push('', 'Made by CRYPTFRANI · Owner/creator: Itachi · testnet2 only.');
  if (config.certificatePriceUct > 0) {
    lines.push(
      '',
      `Official certificate: ${config.certificatePriceUct} UCT (earn-only; over/underpayment is refunded).`,
    );
  }
  return lines.join('\n');
}

// Parse a DM body into { command, argument }.
function parse(body) {
  const trimmed = String(body || '').trim();
  if (!trimmed) return { command: 'help', argument: '' };
  const space = trimmed.indexOf(' ');
  if (space === -1) return { command: trimmed.toLowerCase(), argument: '' };
  return {
    command: trimmed.slice(0, space).toLowerCase(),
    argument: trimmed.slice(space + 1).trim(),
  };
}

// Handle one message. `deps` provides the wallet-backed capabilities so this
// stays pure and testable.
//   deps.sign(payload)            -> hex signature
//   deps.identity                 -> sphere.identity
//   deps.saveReceipt(receipt)     -> persist
//   deps.requestPayment(pubkey, memo) -> create a payment request (paid cert)
export async function handleMessage(body, sender, deps) {
  const { command, argument } = parse(body);

  switch (command) {
    case 'help':
    case '?':
      return { reply: HELP };

    case 'about':
      return { reply: aboutText(deps.identity) };

    case 'stamp':
    case 'sign': {
      if (!argument) {
        return { reply: 'Usage: stamp <text or 64-hex hash>' };
      }
      const receipt = createReceipt({
        subject: argument,
        network: config.network,
        sign: deps.sign,
        signerPubkey: deps.identity.chainPubkey,
        signerNametag: deps.identity.nametag,
      });
      await deps.saveReceipt(receipt);
      return {
        reply: [
          'Stamped. Keep this receipt — anyone can verify it.',
          '',
          JSON.stringify(receipt),
        ].join('\n'),
        receipt,
      };
    }

    case 'verify': {
      if (!argument) {
        return { reply: 'Usage: verify <receipt json>' };
      }
      let parsed;
      try {
        parsed = JSON.parse(argument);
      } catch {
        return { reply: 'That does not look like receipt JSON. Paste the full receipt.' };
      }
      const result = verifyReceipt(parsed);
      if (result.ok) {
        return {
          reply: [
            'VALID receipt.',
            `Subject digest: ${result.subject.digest}`,
            `Issued: ${result.issuedAtIso}`,
            `Signer: ${result.signer.pubkey}${result.signer.nametag ? ' (@' + result.signer.nametag + ')' : ''}`,
          ].join('\n'),
          result,
        };
      }
      return {
        reply: ['INVALID receipt.', ...result.problems.map((p) => `- ${p}`)].join('\n'),
        result,
      };
    }

    case 'certificate':
    case 'cert': {
      if (config.certificatePriceUct <= 0) {
        return {
          reply:
            'Paid certificates are not enabled on this instance. Use "stamp" for a free signed receipt.',
        };
      }
      if (!argument) {
        return { reply: 'Usage: certificate <text or 64-hex hash>' };
      }
      // Earn-only: we ask the sender to pay via a payment request. The receipt
      // itself is issued on confirmed payment by the daemon's transfer handler.
      const memo = `Frani Signet certificate for ${argument.slice(0, 40)}`;
      const pr = await deps.requestPayment(sender, memo, argument);
      if (!pr || !pr.success) {
        return {
          reply: `Could not create a payment request${pr?.error ? ': ' + pr.error : ''}. Try again shortly.`,
        };
      }
      return {
        reply: [
          `Payment request sent for ${config.certificatePriceUct} UCT.`,
          'Pay it and I will DM you a signed official certificate.',
          'Over/underpayment is refunded automatically.',
          `Request id: ${pr.requestId}`,
        ].join('\n'),
        paymentRequest: pr,
      };
    }

    default:
      return {
        reply: `Unknown command "${command}". Send "help" for the command list.`,
      };
  }
}

export { HELP, aboutText, parse };
