import { process as processPayment } from "../payments/index.js";
import {
  validateAmount,
  validateCardFields,
  validateEmail,
  validateFrequency,
  validateMpesaPhone,
  validateName,
  validateTerms
} from "../public/js/validation.js";

const allowedKeys = [
  "name",
  "email",
  "amount",
  "method",
  "type",
  "frequency",
  "acceptTerms",
  "mpesaPhone",
  "cardNumber",
  "cardExpiry",
  "cardCvv"
];

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 10;
const MPESA_LIMIT = 250000;
const rateLimitStore = new Map();

// this section handles reading and parsing JSON from the request body.
const readJsonBody = async (req) => {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
};

// this section handles checking whether the body is a plain object.
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// this section handles validating the payment method.
const validateMethod = (value) => {
  if (!["mpesa", "card"].includes(value)) {
    return { ok: false, message: "Choose a valid payment method." };
  }

  return { ok: true };
};

// this section handles validating the donation type.
const validateType = (value) => {
  if (!["one-time", "recurring"].includes(value)) {
    return { ok: false, message: "Choose a valid donation type." };
  }

  return { ok: true };
};

// this section handles validating recurring setup consent.
const validateRecurringTerms = (type, accepted) => {
  if (type !== "recurring") {
    return { ok: true };
  }

  if (accepted !== true) {
    return { ok: false, message: "You must agree to the terms to continue." };
  }

  return { ok: true };
};

// this section handles enforcing a simple in-memory rate limit.
const enforceRateLimit = (req, res) => {
  const key = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (current.count >= RATE_LIMIT_MAX) {
    res.status(429).json({ success: false, message: "Too many attempts, please wait a moment." });
    return false;
  }

  current.count += 1;
  rateLimitStore.set(key, current);
  return true;
};

// this section handles collecting field-level validation errors.
const collectErrors = (body) => {
  const errors = {};
  const checks = {
    name: validateName(body.name),
    email: validateEmail(body.email),
    amount: validateAmount(body.amount),
    method: validateMethod(body.method),
    type: validateType(body.type),
    frequency: validateFrequency(body.type, body.frequency),
    acceptTerms: validateRecurringTerms(body.type, body.acceptTerms)
  };

  if (body.method === "mpesa") {
    checks.mpesaPhone = validateMpesaPhone(body.mpesaPhone);
  }

  if (body.method === "card") {
    checks.card = validateCardFields({
      cardNumber: body.cardNumber,
      cardExpiry: body.cardExpiry,
      cardCvv: body.cardCvv
    });
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

// this section handles stripping the request down to the fields we want to echo back.
const buildPayload = (body) => ({
  name: String(body.name).trim(),
  email: String(body.email).trim().toLowerCase(),
  amount: Number(body.amount),
  method: body.method,
  type: body.type,
  frequency: body.type === "recurring" ? body.frequency : null,
  acceptTerms: body.type === "recurring" ? body.acceptTerms === true : null,
  mpesaPhone: body.method === "mpesa" ? String(body.mpesaPhone || "").trim() : null,
  cardNumber: body.method === "card" ? String(body.cardNumber || "").trim() : null,
  cardExpiry: body.method === "card" ? String(body.cardExpiry || "").trim() : null,
  cardCvv: body.method === "card" ? String(body.cardCvv || "").trim() : null
});

export default async function handler(req, res) {
  if (!enforceRateLimit(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ success: false, message: "Method not allowed." });
    return;
  }

  let body;

  try {
    body = await readJsonBody(req);
  } catch (error) {
    res.status(400).json({ success: false, message: "Request body must be valid JSON." });
    return;
  }

  if (!isPlainObject(body)) {
    res.status(400).json({ success: false, message: "Request body must be an object." });
    return;
  }

  const unexpectedKeys = Object.keys(body).filter((key) => !allowedKeys.includes(key));

  if (unexpectedKeys.length > 0) {
    res.status(400).json({ success: false, message: "Unexpected fields were provided." });
    return;
  }

  const errors = collectErrors(body);

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ success: false, errors });
    return;
  }

  const payload = buildPayload(body);

  if (payload.type === "recurring") {
    res.status(200).json({
      success: true,
      scheduled: true,
      transactionId: `RECURRING${Date.now()}`,
      amount: payload.amount,
      method: payload.method,
      type: payload.type,
      frequency: payload.frequency,
      acceptTerms: payload.acceptTerms
    });
    return;
  }

  const result = processPayment(payload.method, payload.amount);

  if (!result.success) {
    res.status(402).json({ success: false, message: result.message });
    return;
  }

  res.status(200).json({
    success: true,
    transactionId: result.transactionId,
    amount: payload.amount,
    method: payload.method,
    type: payload.type,
    frequency: payload.frequency,
    mpesaPhone: payload.method === "mpesa" ? `***${payload.mpesaPhone.replace(/\D/g, "").slice(-3)}` : null,
    cardNumber: payload.method === "card" ? `**** **** **** ${payload.cardNumber.replace(/\s+/g, "").slice(-4)}` : null
  });
}
