import { process as processMpesa } from "./mpesa.js";
import { process as processCard } from "./card.js";

// this section handles routing payments to the correct simulator.
export const process = (method, amount) => {
  if (method === "mpesa") {
    return processMpesa(amount);
  }

  if (method === "card") {
    return processCard(amount);
  }

  throw new Error("Unknown payment method");
};
