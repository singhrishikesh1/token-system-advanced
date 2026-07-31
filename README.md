# Token System — Advanced (v2)

A 5-layer token chain instead of a single token. Every layer gets checked
**together** before a transaction is allowed to complete. Runs on port
**5000** by default (v1 uses 4000) so you can run both side by side.

## The chain

```
LOGIN
  └─> Session Token   (3h hard limit, JWT rotates every 15.5 min)
        └─> Tab Token       (new one every time a new tab opens)
              └─> Page Token     (new one on EVERY page navigation, 90s life)
                    └─> Action Token  (new one per sensitive instruction, 20s life)
                          └─> Nonce       (one-time use, consumed at confirm)
```

Every layer is stored in Redis with its own TTL. To pass `/transaction/confirm`,
**all five** must be valid and match what's currently stored — not just the
session. This is what "checking tokens together" actually means in practice:
a stolen page token from 2 minutes ago is useless without a valid tab token,
session token, fresh action token, and unused nonce all matching at once.

Why the layers are short-lived on purpose: the smaller the window a token is
valid for, the less time an attacker has to capture and replay it. Page (90s)
and action (20s) tokens are intentionally tight — they're meant to be
regenerated constantly during normal use, not held onto.

## 1. Setup

```bash
cd token-system-advanced
npm install
cp .env.example .env
```

Make sure Redis is running (same instance v1 uses is fine — keys are
namespaced differently: `tab:`, `page:`, `action:` vs v1's `session:`, `page:`).

```bash
npm run dev
```

## 2. Full test flow (curl)

```bash
# 1. Login - get session + first tab + first page token, all at once
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" -d '{"userId":"user123"}'
# -> save sessionId, sessionToken, tabId, tabToken, pageToken

# 2. (Optional) Navigate to a new page - get a fresh page token
curl -X POST http://localhost:5000/page/new \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<id>","sessionToken":"<tok>","tabId":"<tabId>","tabToken":"<tabTok>","pageName":"checkout"}'

# 3. Right before the sensitive action (e.g. clicking "Pay Now")
curl -X POST http://localhost:5000/action/new \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<id>","sessionToken":"<tok>","tabId":"<tabId>","tabToken":"<tabTok>","pageToken":"<pageTok>","actionName":"pay_now_click"}'

# 4. Get a one-time transaction nonce
curl http://localhost:5000/transaction/nonce

# 5. Confirm - checks all 5 layers together
curl -X POST http://localhost:5000/transaction/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId":"<id>","sessionToken":"<tok>",
    "tabId":"<tabId>","tabToken":"<tabTok>",
    "pageToken":"<pageTok>","actionToken":"<actionTok>",
    "nonce":"<nonce>","amount":500
  }'
```

Do step 3 twice in a row before confirming (simulating an old, reused action
token) — the second confirm attempt will fail with "action token mismatch."

## 3. New tab handling (frontend note)

When the user opens a new tab, call `POST /tab/new` with their existing
`sessionId` + `sessionToken`. Store the returned `tabId` in **`sessionStorage`**,
not `localStorage` — `sessionStorage` is automatically scoped to a single
browser tab and disappears when that tab closes, which is exactly the
behavior a tab-bound token should have. `sessionToken` itself can stay in an
HttpOnly cookie shared across tabs, since the session layer is intentionally
tab-independent.

## 4. Why generation is faster than v1

v1 used the `uuid` package (`uuidv4()`) for every token. v2 uses Node's
built-in `crypto.randomBytes()` directly — same cryptographic strength, but
no external formatting/parsing layer, and one less dependency to install.
Combined with shorter TTLs across the board, tokens are both quicker to
generate and quicker to expire.

## 5. Integrating later

Same pattern as v1: copy `routes/`, `middleware/`, `utils/` into your main
backend, mount the five routers, point `REDIS_URL` at your shared Redis
instance, swap the hardcoded `userId` for your real authenticated user.
