// This section handles M-Pesa's real-time transaction limit and auto-switches the donor
// to Card if they exceed it, with a clear explanation. Never auto-switches back to M-Pesa.

// this section handles checking the M-Pesa per-transaction limit and deciding whether to switch methods.
export const checkMpesaLimit = (amount, currentMethod) => {
  const numericAmount = Number(amount);

  if (currentMethod !== "mpesa" || !Number.isFinite(numericAmount) || numericAmount <= 250000) {
    return { switched: false };
  }

  return {
    switched: true,
    message:
      'Right now, M-Pesa can only accept up to KES 250,000 per transaction. <a href="https://www.safaricom.co.ke/main-mpesa/m-pesa-for-you/tariffs-limits/consumer-tariffs-limits" target="_blank" rel="noopener noreferrer">Learn more about M-Pesa limits</a> — we&rsquo;ve switched you to Card.'
  };
};
