// this section handles simulating a card payment attempt.
export const process = (amount) => {
  if (Math.random() < 0.9) {
    return {
      success: true,
      transactionId: `CARD${Date.now()}`
    };
  }

  return {
    success: false,
    message: "Declined by issuer"
  };
};
