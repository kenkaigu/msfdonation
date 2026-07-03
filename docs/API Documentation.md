# API Documentation

Donation API for the MSF Eastern Africa Donation Portal. One endpoint, stateless, no database — every response is generated in-request.

## Base URL

```
http://localhost:3000
```

(`PORT` is configurable via `.env`; if 3000 is busy the server automatically tries the next few ports and prints the actual one on startup.)

---

## POST /api/donate

Submits a donation and returns a simulated payment result.

**Headers**

```
Content-Type: application/json
```

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | always | 2–100 chars, letters/spaces/hyphens only |
| `email` | string | always | standard email format |
| `amount` | number | always | 1–1,000,000; if `method` is `"mpesa"`, also capped at 250,000 |
| `method` | string | always | `"mpesa"` or `"card"` |
| `type` | string | always | `"one-time"` or `"recurring"` |
| `frequency` | string \| null | if `type` is `"recurring"` | one of `monthly`, `quarterly`, `biannual`, `yearly`; otherwise `null` |
| `acceptTerms` | boolean | always | must be `true` |
| `mpesaPhone` | string | if `method` is `"mpesa"` | Safaricom number, e.g. `0712345678` (`+254`/`254` prefixes accepted and normalized) |
| `cardNumber` | string | if `method` is `"card"` | 16 digits (spaces allowed) |
| `cardExpiry` | string | if `method` is `"card"` | `MM/YY`, must not be in the past |
| `cardCvv` | string | if `method` is `"card"` | 3 digits |

Any field not in this list causes the whole request to be rejected — the body is whitelisted, not just filtered.

### Responses

**`200 OK`** — donation accepted, simulated payment succeeded (~90% of attempts)

```json
{
  "success": true,
  "transactionId": "MPESA1783080900756",
  "amount": 1000,
  "method": "mpesa",
  "type": "one-time",
  "frequency": null,
  "mpesaPhone": "***678",
  "cardNumber": null
}
```

Phone and card values are always masked in the response, regardless of how they were sent.

**`400 Bad Request`** — validation failed, body wasn't JSON, or unexpected fields were present

```json
{
  "success": false,
  "errors": {
    "email": "Enter a valid email address.",
    "acceptTerms": "You must agree to the terms to continue."
  }
}
```

or, for structural problems (not JSON, malformed JSON, unexpected keys):

```json
{ "success": false, "message": "Request body must be JSON." }
```

**`402 Payment Required`** — request was valid, but the simulated payment was declined (~10% of attempts)

```json
{ "success": false, "message": "Insufficient balance" }
```

M-Pesa declines with `"Insufficient balance"`, Card declines with `"Declined by issuer"`.

**`429 Too Many Requests`** — more than 10 requests from the same IP within a rolling 60-second window

```json
{ "success": false, "message": "Too many attempts, please wait a moment." }
```

**`500 Internal Server Error`** — anything unhandled; no stack trace or internal detail is ever included in the response

```json
{ "success": false, "message": "Something went wrong. Please try again." }
```

---

## Validation rules reference

The same rules run on the client (`public/js/validation.js`, for instant feedback) and the server (`server.js`, the actual source of truth) — the client is UX only, nothing is trusted without the server re-checking it.

| Field | Rule |
|---|---|
| `name` | required, trimmed, 2–100 characters, letters/spaces/hyphens only |
| `email` | required, must match `^[^\s@]+@[^\s@]+\.[^\s@]+$` |
| `amount` | required, numeric, up to 2 decimal places, 1 ≤ amount ≤ 1,000,000 |
| `amount` (M-Pesa only) | must also be ≤ 250,000 |
| `frequency` | required only when `type` is `"recurring"`; one of `monthly`/`quarterly`/`biannual`/`yearly` |
| `acceptTerms` | must be exactly `true` |
| `mpesaPhone` | required only when `method` is `"mpesa"`; normalized to `0XXXXXXXXX`, must start with `07` or `01` |
| `cardNumber`, `cardExpiry`, `cardCvv` | required only when `method` is `"card"`; 16-digit number, `MM/YY` not in the past, 3-digit CVV — checked together as one result |

---

## Testing

All examples assume the server is running on port 3000 — adjust if yours started on a different port. Payment success/failure is randomized (~90%/10%), so a couple of retries may be needed to see a `402`.

**Successful one-time M-Pesa donation**

```bash
curl -s -X POST http://localhost:3000/api/donate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Wanjiru",
    "email": "jane@example.com",
    "amount": 1000,
    "method": "mpesa",
    "type": "one-time",
    "frequency": null,
    "acceptTerms": true,
    "mpesaPhone": "0712345678"
  }'
```

**Successful recurring Card donation**

```bash
curl -s -X POST http://localhost:3000/api/donate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "amount": 2500,
    "method": "card",
    "type": "recurring",
    "frequency": "monthly",
    "acceptTerms": true,
    "cardNumber": "4242424242424242",
    "cardExpiry": "12/30",
    "cardCvv": "123"
  }'
```

Expect: `200`, response includes a `transactionId` starting with `MPESA` or `CARD`, and masked `mpesaPhone`/`cardNumber`.

**Validation failure — missing/invalid fields**

```bash
curl -s -X POST http://localhost:3000/api/donate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "J",
    "email": "not-an-email",
    "amount": 0,
    "method": "mpesa",
    "type": "one-time",
    "acceptTerms": false
  }'
```

Expect: `400` with an `errors` object listing every invalid field at once (including the missing `mpesaPhone`).

**M-Pesa amount over the 250,000 limit**

```bash
curl -s -X POST http://localhost:3000/api/donate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Wanjiru",
    "email": "jane@example.com",
    "amount": 300000,
    "method": "mpesa",
    "type": "one-time",
    "acceptTerms": true,
    "mpesaPhone": "0712345678"
  }'
```

Expect: `400`, `errors.amount` explains the M-Pesa cap.

**Unexpected field in the body**

```bash
curl -s -X POST http://localhost:3000/api/donate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Wanjiru",
    "email": "jane@example.com",
    "amount": 1000,
    "method": "mpesa",
    "type": "one-time",
    "acceptTerms": true,
    "mpesaPhone": "0712345678",
    "isAdmin": true
  }'
```

Expect: `400`, `"Unexpected fields were provided."` — the extra `isAdmin` key alone fails the whole request.

**Wrong Content-Type**

```bash
curl -s -X POST http://localhost:3000/api/donate \
  -H "Content-Type: text/plain" \
  -d '{"name":"Jane Wanjiru"}'
```

Expect: `400`, `"Request body must be JSON."`

**Malformed JSON**

```bash
curl -s -X POST http://localhost:3000/api/donate \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Wanjiru",'
```

Expect: `400`, `"Request body must be valid JSON."`

**Rate limit (429)**

The limiter counts every request that reaches `/api/donate` — including ones that fail validation — not just successful donations, so it can't be bypassed by sending deliberately invalid requests. Fire more than 10 requests from the same machine within a minute (on a freshly started server, so the counter is at zero) and the 11th onward returns `429` until the rolling window resets:

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/donate \
    -H "Content-Type: application/json" \
    -d '{"name":"Jane Wanjiru","email":"jane@example.com","amount":1000,"method":"mpesa","type":"one-time","acceptTerms":true,"mpesaPhone":"0712345678"}'
done
```

Expect: the first 10 print `200`/`402` (payment simulation), the 11th and 12th print `429`.
