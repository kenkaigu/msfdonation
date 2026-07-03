// This section owns every SweetAlert2 popup shown to the donor, so all messaging lives
// in one place and stays consistent.

// this section handles escaping text before it is rendered inside a popup.
const escapeHtml = (value) => {
  const text = String(value ?? "");
  const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return text.replace(/[&<>"']/g, (char) => replacements[char]);
};

// this section handles the one-time donation success popup, with a small "coming soon" teaser
// for recurring giving instead of a fully working upsell flow that doesn't exist yet.
export const showSuccessOneTime = () => Swal.fire({
  icon: "success",
  title: "Thank you for your contribution!",
  html: '<p>Want to keep supporting us?</p><a href="#" id="recurring-teaser" class="coming-soon-link">Set up recurring giving</a>',
  confirmButtonText: "Maybe later",
  didOpen: () => {
    const link = document.getElementById("recurring-teaser");
    link?.addEventListener("click", (event) => {
      event.preventDefault();
      link.textContent = "Coming soon!";
    });
  }
});

// this section handles the recurring donation success popup, with no upsell.
export const showSuccessRecurring = () => Swal.fire({
  icon: "success",
  title: "Thank you for your contribution!",
  confirmButtonText: "Close"
});

// this section handles the simulated M-Pesa STK confirmation step shown before the request is sent.
export const showMpesaStkPrompt = () => Swal.fire({
  icon: "info",
  title: "Check your phone",
  text: "We've sent a payment prompt to your M-Pesa. Confirm the payment, then continue.",
  confirmButtonText: "I've confirmed — continue"
});

// this section handles a failed payment attempt, offering retry or support contact.
export const showFailure = async (reasonMessage) => {
  const result = await Swal.fire({
    icon: "error",
    title: "That didn't go through",
    html: `<p>${escapeHtml(reasonMessage || "The payment could not be completed.")}</p><p>Please try again, or contact support if the problem continues.</p>`,
    confirmButtonText: "Try again",
    showDenyButton: true,
    denyButtonText: "Contact support",
    reverseButtons: true
  });

  if (result.isDenied) {
    window.location.href = "mailto:recruitment@nairobi.msf.org";
  }

  return result;
};

// this section handles the distinct rate-limit message, kept separate from a declined payment.
export const showRateLimited = () => Swal.fire({
  icon: "warning",
  title: "Too many attempts",
  text: "Please wait a moment before trying again.",
  confirmButtonText: "Close"
});
