import { Router } from 'express';
import { getBids, getRfq } from '../rfq/registry';

const router = Router();

// POST /rfq/accept -> MVP stub
router.post('/accept', async (req, res) => {
  const { rfqId, bidId, requestId, maker, txHashOfSubmit } = req.body || {};
  if (!rfqId || !bidId || !requestId || !maker) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }
  // TODO: simulate and relay raw signed tx matching the bid (Phase 2)
  res.json({
    status: 'accepted',
    relayTxHash: null,
    rfqId,
    bidId,
    requestId,
    txHashOfSubmit,
  });
});

// GET /rfq/:rfqId -> return top-of-book and bids
router.get('/:rfqId', (req, res) => {
  const rfqId = req.params.rfqId;
  const rec = getRfq(rfqId);
  if (!rec) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const bids = getBids(rfqId);
  res.json({ rfqId, rfq: rec.rfq, bids });
});

export { router };
