const express = require('express');
const redis = require('../utils/redisClient');
const { keys, fastToken, signSessionJWT, verifySessionJWT } = require('../utils/tokens');

const router = express.Router();

const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS || '10800', 10);
const TAB_TTL = parseInt(process.env.TAB_TOKEN_TTL_SECONDS || '1800', 10);
const PAGE_TTL = parseInt(process.env.PAGE_TOKEN_TTL_SECONDS || '90', 10);

// POST /auth/login
// Runs after your real credential/FIDO2 check succeeds.
// Issues the FULL starting chain immediately: session token + first tab token
// + first page token - client doesn't have to make three separate calls
// before it's ready to use the app.
router.post('/login', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const sessionId = fastToken(12);
  const tabId = fastToken(8);
  const createdAt = Date.now();

  const sessionToken = signSessionJWT({ sessionId, userId });
  const tabToken = fastToken();
  const pageToken = fastToken();

  await Promise.all([
    redis.set(
      keys.session(sessionId),
      JSON.stringify({ userId, createdAt, sessionToken }),
      'EX', SESSION_TTL
    ),
    redis.set(
      keys.tab(sessionId, tabId),
      JSON.stringify({ tabToken, createdAt }),
      'EX', TAB_TTL
    ),
    redis.set(
      keys.page(sessionId, tabId),
      JSON.stringify({ pageToken, pageName: 'initial', issuedAt: Date.now() }),
      'EX', PAGE_TTL
    ),
  ]);

  res.cookie('sessionToken', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: SESSION_TTL * 1000,
  });

  res.json({
    message: 'login successful - full token chain issued',
    sessionId,
    sessionToken,
    tabId,
    tabToken,
    pageToken,
    expiresInSeconds: {
      session: SESSION_TTL,
      tab: TAB_TTL,
      page: PAGE_TTL,
    },
  });
});

// POST /auth/refresh - client calls every 15.5 min
// Rotates the JWT but the 3h session clock keeps counting down, never resets.
router.post('/refresh', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const raw = await redis.get(keys.session(sessionId));
  if (!raw) {
    return res.status(401).json({ error: 'session expired or not found, please log in again', action: 'redirect_to_login' });
  }

  const record = JSON.parse(raw);
  const elapsedSeconds = Math.floor((Date.now() - record.createdAt) / 1000);
  const remainingSeconds = SESSION_TTL - elapsedSeconds;

  if (remainingSeconds <= 0) {
    await redis.del(keys.session(sessionId));
    return res.status(401).json({ error: 'session hard limit (3h) reached, please log in again', action: 'redirect_to_login' });
  }

  const newSessionToken = signSessionJWT({ sessionId, userId: record.userId });
  record.sessionToken = newSessionToken;

  await redis.set(keys.session(sessionId), JSON.stringify(record), 'EX', remainingSeconds);

  res.cookie('sessionToken', newSessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: remainingSeconds * 1000,
  });

  res.json({ message: 'session refreshed', sessionToken: newSessionToken, remainingSeconds });
});

router.post('/logout', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  await redis.del(keys.session(sessionId));
  res.clearCookie('sessionToken');
  res.json({ message: 'logged out, session revoked' });
});

module.exports = router;
