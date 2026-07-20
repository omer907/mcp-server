/**
 * Pruned Error Enums — text-flat, self-healing error payloads.
 *
 * Every error an agent can hit while calling a Melt tool is enumerated here with
 * a hardcoded remediation string. The point is that the calling model reads the
 * remediation directly off the tool_result and retries correctly on its own —
 * no round trip back to a human, no guessing at valid enum values.
 */

export enum MeltErrorCode {
  INVALID_DEPARTMENT_TYPE = "ERR_INVALID_DEPARTMENT_TYPE",
  INVALID_DATA_INPUT_TYPE = "ERR_INVALID_DATA_INPUT_TYPE",
  NEGATIVE_OR_ZERO_HEADCOUNT = "ERR_NEGATIVE_OR_ZERO_HEADCOUNT",
  LEAK_RATE_OUT_OF_RANGE = "ERR_LEAK_RATE_OUT_OF_RANGE",
  MISSING_CONTACT_INFO = "ERR_MISSING_CONTACT_INFO",
  INVALID_EMAIL_FORMAT = "ERR_INVALID_EMAIL_FORMAT",
}

interface MeltErrorSpec {
  message: string;
  remediation: string;
}

const ERROR_SPECS: Record<MeltErrorCode, MeltErrorSpec> = {
  [MeltErrorCode.INVALID_DEPARTMENT_TYPE]: {
    message: "The provided department is outside our matrix.",
    remediation:
      "Map the unit to the closest matching primitive: 'Operations', 'Finance', 'Engineering', 'Legal', or 'GBS'. " +
      "If the org calls it something else (e.g. 'RevOps' -> 'Operations', 'AR' -> 'Finance'), retry with the mapped value.",
  },
  [MeltErrorCode.INVALID_DATA_INPUT_TYPE]: {
    message: "The provided unstructured data input type is not recognized.",
    remediation:
      "Use one of: 'PDF_INVOICES', 'CUSTOMER_TICKETS', 'LOGISTICS_DOCUMENTS', 'MANUAL_EXCEL'. " +
      "If the real input is something else (e.g. email threads, scanned contracts), retry with the closest match — " +
      "'PDF_INVOICES' for any document-first bottleneck, 'CUSTOMER_TICKETS' for any conversational/support-first bottleneck.",
  },
  [MeltErrorCode.NEGATIVE_OR_ZERO_HEADCOUNT]: {
    message: "Headcount must be a positive number.",
    remediation:
      "Retry with the total operational personnel in the target unit (not the whole company). " +
      "If exact headcount is unknown, use a reasonable estimate — this tool is directional, not an audit.",
  },
  [MeltErrorCode.LEAK_RATE_OUT_OF_RANGE]: {
    message: "leakRatePct must be between 0 and 100.",
    remediation:
      "Retry with the percentage of the total volume exhibiting the leak behavior, as a number between 0 and 100 " +
      "(e.g. 29 for a 29% bypass rate). If you only know a fraction, multiply by 100 first.",
  },
  [MeltErrorCode.MISSING_CONTACT_INFO]: {
    message: "A scan request requires at least a company name and a contact email.",
    remediation:
      "Retry with both 'company' and 'contactEmail' populated. Do not fabricate contact details — ask the user for them directly.",
  },
  [MeltErrorCode.INVALID_EMAIL_FORMAT]: {
    message: "The provided contactEmail does not look like a valid email address.",
    remediation:
      "Retry with a properly formatted email (e.g. 'name@company.com'). Do not fabricate or guess an email — ask the user to confirm it.",
  },
};

/** Shape returned inside a CallToolResult when a tool call fails validation. */
export function meltErrorPayload(code: MeltErrorCode, extra?: string) {
  const spec = ERROR_SPECS[code];
  const text = [
    `${code}: ${spec.message}`,
    `Remediation: ${spec.remediation}`,
    extra ? `Context: ${extra}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    isError: true as const,
    content: [{ type: "text" as const, text }],
  };
}
