// This section wires the form, validation, amount limits, notifications, and api
// together — the only file that touches the DOM directly for form logic.
import { validateName, validateEmail, validateAmount, validateFrequency, validateTerms, validateMpesaPhone, validateCardFields } from "./validation.js";
import { checkMpesaLimit } from "./amountLimits.js";
import { submitDonation } from "./api.js";
import { showSuccessOneTime, showSuccessRecurring, showFailure, showRateLimited, showMpesaStkPrompt } from "./notifications.js";

const state = { amount: null, isSubmitting: false, touched: new Set() };

// this section handles looking up every DOM element the form needs.
const getElements = () => ({
  form: document.getElementById("donation-form"),
  nameInput: document.getElementById("full-name"),
  emailInput: document.getElementById("email-address"),
  customAmountInput: document.getElementById("custom-amount"),
  ledger: document.getElementById("amount-ledger"),
  ledgerValue: document.getElementById("ledger-value"),
  frequencyField: document.getElementById("frequency-field"),
  frequencySelect: document.getElementById("frequency"),
  notice: document.getElementById("mpesa-limit-notice"),
  mpesaFields: document.getElementById("mpesa-fields"),
  mpesaPhoneInput: document.getElementById("mpesa-phone"),
  cardFields: document.getElementById("card-fields"),
  cardNumberInput: document.getElementById("card-number"),
  cardExpiryInput: document.getElementById("card-expiry"),
  cardCvvInput: document.getElementById("card-cvv"),
  termsCheckbox: document.getElementById("accept-terms"),
  submitButton: document.getElementById("submit-button"),
  submitSpinner: document.getElementById("submit-spinner"),
  errors: {
    name: document.getElementById("name-error"),
    email: document.getElementById("email-error"),
    amount: document.getElementById("amount-error"),
    frequency: document.getElementById("frequency-error"),
    terms: document.getElementById("terms-error"),
    mpesaPhone: document.getElementById("mpesa-phone-error"),
    card: document.getElementById("card-error")
  }
});

// this section handles formatting an amount for display in the ledger.
const formatAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `KES ${amount.toLocaleString("en-KE", { maximumFractionDigits: 2 })}` : "Choose an amount";
};

// this section handles reading the amount input's value with formatting commas stripped.
const rawAmountValue = (input) => input.value.replace(/,/g, "").trim();

// this section handles live-formatting the custom amount input with thousand separators as the donor types.
const formatAmountInput = (input) => {
  const cursorFromEnd = input.value.length - (input.selectionStart ?? input.value.length);
  const digitsOnly = input.value.replace(/[^\d.]/g, "");
  const hasDecimal = digitsOnly.includes(".");
  const [whole, ...decimalParts] = digitsOnly.split(".");
  const decimal = decimalParts.join("").slice(0, 2);

  const formattedWhole = whole ? Number(whole).toLocaleString("en-KE") : "";
  input.value = hasDecimal ? `${formattedWhole}.${decimal}` : formattedWhole;

  const newPosition = Math.max(0, input.value.length - cursorFromEnd);
  input.setSelectionRange(newPosition, newPosition);
};

// this section handles debouncing the custom amount input.
const debounce = (callback, wait) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), wait);
  };
};

// this section handles reading the active donation type from the radio group.
const getDonationType = (form) => form.querySelector('input[name="type"]:checked')?.value || "one-time";

// this section handles reading the active payment method from the radio group.
const getSelectedMethod = (form) => form.querySelector('input[name="method"]:checked')?.value || "mpesa";

// this section handles applying or clearing a single field's validation state.
const setFieldState = (input, errorNode, result) => {
  input.classList.toggle("is-invalid", !result.ok);
  errorNode.textContent = result.ok ? "" : (result.message || "Please check this field.");
  return result.ok;
};

// this section handles focusing the first invalid field, if any — a no-op when nothing is invalid,
// e.g. a declined payment where every field was actually valid.
const focusFirstInvalid = (elements) => {
  elements.form.querySelector(".is-invalid")?.focus();
};

// this section handles applying a combined card validation result to all three card inputs.
const setCardFieldState = (elements, result) => {
  [elements.cardNumberInput, elements.cardExpiryInput, elements.cardCvvInput].forEach((input) => {
    input.classList.toggle("is-invalid", !result.ok);
  });
  elements.errors.card.textContent = result.ok ? "" : (result.message || "Please check your card details.");
  return result.ok;
};

// this section handles reading and validating the current card field values.
const validateCardFieldsLive = (elements) =>
  setCardFieldState(elements, validateCardFields({
    cardNumber: elements.cardNumberInput.value,
    cardExpiry: elements.cardExpiryInput.value,
    cardCvv: elements.cardCvvInput.value
  }));

// this section handles formatting the card number into groups of four digits as the donor types.
const formatCardNumber = (input) => {
  input.value = input.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
};

// this section handles formatting the expiry date into MM/YY as the donor types.
const formatCardExpiry = (input) => {
  const digits = input.value.replace(/\D/g, "").slice(0, 4);
  input.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

// this section handles restricting the CVV field to three digits as the donor types.
const formatCardCvv = (input) => {
  input.value = input.value.replace(/\D/g, "").slice(0, 3);
};

// this section handles showing the fields for the selected payment method, clearing the other.
const syncMethodVisibility = (elements) => {
  const isMpesa = getSelectedMethod(elements.form) === "mpesa";
  elements.mpesaFields.classList.toggle("d-none", !isMpesa);
  elements.cardFields.classList.toggle("d-none", isMpesa);

  if (isMpesa) {
    elements.cardNumberInput.value = "";
    elements.cardExpiryInput.value = "";
    elements.cardCvvInput.value = "";
    setCardFieldState(elements, { ok: true });
  } else {
    elements.mpesaPhoneInput.value = "";
    setFieldState(elements.mpesaPhoneInput, elements.errors.mpesaPhone, { ok: true });
  }
};

// this section handles syncing the preset buttons with the currently selected amount.
const syncPresetButtons = (amount) => {
  document.querySelectorAll(".preset-btn").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.amount) === Number(amount));
  });
};

// this section handles updating the ledger figure and the stored amount.
const applyAmountSelection = (elements, amount) => {
  state.amount = amount;
  elements.ledgerValue.textContent = formatAmount(amount);
  elements.ledger.classList.toggle("has-amount", amount != null);
};

// this section handles a preset amount button being clicked.
const handlePresetClick = (elements, button) => {
  const amount = Number(button.dataset.amount);
  elements.customAmountInput.value = "";
  setFieldState(elements.customAmountInput, elements.errors.amount, { ok: true });
  syncPresetButtons(amount);
  applyAmountSelection(elements, amount);
  enforceMpesaLimit(elements);
};

// this section handles the donor typing a custom amount.
const handleCustomAmountInput = (elements) => {
  const rawValue = rawAmountValue(elements.customAmountInput);
  syncPresetButtons(null);

  if (!rawValue) {
    applyAmountSelection(elements, null);
    setFieldState(elements.customAmountInput, elements.errors.amount, { ok: true });
    return;
  }

  const result = validateAmount(rawValue);
  setFieldState(elements.customAmountInput, elements.errors.amount, result);
  applyAmountSelection(elements, result.ok ? Number(rawValue) : null);
  enforceMpesaLimit(elements);
};

// this section handles checking the M-Pesa limit and auto-switching to Card if it's exceeded.
const enforceMpesaLimit = (elements) => {
  const method = getSelectedMethod(elements.form);
  const result = checkMpesaLimit(state.amount, method);

  if (!result.switched) {
    return;
  }

  elements.form.querySelector('input[name="method"][value="card"]').checked = true;
  syncMethodVisibility(elements);
  elements.notice.innerHTML = result.message;
  elements.notice.classList.remove("d-none");
};

// this section handles showing or hiding the recurring frequency dropdown.
const syncFrequencyVisibility = (elements) => {
  const isRecurring = getDonationType(elements.form) === "recurring";
  elements.frequencyField.classList.toggle("d-none", !isRecurring);

  if (!isRecurring) {
    setFieldState(elements.frequencySelect, elements.errors.frequency, { ok: true });
  }
};

// this section handles running full client-side validation and reflecting errors inline.
const validateForm = (elements) => {
  state.touched.add("name").add("email").add("mpesaPhone").add("card");
  const type = getDonationType(elements.form);
  const method = getSelectedMethod(elements.form);

  const nameOk = setFieldState(elements.nameInput, elements.errors.name, validateName(elements.nameInput.value));
  const emailOk = setFieldState(elements.emailInput, elements.errors.email, validateEmail(elements.emailInput.value));
  const amountOk = setFieldState(
    elements.customAmountInput,
    elements.errors.amount,
    state.amount == null ? validateAmount(rawAmountValue(elements.customAmountInput)) : { ok: true }
  );
  const frequencyOk = setFieldState(
    elements.frequencySelect,
    elements.errors.frequency,
    validateFrequency(type, elements.frequencySelect.value)
  );
  const termsOk = setFieldState(elements.termsCheckbox, elements.errors.terms, validateTerms(elements.termsCheckbox.checked));
  const methodFieldsOk = method === "mpesa"
    ? setFieldState(elements.mpesaPhoneInput, elements.errors.mpesaPhone, validateMpesaPhone(elements.mpesaPhoneInput.value))
    : validateCardFieldsLive(elements);

  return nameOk && emailOk && amountOk && frequencyOk && termsOk && methodFieldsOk;
};

// this section handles building the payload sent to the backend.
const buildPayload = (elements) => {
  const type = getDonationType(elements.form);
  const method = getSelectedMethod(elements.form);

  return {
    name: elements.nameInput.value.trim(),
    email: elements.emailInput.value.trim().toLowerCase(),
    amount: Number(state.amount),
    method,
    type,
    frequency: type === "recurring" ? elements.frequencySelect.value : null,
    acceptTerms: Boolean(elements.termsCheckbox.checked),
    mpesaPhone: method === "mpesa" ? elements.mpesaPhoneInput.value.trim() : null,
    cardNumber: method === "card" ? elements.cardNumberInput.value.replace(/\s+/g, "") : null,
    cardExpiry: method === "card" ? elements.cardExpiryInput.value.trim() : null,
    cardCvv: method === "card" ? elements.cardCvvInput.value.trim() : null
  };
};

// this section handles keeping the submit button disabled until the terms are accepted and no request is in flight.
const syncSubmitAvailability = (elements) => {
  elements.submitButton.disabled = state.isSubmitting || !elements.termsCheckbox.checked;
};

// this section handles toggling the submit button between idle and in-flight states.
const setSubmittingState = (elements, isSubmitting) => {
  state.isSubmitting = isSubmitting;
  syncSubmitAvailability(elements);
  elements.submitSpinner.classList.toggle("d-none", !isSubmitting);
};

// this section handles resetting the form to a clean state after a successful donation.
const resetForm = (elements) => {
  state.touched.clear();
  elements.form.reset();
  syncPresetButtons(null);
  applyAmountSelection(elements, null);
  syncFrequencyVisibility(elements);
  syncMethodVisibility(elements);
  elements.notice.classList.add("d-none");
  elements.notice.innerHTML = "";

  [elements.nameInput, elements.emailInput, elements.customAmountInput, elements.frequencySelect, elements.termsCheckbox, elements.mpesaPhoneInput, elements.cardNumberInput, elements.cardExpiryInput, elements.cardCvvInput].forEach((input) => {
    input.classList.remove("is-invalid");
  });
  Object.values(elements.errors).forEach((node) => {
    node.textContent = "";
  });
  syncSubmitAvailability(elements);
};

// this section handles applying field-level errors returned by the server.
const applyServerErrors = (elements, errors) => {
  setFieldState(elements.nameInput, elements.errors.name, errors.name ? { ok: false, message: errors.name } : { ok: true });
  setFieldState(elements.emailInput, elements.errors.email, errors.email ? { ok: false, message: errors.email } : { ok: true });
  setFieldState(elements.customAmountInput, elements.errors.amount, errors.amount ? { ok: false, message: errors.amount } : { ok: true });
  setFieldState(elements.frequencySelect, elements.errors.frequency, errors.frequency ? { ok: false, message: errors.frequency } : { ok: true });
  setFieldState(elements.termsCheckbox, elements.errors.terms, errors.acceptTerms ? { ok: false, message: errors.acceptTerms } : { ok: true });
  setFieldState(elements.mpesaPhoneInput, elements.errors.mpesaPhone, errors.mpesaPhone ? { ok: false, message: errors.mpesaPhone } : { ok: true });
  setCardFieldState(elements, errors.card ? { ok: false, message: errors.card } : { ok: true });
  focusFirstInvalid(elements);
};

// this section handles branching on the backend response after a submit attempt.
const handleResponse = async (elements, payload, response) => {
  if (response.status === 200) {
    resetForm(elements);

    if (payload.type === "recurring") {
      await showSuccessRecurring();
      return;
    }

    await showSuccessOneTime();
    return;
  }

  if (response.status === 429) {
    await showRateLimited();
    return;
  }

  if (response.status === 400 && response.data?.errors) {
    applyServerErrors(elements, response.data.errors);
    return;
  }

  const result = await showFailure(response.data?.message);
  if (result.isConfirmed) {
    focusFirstInvalid(elements);
  }
};

// this section handles the full submit lifecycle for the donation form.
const handleSubmit = async (elements, event) => {
  event.preventDefault();

  if (!validateForm(elements)) {
    focusFirstInvalid(elements);
    return;
  }

  const payload = buildPayload(elements);

  if (payload.method === "mpesa") {
    await showMpesaStkPrompt();
  }

  setSubmittingState(elements, true);

  try {
    const response = await submitDonation(payload);
    await handleResponse(elements, payload, response);
  } catch (error) {
    console.error("Donation submission failed:", error);
    await showFailure("Please try again.");
  } finally {
    setSubmittingState(elements, false);
  }
};

// this section handles wiring every event listener the form needs.
const wireEvents = (elements) => {
  document.querySelectorAll(".preset-btn").forEach((button) => {
    button.addEventListener("click", () => handlePresetClick(elements, button));
  });

  elements.customAmountInput.addEventListener("input", () => formatAmountInput(elements.customAmountInput));
  elements.customAmountInput.addEventListener("input", debounce(() => handleCustomAmountInput(elements), 300));

  elements.nameInput.addEventListener("blur", () => {
    state.touched.add("name");
    setFieldState(elements.nameInput, elements.errors.name, validateName(elements.nameInput.value));
  });
  elements.nameInput.addEventListener("input", () => {
    if (state.touched.has("name")) {
      setFieldState(elements.nameInput, elements.errors.name, validateName(elements.nameInput.value));
    }
  });

  elements.emailInput.addEventListener("blur", () => {
    state.touched.add("email");
    setFieldState(elements.emailInput, elements.errors.email, validateEmail(elements.emailInput.value));
  });
  elements.emailInput.addEventListener("input", () => {
    if (state.touched.has("email")) {
      setFieldState(elements.emailInput, elements.errors.email, validateEmail(elements.emailInput.value));
    }
  });

  elements.form.querySelectorAll('input[name="type"]').forEach((radio) => {
    radio.addEventListener("change", () => syncFrequencyVisibility(elements));
  });

  elements.form.querySelectorAll('input[name="method"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      syncMethodVisibility(elements);
      enforceMpesaLimit(elements);
    });
  });

  elements.frequencySelect.addEventListener("change", () =>
    setFieldState(elements.frequencySelect, elements.errors.frequency, validateFrequency(getDonationType(elements.form), elements.frequencySelect.value))
  );

  elements.mpesaPhoneInput.addEventListener("blur", () => {
    state.touched.add("mpesaPhone");
    setFieldState(elements.mpesaPhoneInput, elements.errors.mpesaPhone, validateMpesaPhone(elements.mpesaPhoneInput.value));
  });
  elements.mpesaPhoneInput.addEventListener("input", () => {
    if (state.touched.has("mpesaPhone")) {
      setFieldState(elements.mpesaPhoneInput, elements.errors.mpesaPhone, validateMpesaPhone(elements.mpesaPhoneInput.value));
    }
  });

  [elements.cardNumberInput, elements.cardExpiryInput, elements.cardCvvInput].forEach((input) => {
    input.addEventListener("blur", () => {
      state.touched.add("card");
      validateCardFieldsLive(elements);
    });
  });
  elements.cardNumberInput.addEventListener("input", () => {
    formatCardNumber(elements.cardNumberInput);
    if (state.touched.has("card")) {
      validateCardFieldsLive(elements);
    }
  });
  elements.cardExpiryInput.addEventListener("input", () => {
    formatCardExpiry(elements.cardExpiryInput);
    if (state.touched.has("card")) {
      validateCardFieldsLive(elements);
    }
  });
  elements.cardCvvInput.addEventListener("input", () => {
    formatCardCvv(elements.cardCvvInput);
    if (state.touched.has("card")) {
      validateCardFieldsLive(elements);
    }
  });

  elements.termsCheckbox.addEventListener("change", () => {
    setFieldState(elements.termsCheckbox, elements.errors.terms, validateTerms(elements.termsCheckbox.checked));
    syncSubmitAvailability(elements);
  });

  elements.form.addEventListener("submit", (event) => handleSubmit(elements, event));
};

// this section handles the staggered page-load animation, skipped under prefers-reduced-motion.
const runLoadAnimation = () => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.classList.remove("is-loading");
    return;
  }

  requestAnimationFrame(() => {
    document.body.classList.remove("is-loading");
    document.body.classList.add("is-ready");
  });
};

// this section handles initializing the donation form on page load.
const init = () => {
  const elements = getElements();
  wireEvents(elements);
  runLoadAnimation();
};

init();
