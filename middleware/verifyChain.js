const redis = require('../utils/redisClient');
const { keys, verifySessionJWT } = require('../utils/tokens');

async function verifySessionLayer(sessionId, sessionToken) {
  const decoded = verifySessionJWT(sessionToken);
  if (!decoded || decoded.sessionId !== sessionId) {
    return { ok: false, error: 'session token invalid', action: 'redirect_to_login' };
  }
  const raw = await redis.get(keys.session(sessionId));
  if (!raw) {
    return { ok: false, error: 'session expired (3h limit or logged out)', action: 'redirect_to_login' };
  }
  return { ok: true, session: JSON.parse(raw) };
}

async function verifyTabLayer(sessionId, tabId, tabToken) {
  const raw = await redis.get(keys.tab(sessionId, tabId));
  if (!raw) {
    return { ok: false, error: 'tab token expired', action: 'redirect_to_new_tab' };
  }
  const record = JSON.parse(raw);
  if (record.tabToken !== tabToken) {
    return { ok: false, error: 'tab token mismatch - possible tampering', action: 'redirect_to_login' };
  }
  return { ok: true };
}

async function verifyPageLayer(sessionId, tabId, pageToken) {
  const raw = await redis.get(keys.page(sessionId, tabId));
  if (!raw) {
    return { ok: false, error: 'page token expired', action: 'redirect_to_page' };
  }
  const record = JSON.parse(raw);
  if (record.pageToken !== pageToken) {
    return { ok: false, error: 'page token mismatch - possible replay attack', action: 'redirect_to_page' };
  }
  return { ok: true };
}

async function verifyActionLayer(sessionId, tabId, actionToken) {
  const raw = await redis.get(keys.action(sessionId, tabId));
  if (!raw) {
    return { ok: false, error: 'action token expired - action window (20s) closed', action: 'retry_action' };
  }
  const record = JSON.parse(raw);
  if (record.actionToken !== actionToken) {
    return { ok: false, error: 'action token mismatch - possible replay attack', action: 'retry_action' };
  }
  return { ok: true };
}

async function verifyNonceLayer(nonce) {
  const state = await redis.get(keys.nonce(nonce));
  if (state !== 'unused') {
    return { ok: false, error: 'transaction nonce invalid or already used', action: 'redirect_to_payment' };
  }
  return { ok: true };
}

module.exports = {
  verifySessionLayer,
  verifyTabLayer,
  verifyPageLayer,
  verifyActionLayer,
  verifyNonceLayer,
};
