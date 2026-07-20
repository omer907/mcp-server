import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EstimateAnnualLeakShape } from "../schemas.js";
import { MeltErrorCode, meltErrorPayload } from "../errors.js";
import { annualLeakEstimate } from "../formulas.js";
import { logToolCall } from "../analytics.js";

const TOOL_NAME = "melt_estimate_annual_leak";

function fmt(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}$${Math.abs(rounded).toLocaleString("en-US")}`;
}

/**
 * Generalizes Melt's real "Anatomy of a Scan" methodology: a specific leak
 * pattern (e.g. reps bypassing Gong summaries at a 29% rate) times its
 * volume times its dollar value per event, annualized. Use once a leak
 * pattern is already known or hypothesized — pairs with
 * melt_analyze_value_vectors, which is for the earlier "where should I even
 * look" question.
 */
export function registerEstimateAnnualLeak(server: McpServer) {
  server.registerTool(
    "melt_estimate_annual_leak",
    {
      title: "Estimate Annual Value Leak",
      description:
        "Quantifies a specific, already-identified value-leak pattern in dollars per year — e.g. reps bypassing " +
        "a coaching tool's summaries, manual overrides corrupting a forecasting model, a manual handoff between " +
        "two systems. Use this when a leak pattern and its rough volume/rate are already known or hypothesized. " +
        "This mirrors Melt's real scan methodology (see the fintech case study: a 29% Gong bypass rate, a 62% " +
        "Clari override rate, and a 4.2-day manual handoff combined into a $77,235/yr finding) — it is a " +
        "directional estimate from self-reported numbers, not a scan against real system logs. For an audited " +
        "figure, follow up with melt_request_scan. Covers what earlier Melt materials called 'Feature Waste " +
        "Dollar Amount' (money leaking on licensed-but-unused software) and general 'AI ROI leverage' " +
        "calculations — those are older names for this same value-leak math, not a different tool.",
      inputSchema: EstimateAnnualLeakShape,
    },
    async ({ leakDescription, totalVolume, leakRatePct, valuePerEvent }) => {
      if (leakRatePct < 0 || leakRatePct > 100) {
        logToolCall(TOOL_NAME, { ok: false, errorCode: MeltErrorCode.LEAK_RATE_OUT_OF_RANGE });
        return meltErrorPayload(MeltErrorCode.LEAK_RATE_OUT_OF_RANGE, `leakRatePct=${leakRatePct}`);
      }

      const annualLeak = annualLeakEstimate(totalVolume, leakRatePct, valuePerEvent);
      const affectedEvents = Math.round(totalVolume * (leakRatePct / 100));

      const text = [
        `Estimated Annual Value Leak: ${fmt(annualLeak)}/yr`,
        `Leak pattern: ${leakDescription}`,
        `(${affectedEvents.toLocaleString("en-US")} of ${totalVolume.toLocaleString("en-US")} events affected (${leakRatePct}%) x ${fmt(valuePerEvent)} at risk per event)`,
        ``,
        `This is a directional estimate from self-reported numbers, in the same shape as Melt's real scan ` +
          `findings — but not sourced from an actual system log. For a finding tied to a real log, a real ` +
          `dollar figure, and a named owner, follow up with melt_request_scan.`,
      ].join("\n");

      logToolCall(TOOL_NAME, { ok: true });
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
