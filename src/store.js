// Frani Signet — receipt archive.
// Issued receipts are written as one JSON file per receipt, keyed by nonce, so
// the archive is human-inspectable and trivially portable. No database needed.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export class ReceiptStore {
  constructor(dir) {
    this.dir = dir;
  }

  async init() {
    if (!existsSync(this.dir)) {
      await mkdir(this.dir, { recursive: true });
    }
  }

  _file(nonce) {
    const safe = String(nonce).replace(/[^0-9a-zA-Z_-]/g, '');
    return path.join(this.dir, `${safe}.json`);
  }

  async save(receipt) {
    await this.init();
    await writeFile(this._file(receipt.nonce), JSON.stringify(receipt, null, 2), 'utf8');
    return this._file(receipt.nonce);
  }

  async get(nonce) {
    const file = this._file(nonce);
    if (!existsSync(file)) return null;
    return JSON.parse(await readFile(file, 'utf8'));
  }

  async list() {
    if (!existsSync(this.dir)) return [];
    const names = (await readdir(this.dir)).filter((n) => n.endsWith('.json'));
    const out = [];
    for (const name of names) {
      try {
        const r = JSON.parse(await readFile(path.join(this.dir, name), 'utf8'));
        out.push(r);
      } catch {
        // Skip anything that is not a well-formed receipt.
      }
    }
    out.sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0));
    return out;
  }
}
