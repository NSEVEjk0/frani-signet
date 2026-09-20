// Frani Signet — receipt unit tests.
// Uses a throwaway secp256k1 keypair from the SDK so the sign/verify path is
// exercised end-to-end without touching the network.

import assert from 'node:assert/strict';
import {
  createKeyPair,
  signMessage,
  getPublicKey,
  randomHex,
} from '@unicitylabs/sphere-sdk';
import { createReceipt, verifyReceipt, subjectDigest, subjectMatches } from '../src/receipt.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const kp = createKeyPair(randomHex(32));
const priv = kp.privateKey;
const pub = kp.publicKey || getPublicKey(priv);
const sign = (m) => signMessage(priv, m);

test('subjectDigest hashes text', () => {
  const d = subjectDigest('hello world');
  assert.equal(d.kind, 'text');
  assert.match(d.digest, /^[0-9a-f]{64}$/);
});

test('subjectDigest passes through a 64-hex hash', () => {
  const h = 'a'.repeat(64);
  const d = subjectDigest(h);
  assert.equal(d.kind, 'hash');
  assert.equal(d.digest, h);
});

test('created receipt verifies', () => {
  const r = createReceipt({ subject: 'proof me', network: 'testnet2', sign, signerPubkey: pub });
  const v = verifyReceipt(r);
  assert.equal(v.ok, true);
  assert.equal(v.signatureValid, true);
  assert.equal(v.recoveredMatches, true);
});

test('tampered subject fails verification', () => {
  const r = createReceipt({ subject: 'original', network: 'testnet2', sign, signerPubkey: pub });
  r.subject.digest = 'b'.repeat(64);
  const v = verifyReceipt(r);
  assert.equal(v.ok, false);
});

test('tampered signer fails verification', () => {
  const r = createReceipt({ subject: 'original', network: 'testnet2', sign, signerPubkey: pub });
  const other = createKeyPair(randomHex(32));
  r.signer.pubkey = other.publicKey || getPublicKey(other.privateKey);
  const v = verifyReceipt(r);
  assert.equal(v.ok, false);
});

test('subjectMatches confirms original content', () => {
  const r = createReceipt({ subject: 'the exact content', network: 'testnet2', sign, signerPubkey: pub });
  assert.equal(subjectMatches(r, 'the exact content'), true);
  assert.equal(subjectMatches(r, 'different content'), false);
});

console.log(`\n${passed} checks passed.`);
