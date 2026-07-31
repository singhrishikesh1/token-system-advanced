const express = require('express');
const redis = require('../utils/redisClient');
const { keys, fastToken } = require('../utils/tokens');
const { verifySessionLayer } = require('../middleware/verifyChain');

const router = express.Router();

const TAB_TTL = parseInt(process.env.TAB_TOKEN_TTL_SECONDS || '1800', 10);

// POST /tab/new
// Call this once when a new browser tab is opened for an already-logged-in session.
// Client should store the returned tabId in sessionStorage (NOT localStorage) -
// sessionStorage is automatically scoped to a single tab and clears when that
// tab closes, which mirrors exactly how this token should behave.
router.post('/new', async (req, res) => {
  const { sessionId, sessionToken } = req.body;
  if (!sessionId || !sessionToken) {
    return res.status(400).json({ error: 'sessionId and sessionToken required' });
  }

  const check = await verifySessionLayer(sessionId, sessionToken);
  if (!check.ok) return res.status(401).json(check);

  const tabId = fastToken(8);
  const tabToken = fastToken();

  await redis.set(
    keys.tab(sessionId, tabId),
    JSON.stringify({ tabToken, createdAt: Date.now() }),
    'EX', TAB_TTL
  );

  res.json({ message: 'new tab token issued', tabId, tabToken, expiresInSeconds: TAB_TTL });
});

module.exports = router;
