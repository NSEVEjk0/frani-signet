// Frani Signet — single-attempt, double-pay-safe refund.
// Refunds are the only outbound payment (earn-only). Never re-send on a
// possibly-committed outcome; the SDK converges the original transfer.

import { isPossiblyCommittedSendOutcome, PartialSendConflictError } from '@unicitylabs/sphere-sdk';

export async function refundOnce(sphere, { recipient, amountBase, coinId, memo }) {
  if (BigInt(amountBase) <= 0n) {
    return { ok: false, status: 'skipped', reason: 'non-positive refund amount' };
  }
  try {
    const result = await sphere.payments.send({
      recipient,
      amount: amountBase,
      coinId,
      memo: memo || 'Frani Split refund',
    });
    return {
      ok: true,
      status: result.deliveryPending ? 'sent-delivery-pending' : 'sent',
      transferId: result.id,
    };
  } catch (err) {
    if (err instanceof PartialSendConflictError) {
      return {
        ok: false,
        status: 'partial',
        transferId: err.transferId,
        remainingAmount: err.remainingAmount,
        reason: 'partial refund; remainder left unsent to avoid double-pay',
      };
    }
    if (isPossiblyCommittedSendOutcome(err)) {
      return {
        ok: false,
        status: 'possibly-committed',
        transferId: err.transferId,
        reason: 'refund may have committed; not re-sending (SDK resumes it)',
      };
    }
    return { ok: false, status: 'failed', reason: err.message };
  }
}
