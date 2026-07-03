// This section is the whole backend: Express setup, validation, rate limiting, and
// the one route.
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { process as processPayment } from "./payments/index.js";
import { validateName, validateEmail, validateAmount, validateFrequency, validateTerms, validateMpesaPhone, validateCardFields } from "./public/js/validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const publicDir = path.join(__dirname, "public");

const START_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_ATTEMPTS = 10;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MPESA_LIMIT = 250000;
const allowedKeys = ["name", "email", "amount", "method", "type", "frequency", "acceptTerms", "mpesaPhone", "cardNumber", "cardExpiry", "cardCvv"];

const rateLimitStore = new Map();

app.use(express.static(publicDir));

// this section handles serving the donation page.
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// this section handles rejecting requests that are not JSON.
const requireJson = (req, res, next) => {
  if (!req.is("application/json")) {
    res.status(400).json({ success: false, message: "Request body must be JSON." });
    return;
  }
  next();
};

// this section handles limiting each IP to 10 donation attempts per minute.
const enforceRateLimit = (req, res, next) => {
  const key = req.ip;
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (current.count >= RATE_LIMIT_MAX) {
    res.status(429).json({ success: false, message: "Too many attempts, please wait a moment." });
    return;
  }

  current.count += 1;
  next();
};

// this section handles validating the payment method field.
const validateMethod = (value) => {
  if (!["mpesa", "card"].includes(value)) {
    return { ok: false, message: "Choose a valid payment method." };
  }
  return { ok: true };
};

// this section handles validating the donation type field.
const validateType = (value) => {
  if (!["one-time", "recurring"].includes(value)) {
    return { ok: false, message: "Choose a valid donation type." };
  }
  return { ok: true };
};

// this section handles rejecting request bodies with unexpected fields.
const getUnexpectedKeys = (body) => Object.keys(body || {}).filter((key) => !allowedKeys.includes(key));

// this section handles collecting every field-level validation error for a donation.
const collectDonationErrors = (body) => {
  const errors = {};
  const checks = {
    name: validateName(body.name),
    email: validateEmail(body.email),
    amount: validateAmount(body.amount),
    method: validateMethod(body.method),
    type: validateType(body.type),
    frequency: validateFrequency(body.type, body.frequency),
    acceptTerms: validateTerms(body.acceptTerms)
  };

  if (body.method === "mpesa") {
    checks.mpesaPhone = validateMpesaPhone(body.mpesaPhone);
  } else if (body.method === "card") {
    checks.card = validateCardFields({ cardNumber: body.cardNumber, cardExpiry: body.cardExpiry, cardCvv: body.cardCvv });
  }

  Object.entries(checks).forEach(([field, result]) => {
    if (!result.ok) {
      errors[field] = result.message;
    }
  });

  if (body.method === "mpesa" && Number(body.amount) > MPESA_LIMIT) {
    errors.amount = `M-Pesa transactions cannot exceed KES ${MPESA_LIMIT.toLocaleString()}.`;
  }

  return errors;
};

// this section handles the donation endpoint: validate, simulate payment, respond.
const handleDonate = (req, res, next) => {
  try {
    const body = req.body;
    const unexpectedKeys = getUnexpectedKeys(body);

    if (unexpectedKeys.length > 0) {
      res.status(400).json({ success: false, message: "Unexpected fields were provided." });
      return;
    }

    const errors = collectDonationErrors(body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ success: false, errors });
      return;
    }

    const amount = Number(body.amount);
    const frequency = body.type === "recurring" ? body.frequency : null;
    const result = processPayment(body.method, amount);

    if (!result.success) {
      res.status(402).json({ success: false, message: result.message });
      return;
    }

    res.status(200).json({
      success: true,
      transactionId: result.transactionId,
      amount,
      method: body.method,
      type: body.type,
      frequency,
      mpesaPhone: body.method === "mpesa" ? `***${String(body.mpesaPhone).replace(/\D/g, "").slice(-3)}` : null,
      cardNumber: body.method === "card" ? `**** **** **** ${String(body.cardNumber).replace(/\s+/g, "").slice(-4)}` : null
    });
  } catch (error) {
    next(error);
  }
};

app.post("/api/donate", enforceRateLimit, requireJson, express.json(), handleDonate);

// this section handles unexpected server errors without leaking internals to the client.
app.use((error, req, res, next) => {
  if (error?.type === "entity.parse.failed" || error instanceof SyntaxError) {
    res.status(400).json({ success: false, message: "Request body must be valid JSON." });
    return;
  }

  console.error(error);
  res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
});

export default app;

const waitForListen = (server) => new Promise((resolve, reject) => {
  const cleanup = () => {
    server.off("listening", onListening);
    server.off("error", onError);
  };

  const onListening = () => {
    cleanup();
    resolve();
  };

  const onError = (error) => {
    cleanup();
    reject(error);
  };

  server.once("listening", onListening);
  server.once("error", onError);
});

// this section handles starting the HTTP server.
export const startServer = async () => {
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset += 1) {
    const port = START_PORT + offset;
    const server = app.listen(port);

    try {
      await waitForListen(server);
      console.log(`Donation portal listening on port ${port}`);
      return server;
    } catch (error) {
      if (error?.code !== "EADDRINUSE") {
        throw error;
      }
      console.warn(`Port ${port} is already in use, trying ${port + 1}...`);
    }
  }

  throw new Error(`Unable to start the server. Ports ${START_PORT}-${START_PORT + MAX_PORT_ATTEMPTS - 1} are already in use.`);
};

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMainModule) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
