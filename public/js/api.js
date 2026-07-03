// This section is the only place that talks to the backend, so request/response shape
// changes happen in one spot.

// this section handles submitting a donation and normalizing the response shape.
export const submitDonation = async (payload) => {
  const response = await fetch("/api/donate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  return { status: response.status, data };
};
