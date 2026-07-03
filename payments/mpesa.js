// this section handles simulating an M-Pesa payment attempt.
export const process = (amount) => {
  if (Math.random() < 0.9) {
    return {
      success: true,
      transactionId: `MPESA${Date.now()}`
    };
  }

  return {
    success: false,
    message: "Insufficient balance"
  };
};
