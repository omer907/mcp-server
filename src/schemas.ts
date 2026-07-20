import { z } from "zod";

/**
 * Zod Schema Hydration.
 *
 * Every field carries a `.describe()` modifier. This is not decoration — it is
 * the mechanism by which Claude (or any MCP client) decides which numbers in a
 * user's prompt map to which parameter. A schema with bare types and no
 * descriptions forces the model to guess; a schema with rich descriptions lets
 * it extract correctly on the first call.
 */

// departmentType, primaryUnstructuredDataInput, and headcount are deliberately
// NOT constrained with z.enum()/.positive() here. The MCP SDK rejects
// schema-level violations before a tool's handler ever runs, using its own
// generic "Invalid arguments" message — which discards the domain-specific,
// self-healing remediation text these tools are supposed to return (see
// errors.ts). Validating these manually inside each handler instead means an
// invalid call actually gets Melt's remediation, not a raw Zod error.
export const AnalyzeValueVectorsShape = {
  departmentType: z
    .string()
    .describe(
      "The organizational unit being evaluated. Must be one of: Operations, Finance, Engineering, Legal, GBS. " +
        "Map loosely-named teams to the closest primitive " +
        "(e.g. RevOps -> Operations, AR/Billing -> Finance, IT -> Engineering, Compliance -> Legal, " +
        "Shared Services -> GBS)."
    ),
  headcount: z
    .number()
    .describe("Total operational personnel in the target unit (not the whole company). Must be positive."),
  primaryUnstructuredDataInput: z
    .string()
    .describe(
      "The dominant chaotic input the unit processes by hand today. Must be one of: PDF_INVOICES, " +
        "CUSTOMER_TICKETS, LOGISTICS_DOCUMENTS, MANUAL_EXCEL. Choose the closest match: " +
        "PDF_INVOICES for document-first bottlenecks, CUSTOMER_TICKETS for conversational/support-first " +
        "bottlenecks, LOGISTICS_DOCUMENTS for shipping/customs/supply-chain paperwork, MANUAL_EXCEL for " +
        "spreadsheet-driven reconciliation or reporting work."
    ),
  averageHourlyLaborCost: z
    .number()
    .positive()
    .default(45)
    .describe(
      "Blended fully-loaded hourly labor cost for manual processors in this unit, in USD. " +
        "Default of 45 is a reasonable US mid-market planning assumption if the caller doesn't know the real figure."
    ),
};

// leakRatePct is deliberately unconstrained at the schema level (see note
// above) so an out-of-range value reaches the handler and returns Melt's
// self-healing ERR_LEAK_RATE_OUT_OF_RANGE instead of a generic Zod error.
export const EstimateAnnualLeakShape = {
  leakDescription: z
    .string()
    .describe(
      "Plain-language description of the leak pattern observed or hypothesized — e.g. 'reps bypassing Gong " +
        "call summaries and logging notes from memory', 'manual Slack handoff between Sales and Customer " +
        "Success', 'guessed close dates overriding the forecasting model'."
    ),
  totalVolume: z
    .number()
    .positive()
    .describe(
      "Total annual volume of the relevant event or transaction — e.g. total call briefs generated, total " +
        "deals closed, total support tickets, total lead assignments."
    ),
  leakRatePct: z
    .number()
    .describe(
      "Percentage of that volume exhibiting the leak behavior, between 0 and 100 (e.g. 29 for a 29% bypass " +
        "rate, 62 for a 62% override rate)."
    ),
  valuePerEvent: z
    .number()
    .positive()
    .describe(
      "Dollar value at risk per leaking event, in USD — e.g. average deal value, loaded hourly cost of " +
        "manual rework, cost of a delayed handoff day."
    ),
};

export const RequestScanShape = {
  company: z.string().optional().describe("The prospect's company name. Required."),
  contactEmail: z
    .string()
    .optional()
    .describe("Business email of the requester, for scan scheduling follow-up. Required."),
  contactName: z.string().optional().describe("Name of the requester, if known."),
  departmentsOfInterest: z
    .array(z.enum(["Operations", "Finance", "Engineering", "Legal", "GBS", "Sales", "HR", "Marketing", "Product"]))
    .optional()
    .describe("Departments the requester wants scanned first, if they expressed a preference."),
  notes: z
    .string()
    .optional()
    .describe("Any free-text context from the conversation that would help a Melt rep prep the call — trigger event, tech stack, urgency."),
};
