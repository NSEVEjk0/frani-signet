// Frani Signet — receipt construction and verification.
// A receipt is a small, canonical JSON object that binds a subject (raw text
// or a hex hash) to a moment in time and to a secp256k1 signature produced by
// the service wallet. Anyone holding a receipt can verify it offline.

import { createHash } from 'node:crypto';
import { verifySignedMessage, recoverPubkeyFromSignature } from '@unicitylabs/sphere-sdk';

export const RECEIPT_VERSION = 'frani-signet/1';
const HEX64 = /^[0-9a-f]{64}$/i;

// Normalise a subject into { kind, digest } where digest is always a 64-char
// lowercase sha256 hex. If the caller already passed a 64-hex hash we treat it
// as the digest directly; otherwise we hash the UTF-8 text.
export function subjectDigest(input) {
  const value = String(input ?? '');
  if (HEX64.test(value.trim())) {
    return { kind: 'hash', digest: value.trim().toLowerCase() };
  }
  const digest = createHash('sha256').update(value, 'utf8').digest('hex');
  return { kind: 'text', digest };
}

// The exact string that gets signed. Signing the canonical line (not the whole
// JSON) keeps verification stable regardless of key ordering in transport.
export function signingPayload({ version, network, subjectKind, digest, issuedAt, nonce }) {
  return [
    version,
    network,
    subjectKind,
    digest,
    String(issuedAt),
    nonce,
  ].join('\n');
}

// Build and sign a receipt. `sign` is a function (string) => hexSignature — in
// practice sphere.signMessage bound to the wallet. `signerPubkey` is the 66-hex
// compressed key the signature recovers to.
export function createReceipt({ subject, network, sign, signerPubkey, signerNametag, label }) {
  const { kind, digest } = subjectDigest(subject);
  const issuedAt = Date.now();
  const nonce = createHash('sha256')
    .update(digest + issuedAt + Math.random())
    .digest('hex')
    .slice(0, 16);

  const payload = signingPayload({
    version: RECEIPT_VERSION,
    network,
    subjectKind: kind,
    digest,
    issuedAt,
    nonce,
  });
  const signature = sign(payload);

  return {
    version: RECEIPT_VERSION,
    network,
    subject: { kind, digest },
    issuedAt,
    issuedAtIso: new Date(issuedAt).toISOString(),
    nonce,
    label: label || undefined,
    signer: {
      pubkey: signerPubkey,
      nametag: signerNametag || undefined,
    },
    signature,
    issuer: 'Frani Signet · CRYPTFRANI',
  };
}

// Verify a receipt object. Returns a structured result rather than throwing so
// callers can render a clear pass/fail.
export function verifyReceipt(receipt) {
  const problems = [];
  if (!receipt || typeof receipt !== 'object') {
    return { ok: false, problems: ['receipt is not an object'] };
  }
  if (receipt.version !== RECEIPT_VERSION) {
    problems.push(`unexpected version: ${receipt.version}`);
  }
  const digest = receipt?.subject?.digest;
  if (!HEX64.test(String(digest || ''))) {
    problems.push('subject digest is not a 64-char hex');
  }
  const pubkey = receipt?.signer?.pubkey;
  if (!/^[0-9a-f]{66}$/i.test(String(pubkey || ''))) {
    problems.push('signer pubkey is not a 66-char hex');
  }
  if (problems.length > 0) {
    return { ok: false, problems };
  }

  const payload = signingPayload({
    version: receipt.version,
    network: receipt.network,
    subjectKind: receipt.subject.kind,
    digest: receipt.subject.digest,
    issuedAt: receipt.issuedAt,
    nonce: receipt.nonce,
  });

  let signatureValid = false;
  let recovered = null;
  try {
    signatureValid = verifySignedMessage(payload, receipt.signature, pubkey);
    recovered = recoverPubkeyFromSignature(payload, receipt.signature);
  } catch (err) {
    return { ok: false, problems: [`signature check failed: ${err.message}`] };
  }

  const recoveredMatches = recovered && recovered.toLowerCase() === pubkey.toLowerCase();
  const ok = signatureValid && recoveredMatches;
  return {
    ok,
    signatureValid,
    recoveredMatches,
    recoveredPubkey: recovered,
    signer: receipt.signer,
    subject: receipt.subject,
    issuedAtIso: receipt.issuedAtIso,
    problems: ok ? [] : ['signature did not verify against signer pubkey'],
  };
}

// Confirm that a given text/hash matches a receipt's subject digest. Lets a
// holder prove the receipt covers the exact content they have in hand.
export function subjectMatches(receipt, input) {
  const { digest } = subjectDigest(input);
  return digest === receipt?.subject?.digest;
}
