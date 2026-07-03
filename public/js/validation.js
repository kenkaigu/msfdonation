// This section validates individual form fields on the client for instant feedback.
// Server re-validates everything identically — this file is UX-only, not the source of truth.

// this section handles validating the donor's name.
export const validateName = (value) => {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return { ok: false, message: "Full name is required." };
  }

  if (trimmed.length < 2 || trimmed.length > 100) {
    return { ok: false, message: "Full name must be between 2 and 100 characters." };
  }

  if (!/^[A-Za-z\s-]+$/.test(trimmed)) {
    return { ok: false, message: "Full name can only contain letters, spaces, and hyphens." };
  }

  return { ok: true };
};

// this section handles validating the donor's email address.
export const validateEmail = (value) => {
  const trimmed = String(value ?? "").trim().toLowerCase();

  if (!trimmed) {
    return { ok: false, message: "Email address is required." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  return { ok: true };
};

// this section handles validating the donation amount.
export const validateAmount = (value) => {
  const text = String(value ?? "").trim();

  if (!text) {
    return { ok: false, message: "Choose or enter an amount." };
  }

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { ok: false, message: "Enter a valid amount with up to 2 decimal places." };
  }

  const amount = Number(text);

  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, message: "Amount must be at least KES 1." };
  }

  if (amount > 1000000) {
    return { ok: false, message: "Amount cannot exceed KES 1,000,000." };
  }

  return { ok: true };
};

// this section handles validating the recurring donation frequency.
export const validateFrequency = (type, frequency) => {
  if (type !== "recurring") {
    return { ok: true };
  }

  if (!frequency) {
    return { ok: false, message: "Choose how often you want to give." };
  }

  if (!["monthly", "quarterly", "biannual", "yearly"].includes(frequency)) {
    return { ok: false, message: "Choose a valid giving frequency." };
  }

  return { ok: true };
};

// this section handles validating that the donor has accepted the terms.
export const validateTerms = (accepted) => {
  if (accepted !== true) {
    return { ok: false, message: "You must agree to the terms to continue." };
  }

  return { ok: true };
};

// this section handles validating the M-Pesa phone number (simulation only).
export const validateMpesaPhone = (value) => {
  const digits = String(value ?? "").replace(/[^\d+]/g, "");
  const local = digits.startsWith("+254") ? `0${digits.slice(4)}` : digits.startsWith("254") ? `0${digits.slice(3)}` : digits;

  if (!local) {
    return { ok: false, message: "Enter your Safaricom phone number." };
  }

  if (!/^0[17]\d{8}$/.test(local)) {
    return { ok: false, message: "Use a valid Safaricom number like 0712 345 678." };
  }

  return { ok: true };
};

// this section handles validating card number, expiry, and CVV together (simulation only).
export const validateCardFields = ({ cardNumber, cardExpiry, cardCvv } = {}) => {
  const digits = String(cardNumber ?? "").replace(/\s+/g, "");

  if (!/^\d{16}$/.test(digits)) {
    return { ok: false, message: "Enter a valid 16-digit card number." };
  }

  const expiryMatch = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(String(cardExpiry ?? "").trim());

  if (!expiryMatch) {
    return { ok: false, message: "Use MM/YY for the expiry date." };
  }

  const expMonth = Number(expiryMatch[1]);
  const expYear = 2000 + Number(expiryMatch[2]);
  const now = new Date();

  if (expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
    return { ok: false, message: "Card has expired." };
  }

  if (!/^\d{3}$/.test(String(cardCvv ?? "").trim())) {
    return { ok: false, message: "Enter a valid 3-digit CVV." };
  }

  return { ok: true };
};
