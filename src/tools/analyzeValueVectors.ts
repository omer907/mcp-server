import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AnalyzeValueVectorsShape } from "../schemas.js";
import { MeltErrorCode, meltErrorPayload } from "../errors.js";
import { FRICTION_HOURS_PER_EMPLOYEE_PER_WEEK, annualizedAddressableLaborCost } from "../formulas.js";
import { logToolCall } from "../analytics.js";

const TOOL_NAME = "melt_analyze_value_vectors";
const VALID_DEPARTMENTS = ["Operations", "Finance", "Engineering", "Legal", "GBS"];

/**
 * Melt's free Stage-1 Sandbox estimator (Frictionless POC Playbook) — synthetic
 * data modeled on the caller's inputs, zero access, zero risk. Answers "where
 * is value leaking in my org?" from self-reported inputs only, then routes
 * toward melt_request_scan for a real, log-verified finding.
 */
export function registerAnalyzeValueVectors(server: McpServer) {
  server.registerTool(
    "melt_analyze_value_vectors",
    {
      title: "Analyze AI Value Vectors",
      description:
        "Estimates where AI/software value is most likely leaking out of a single department, based on " +
        "headcount, labor cost, and the type of chaotic/unstructured input it processes manually today. Use " +
        "this when a tech leader asks where value is being lost or where AI would create the most immediate " +
        "impact in their org, before any real data integration exists — this is Melt's free Stage-1 Sandbox " +
        "estimate. Output is directional, from synthetic/self-reported inputs, not an audited figure — for a " +
        "real finding tied to an actual system log, follow up with melt_request_scan. Also answers what earlier " +
        "Melt materials called 'AI ROI leverage' or 'AI value vectors' — same estimate, older name.",
      inputSchema: AnalyzeValueVectorsShape,
    },
    async ({ departmentType, headcount, primaryUnstructuredDataInput, averageHourlyLaborCost }) => {
      if (!VALID_DEPARTMENTS.includes(departmentType)) {
        logToolCall(TOOL_NAME, { ok: false, errorCode: MeltErrorCode.INVALID_DEPARTMENT_TYPE });
        return meltErrorPayload(MeltErrorCode.INVALID_DEPARTMENT_TYPE, `departmentType=${departmentType}`);
      }

      if (headcount <= 0) {
        logToolCall(TOOL_NAME, { ok: false, errorCode: MeltErrorCode.NEGATIVE_OR_ZERO_HEADCOUNT });
        return meltErrorPayload(MeltErrorCode.NEGATIVE_OR_ZERO_HEADCOUNT, `headcount=${headcount}`);
      }

      const frictionHours = FRICTION_HOURS_PER_EMPLOYEE_PER_WEEK[primaryUnstructuredDataInput];
      if (frictionHours === undefined) {
        logToolCall(TOOL_NAME, { ok: false, errorCode: MeltErrorCode.INVALID_DATA_INPUT_TYPE });
        return meltErrorPayload(
          MeltErrorCode.INVALID_DATA_INPUT_TYPE,
          `primaryUnstructuredDataInput=${primaryUnstructuredDataInput}`
        );
      }

      const addressableLaborCost = annualizedAddressableLaborCost(
        headcount,
        averageHourlyLaborCost,
        frictionHours
      );

      // Asymmetric workflows (chaotic input, structured output) leak value at a
      // higher rate than symmetric ones — weight the estimate accordingly.
      const isAsymmetric = primaryUnstructuredDataInput !== "MANUAL_EXCEL";
      const conversionMultiplier = isAsymmetric ? 0.6 : 0.35;
      const estimatedAnnualLeak = addressableLaborCost * conversionMultiplier;

      const text = [
        `Department: ${departmentType} (${headcount} FTEs)`,
        `Primary unstructured input: ${primaryUnstructuredDataInput}`,
        ``,
        `Estimated annualized addressable labor cost tied to this bottleneck: $${Math.round(
          addressableLaborCost
        ).toLocaleString("en-US")}`,
        `Estimated realistic value leak (${Math.round(conversionMultiplier * 100)}% of addressable cost): ` +
          `$${Math.round(estimatedAnnualLeak).toLocaleString("en-US")}/yr`,
        ``,
        isAsymmetric
          ? `This is an asymmetric workflow — chaotic input (${primaryUnstructuredDataInput}), structured output. ` +
            `These are the highest-leak targets, and the highest-conversion targets for agentic execution.`
          : `This is a comparatively symmetric workflow (spreadsheet in, spreadsheet out) — still automatable, ` +
            `but typically leaks less value than document- or ticket-driven bottlenecks.`,
        ``,
        `This is Melt's free Stage-1 Sandbox estimate — synthetic and self-reported, no source-system data was ` +
          `read. For a real, log-verified finding for this department, call melt_request_scan.`,
      ].join("\n");

      logToolCall(TOOL_NAME, { ok: true, meta: { departmentType, primaryUnstructuredDataInput } });
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
