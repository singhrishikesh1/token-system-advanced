const express = require('express');
const redis = require('../utils/redisClient');
const { keys, fastToken } = require('../utils/tokens');
const { verifySessionLayer, verifyTabLayer } = require('../middleware/verifyChain');

const router = express.Router();

const PAGE_TTL = parseInt(process.env.PAGE_TOKEN_TTL_SECONDS || '90', 10);

// POST /page/new
// Call this on EVERY page navigation inside a tab. Overwrites the previous
// page token for this (session, tab) pair - the old one stops working the
// instant this runs, no separate cleanup needed.
router.post('/new', async (req, res) => {
  const { sessionId, sessionToken, tabId, tabToken, pageName } = req.body;
  if (!sessionId || !sessionToken || !tabId || !tabToken) {
    return res.status(400).json({ error: 'sessionId, sessionToken, tabId, tabToken required' });
  }

  const sessionCheck = await verifySessionLayer(sessionId, sessionToken);
  if (!sessionCheck.ok) return res.status(401).json(sessionCheck);

  const tabCheck = await verifyTabLayer(sessionId, tabId, tabToken);
  if (!tabCheck.ok) return res.status(401).json(tabCheck);

  const pageToken = fastToken();
  await redis.set(
    keys.page(sessionId, tabId),
    JSON.stringify({ pageToken, pageName: pageName || 'unnamed', issuedAt: Date.now() }),
    'EX', PAGE_TTL
  );

  res.json({ message: `page token issued for: ${pageName || 'unnamed'}`, pageToken, expiresInSeconds: PAGE_TTL });
});

module.exports = router;
