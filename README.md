# Frani Signet

Signed proof-of-existence on Unicity testnet2. Send it text or a hash, get back a timestamped secp256k1 receipt that anyone can verify offline — no account, no trust in Frani Signet after the fact. The signature stands on its own.

Made by **CRYPTFRANI**. Owner / creator: **Itachi**.

---

## Track

Open.

## Is it Agentic?

No. Frani Signet is a deterministic tool: it hashes what you give it, signs the hash with its own wallet key, and hands back a receipt. There is no autonomous decision-making and no model in the loop.

## Runs on AstridOS?

No.

## Live on-network

- Network: **testnet2**
- Signer pubkey (this instance): `02e2af19926a77f1af664bcac9d6fbb3539cffa9379caff45c50175bec42692da3`
- Direct address: `DIRECT://00000dc0155f7b1a90991da0a406300f62acb0657e86c0ef2f83191ad58c5575943d7c3ef798`

A receipt is portable: verification only needs the receipt JSON, so a receipt issued by any instance verifies anywhere with `signet verify`.

## SDK features used

| Feature | Where |
| --- | --- |
| `sphere.signMessage()` | Signs the canonical receipt line with the wallet key |
| `verifySignedMessage()` | Offline verification of a receipt |
| `recoverPubkeyFromSignature()` | Confirms the signature recovers to the claimed signer |
| `sphere.communications` (DM) | `stamp` / `verify` / `certificate` over direct messages |
| `sphere.payments.requests.create()` | Payment request for the optional paid certificate |
| `payment_request:paid` event | Issues the certificate once payment settles |

## What makes it different

This is a signing primitive, not a ledger. It does not hold balances on anyone's behalf, does not stake, and does not pool funds. The only piece of state that matters lives inside each receipt — the signature — and that state travels with the holder. Lose the archive and every receipt you ever handed out still verifies.

The subject is never stored in the clear on-chain or in a shared place. Frani Signet hashes your text locally and signs the hash; if you pass a 64-hex value it is treated as your hash and signed as-is. You can prove later that a specific document matches a receipt without ever revealing the document to the service.

## How the paid certificate works

The free `stamp` command is the product. The optional "official certificate" is the same cryptographic receipt with an `official-certificate` label, gated behind a payment request.

- Earn-only. The only money Frani Signet ever sends is a refund of an over- or under-payment. It never initiates a payment.
- When you ask for a certificate, Frani Signet creates a payment request for the configured amount and waits. Nothing is signed until the request is paid.
- On `payment_request:paid`, the certificate receipt is issued and DM'd to you.
- Unconfirmed payments are never re-charged: the service reacts to settlement events, it does not re-send.

The paid path is disabled by default (`SIGNET_CERT_PRICE_UCT=0`). Turn it on only if you want it.

## Try it without a wallet

You can verify any receipt with zero setup — verification is pure math:

```bash
npm install
node bin/signet.js verify '<paste receipt json here>'
```

`ok: true` means the signature is valid and recovers to the signer named in the receipt.

## Commands

```
signet help                         Show the command list
signet about                        What this service is (and its signer key)
signet stamp <text | 64-hex hash>   Create and store a signed receipt
signet verify <json | @file.json>   Verify a receipt, exit 0 if valid
signet daemon                       Run the DM service (stamp/verify/certificate)
```

Over DM, the same verbs apply: `help`, `about`, `stamp <text>`, `verify <json>`, `certificate <text>`.

## Run it

```bash
# 1. install
npm install

# 2. copy config (all values default to testnet2)
cp .env.example .env

# 3a. one-shot: stamp something and print the receipt
node bin/signet.js stamp "my important note"

# 3b. verify a receipt
node bin/signet.js verify @receipts/<nonce>.json

# 4. run the DM daemon
node bin/signet.js daemon
```

### As a service

```bash
sudo cp systemd/frani-signet.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now frani-signet
journalctl -u frani-signet -f
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `SIGNET_NETWORK` | `testnet2` | Network. testnet2 only; other values are refused. |
| `SIGNET_DATA_DIR` | `./wallet-data` | Where the wallet keys/state live. |
| `SIGNET_WALLET_API` | `https://wallet-api.unicity.network` | testnet2 wallet-api. |
| `SIGNET_ORACLE_KEY` | public testnet2 key | Oracle key (not a secret on testnet2). |
| `SIGNET_DEVICE_ID` | `frani-signet-1` | Stable per-machine session id. |
| `SIGNET_NAMETAG` | _(empty)_ | Optional @nametag to register on first run. |
| `SIGNET_CERT_PRICE_UCT` | `0` | Paid certificate price in whole UCT. 0 disables it. |
| `SIGNET_RECEIPTS_DIR` | `./receipts` | Where issued receipts are archived. |

## Receipt shape

```json
{
  "version": "frani-signet/1",
  "network": "testnet2",
  "subject": { "kind": "text", "digest": "6ff149…ec95" },
  "issuedAt": 1789923178477,
  "issuedAtIso": "2026-09-20T16:52:58.477Z",
  "nonce": "efea18774da27929",
  "signer": { "pubkey": "02e2af…92da3" },
  "signature": "1faae5…56620",
  "issuer": "Frani Signet · CRYPTFRANI"
}
```

The signed string is the newline-joined tuple `version, network, subject.kind, digest, issuedAt, nonce`. Verification recomputes it and checks the signature against `signer.pubkey`.

## Structure

```
bin/signet.js      CLI + daemon entrypoint
src/config.js      env-driven config, testnet2 guard
src/wallet.js      Sphere SDK boundary (holds its own keys)
src/receipt.js     receipt build + verify (pure, offline)
src/store.js       JSON receipt archive
src/service.js     DM command handler
test/receipt.test.js  sign/verify unit tests
systemd/           service unit
```

## Tests

```bash
npm test
```

Six checks cover digesting, sign/verify round-trip, and tamper detection (subject and signer), using a throwaway keypair so no network is touched.

## Keys and safety

Frani Signet holds its own wallet under `wallet-data/`. It never asks anyone for a seed or private key. It runs on testnet2 only and refuses to start on another network unless explicitly overridden. `.env`, `wallet-data/`, and `receipts/` are gitignored.

---

MIT licensed. Not financial software; provided as-is.
