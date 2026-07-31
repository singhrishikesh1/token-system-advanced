const express = require('express');
const redis = require('../utils/redisClient');
const { keys, fastToken } = require('../utils/tokens');
const {
  verifySessionLayer,
  verifyTabLayer,
  verifyPageLayer,
  verifyActionLayer,
  verifyNonceLayer,
} = require('../middleware/verifyChain');

const router = express.Router();

const NONCE_TTL = parseInt(process.env.TRANSACTION_NONCE_TTL_SECONDS || '60', 10);

// GET /transaction/nonce
// Frontend calls this the moment the user opens the final "confirm payment" screen.
router.get('/nonce', async (req, res) => {
  const nonce = fastToken();
  await redis.set(keys.nonce(nonce), 'unused', 'EX', NONCE_TTL);
  res.json({ nonce, expiresInSeconds: NONCE_TTL });
});

// POST /transaction/confirm
// THE checkpoint. Every layer of the chain gets checked, in order, together.
// A single mismatch anywhere -> reject immediately, no transaction, tell the
// client exactly where to redirect the user.
router.post('/confirm', async (req, res) => {
  const {
    sessionId, sessionToken,
    tabId, tabToken,
    pageToken,
    actionToken,
    nonce,
    amount,
  } = req.body;

  const missing = ['sessionId', 'sessionToken', 'tabId', 'tabToken', 'pageToken', 'actionToken', 'nonce']
    .filter((field) => !req.body[field]);
  if (missing.length) {
    return res.status(400).json({ error: `missing fields: ${missing.join(', ')}`, action: 'redirect_to_login' });
  }

  // Layer 1: Session
  const sessionCheck = await verifySessionLayer(sessionId, sessionToken);
  if (!sessionCheck.ok) return res.status(401).json(sessionCheck);

  // Layer 2: Tab
  const tabCheck = await verifyTabLayer(sessionId, tabId, tabToken);
  if (!tabCheck.ok) return res.status(401).json(tabCheck);

  // Layer 3: Page
  const pageCheck = await verifyPageLayer(sessionId, tabId, pageToken);
  if (!pageCheck.ok) return res.status(401).json(pageCheck);

  // Layer 4: Action/instruction
  const actionCheck = await verifyActionLayer(sessionId, tabId, actionToken);
  if (!actionCheck.ok) return res.status(401).json(actionCheck);

  // Layer 5: One-time transaction nonce
  const nonceCheck = await verifyNonceLayer(nonce);
  if (!nonceCheck.ok) return res.status(401).json(nonceCheck);

  // All 5 layers agree - consume the nonce AND the action token immediately
  // so neither can ever be replayed, even if this exact request is captured.
  await Promise.all([
    redis.del(keys.nonce(nonce)),
    redis.del(keys.action(sessionId, tabId)),
  ]);

  // ---- Your real transaction logic goes here ----
  // debit account / call payment gateway / write to transactions DB, etc.

  res.json({
    message: 'transaction approved - full chain verified',
    userId: sessionCheck.session.userId,
    amount,
    status: 'success',
  });
});

module.exports = router;
