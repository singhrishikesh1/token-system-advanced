const express = require('express');
const redis = require('../utils/redisClient');
const { keys, fastToken } = require('../utils/tokens');
const { verifySessionLayer, verifyTabLayer, verifyPageLayer } = require('../middleware/verifyChain');

const router = express.Router();

const ACTION_TTL = parseInt(process.env.ACTION_TOKEN_TTL_SECONDS || '20', 10);

// POST /action/new
// Call this right before any sensitive instruction - e.g. the moment the user
// clicks "Pay Now", "Confirm Transfer", "Change Password", etc. Deliberately
// very short-lived (default 20s) so there's almost no window for reuse.
router.post('/new', async (req, res) => {
  const { sessionId, sessionToken, tabId, tabToken, pageToken, actionName } = req.body;
  if (!sessionId || !sessionToken || !tabId || !tabToken || !pageToken) {
    return res.status(400).json({ error: 'sessionId, sessionToken, tabId, tabToken, pageToken required' });
  }

  const sessionCheck = await verifySessionLayer(sessionId, sessionToken);
  if (!sessionCheck.ok) return res.status(401).json(sessionCheck);

  const tabCheck = await verifyTabLayer(sessionId, tabId, tabToken);
  if (!tabCheck.ok) return res.status(401).json(tabCheck);

  const pageCheck = await verifyPageLayer(sessionId, tabId, pageToken);
  if (!pageCheck.ok) return res.status(401).json(pageCheck);

  const actionToken = fastToken();
  await redis.set(
    keys.action(sessionId, tabId),
    JSON.stringify({ actionToken, actionName: actionName || 'unnamed', issuedAt: Date.now() }),
    'EX', ACTION_TTL
  );

  res.json({ message: `action token issued for: ${actionName || 'unnamed'}`, actionToken, expiresInSeconds: ACTION_TTL });
});

module.exports = router;
