# MSF Eastern Africa Donation Portal

A small full-stack donation portal: vanilla HTML/CSS/JS on the front end (Bootstrap 5 as a base layer, restyled with a custom design system), Node.js + Express on the back end.

## Framework choice

**Frontend: Bootstrap 5 (CDN) + vanilla ES6+ JavaScript, no build step.**
Why: Bootstrap's grid and form controls remove the need to hand-write layout CSS, restyled with a small set of custom tokens (stone background, ink text, MSF red reserved for the submit button and one accent) so it doesn't look like a generic Bootstrap page. No React/bundler because the brief asks for something simple to read and run — open `index.html` or `npm start`, nothing to compile.

**Backend: Node.js + Express, no database.**
Why: the brief specifies Node with no persistence layer. Express keeps the single `/api/donate` route, the rate limiter, and the validation/error-handling middleware in one small, readable file instead of pulling in a heavier framework for a single-endpoint API.

## Assumptions

- No real recurring billing exists. Choosing "recurring" runs the same one-time payment simulation as a single charge; there's no scheduler or background job that repeats it. "Set up recurring giving" on the success popup is a labeled placeholder for a future feature, not a working flow.
- Payment methods are simulated only (90% success rate each) — no real M-Pesa or card gateway is integrated. The M-Pesa phone number and card details are collected and format-validated for realism (and to demonstrate the flow), but are never sent to a real processor; the "Check your phone" STK prompt is a single confirmation step, not a real polling/webhook integration.
- The donation API is stateless and uses no database or persistence layer; rate limiting is an in-memory `Map` and resets if the server restarts.

## API design

One endpoint, `POST /api/donate`, `Content-Type: application/json`. Status codes carry real meaning rather than everything returning `200` with a `success` flag buried in the body:

| Status | When | Body |
|---|---|---|
| `200` | Donation accepted and the simulated payment succeeded | `{ success: true, transactionId, amount, method, type, frequency, mpesaPhone, cardNumber }` (phone/card values masked) |
| `400` | Validation failed, body wasn't JSON, or unexpected fields were sent | `{ success: false, errors: { field: "message" } }` or `{ success: false, message }` |
| `402` | Validation passed but the simulated payment was declined | `{ success: false, message }` (e.g. "Insufficient balance", "Declined by issuer") |
| `429` | Rate limit exceeded (10 requests/minute per IP) | `{ success: false, message: "Too many attempts, please wait a moment." }` |
| `500` | Unhandled server error | `{ success: false, message: "Something went wrong. Please try again." }` — no stack trace or internal detail leaked |

`402 Payment Required` is used deliberately for a declined payment rather than folding it into `400`, since a decline isn't a validation problem — the request was well-formed, the payment itself failed. The frontend (`api.js` / `app.js`) mirrors this: `submitDonation()` never throws for HTTP error codes, and `handleResponse()` branches on status (200 / 400 / 402 / 429 / other) to show the right inline error or SweetAlert2 popup for each case, rather than treating every non-200 response the same way.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` if you want to override `PORT` or `RATE_LIMIT_MAX`.
3. Start the server with `npm start`.
4. Open the port printed in the terminal. By default that is `http://localhost:3000`, but if `3000` is already busy the server will try the next few ports automatically.

## Security plan for production

- Integrate a real payment gateway (M-Pesa Daraja API, a card processor) instead of the simulators in `payments/`.
- Enforce HTTPS everywhere and set secure/HttpOnly cookies if sessions are ever introduced.
- Add CSRF protection for state-changing requests.
- Move rate limiting to Redis (or similar) so it works correctly across multiple server instances instead of an in-process `Map`.
- Add a proper input sanitization library and stricter payload size limits.
- Add dependency scanning (e.g. `npm audit` in CI, Snyk/Dependabot).
- Store secrets in a managed secrets system instead of `.env` files in production.
- Add structured logging, alerting, and an audit trail for donation attempts.

## Future improvements

- A real recurring billing flow with scheduling and mandate management.
- Server-side donation analytics and reporting.
- Automated tests (unit tests for `validation.js`/`amountLimits.js`, integration tests for `/api/donate`).
- Accessibility review pass and keyboard-navigation testing.
- Retry handling and richer receipt delivery (a real transactional email).
