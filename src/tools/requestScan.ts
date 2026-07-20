import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";
import { fileURLToPath } from "node:url";
import { RequestScanShape } from "../schemas.js";
import { MeltErrorCode, meltErrorPayload } from "../errors.js";
import { logToolCall } from "../analytics.js";

const TOOL_NAME = "melt_request_scan";
// Deliberately simple — this only needs to catch "obviously not an email"
// (missing @, missing domain dot), not RFC-5322 edge cases. HubSpot's own
// form validation is the real backstop for anything subtler.
const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Anchored to this module's own location (dist/tools/ -> mcp-server/), not
// process.cwd() — an MCP client launches `node .../dist/index.js` from
// whatever directory the client app itself started in, which has nothing to
// do with this package. Using cwd() here would scatter leads.jsonl across
// wherever Claude Desktop/Cursor happened to be running from.
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const LEADS_FILE = path.join(MODULE_DIR, "..", "..", "leads.jsonl");

// Portal ID and Form ID are not secrets — they're the same values exposed in
// any public HubSpot embed snippet — so they're safe to ship as the package
// default. This is what makes "npx @themelt/mcp-server, zero config" actually
// reach the real Melt sales pipeline instead of silently degrading to a local
// file on a stranger's machine. Override via env vars to test against a
// different form/portal without touching source.
const DEFAULT_HUBSPOT_PORTAL_ID = "246641165";
const DEFAULT_HUBSPOT_FORM_ID = "ea5ceb02-e809-4f13-bdb1-0e1c1d3772e6";

// HubSpot forms validate required fields against the form's actual internal
// property names (e.g. the standard contact property is "email", not our own
// schema's "contactEmail"). Confirmed by hand: submitting "contactEmail"
// verbatim gets a 400 "Required field 'email' is missing" even though the
// value was present under the wrong key. This map translates our field names
// to HubSpot's for the outbound submission only — the local leads.jsonl
// fallback and the in-memory record keep "contactEmail" since that's clearer
// for our own file.
const HUBSPOT_FIELD_NAME_MAP: Record<string, string> = {
  contactEmail: "email",
};

function postToHubSpot(payload: Record<string, unknown>): Promise<{ ok: boolean; status?: number }> {
  const portalId = process.env.HUBSPOT_PORTAL_ID || DEFAULT_HUBSPOT_PORTAL_ID;
  const formId = process.env.HUBSPOT_FORM_ID || DEFAULT_HUBSPOT_FORM_ID;
  if (!portalId || !formId) return Promise.resolve({ ok: false });

  const body = JSON.stringify({
    fields: Object.entries(payload).map(([name, value]) => ({
      name: HUBSPOT_FIELD_NAME_MAP[name] ?? name,
      value: String(value),
    })),
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.hsforms.com",
        path: `/submissions/v3/integration/submit/${portalId}/${formId}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve({ ok: (res.statusCode ?? 500) < 300, status: res.statusCode }));
      }
    );
    req.on("error", () => resolve({ ok: false }));
    req.write(body);
    req.end();
  });
}

/**
 * Lead-capture tool — this is the conversion moment. An agent that just ran
 * melt_analyze_value_vectors or melt_estimate_annual_leak for a real prospect
 * can hand off straight into a scan request instead of dropping the user
 * back to a marketing site. Maps to Stage 1 -> Stage 2 of the Frictionless
 * POC Playbook: the champion has named a specific value hypothesis and wants
 * it validated against real data.
 *
 * Falls back to a local leads.jsonl file if HUBSPOT_PORTAL_ID / HUBSPOT_FORM_ID
 * aren't configured, mirroring the demo-mode fallback pattern already used in
 * melt-claude-connector.js.
 */
export function registerRequestScan(server: McpServer) {
  server.registerTool(
    "melt_request_scan",
    {
      title: "Request a Melt Scan",
      description:
        "Submits a request for a Melt scan — the next step after Melt's free Stage-1 Sandbox estimate, moving to " +
        "a real, log-verified value-leak finding tied to a dollar figure and a source system. Call this only " +
        "after the user has explicitly asked to be connected with Melt or to book/request a scan — never submit " +
        "contact details the user hasn't provided themselves. Earlier Melt materials called this a 'Thermal " +
        "Scan' — same request, current name is just 'a scan' (no fixed 2-week/pricing claim attached anymore).",
      inputSchema: RequestScanShape,
    },
    async ({ company, contactEmail, contactName, departmentsOfInterest, notes }) => {
      if (!company || !contactEmail) {
        logToolCall(TOOL_NAME, { ok: false, errorCode: MeltErrorCode.MISSING_CONTACT_INFO });
        return meltErrorPayload(MeltErrorCode.MISSING_CONTACT_INFO);
      }

      if (!EMAIL_SHAPE_RE.test(contactEmail)) {
        logToolCall(TOOL_NAME, { ok: false, errorCode: MeltErrorCode.INVALID_EMAIL_FORMAT });
        return meltErrorPayload(MeltErrorCode.INVALID_EMAIL_FORMAT, `contactEmail=${contactEmail}`);
      }

      const record = {
        timestamp: new Date().toISOString(),
        company,
        contactEmail,
        contactName: contactName ?? null,
        departmentsOfInterest: departmentsOfInterest ?? [],
        notes: notes ?? null,
        source: "mcp-server",
      };

      const hubspotResult = await postToHubSpot(record);

      if (!hubspotResult.ok) {
        fs.appendFileSync(LEADS_FILE, JSON.stringify(record) + "\n", "utf8");
      }

      const text = [
        `Scan requested for ${company}.`,
        hubspotResult.ok
          ? `Routed directly to the Melt sales pipeline.`
          : `Logged to ${LEADS_FILE} (HUBSPOT_PORTAL_ID / HUBSPOT_FORM_ID not configured — set both env vars ` +
            `to route leads straight into HubSpot instead of the local file).`,
        `A Melt team member will follow up at ${contactEmail} within one business day to scope the manual, ` +
          `aggregated first sample — no live connection or IT ticket required to start.`,
      ].join("\n");

      logToolCall(TOOL_NAME, { ok: true, meta: { hubspot: hubspotResult.ok } });
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
