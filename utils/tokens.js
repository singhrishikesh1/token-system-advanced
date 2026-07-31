const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// --- Fast opaque token generator ---
// crypto.randomBytes is synchronous, native, and noticeably faster than
// pulling in the uuid package for this - no formatting overhead, just raw
// cryptographically-secure bytes turned into hex. This is what gets called
// on EVERY page load / action / tab open, so speed here matters.
function fastToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function signSessionJWT(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '20m' });
}

function verifySessionJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// --- Redis key naming conventions - one clear map, used everywhere ---
const keys = {
  session: (sessionId) => `session:${sessionId}`,
  tab: (sessionId, tabId) => `tab:${sessionId}:${tabId}`,
  page: (sessionId, tabId) => `page:${sessionId}:${tabId}`,
  action: (sessionId, tabId) => `action:${sessionId}:${tabId}`,
  nonce: (nonce) => `nonce:${nonce}`,
};

module.exports = {
  fastToken,
  signSessionJWT,
  verifySessionJWT,
  keys,
};
