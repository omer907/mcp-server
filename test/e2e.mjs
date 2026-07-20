#!/usr/bin/env node
/**
 * End-to-end regression suite — spawns the built server over stdio and
 * exercises it exactly like a real MCP client would. Run via `npm test`
 * (which builds first via the pretest hook).
 *
 * Intentionally does NOT exercise melt_request_scan's happy path — that
 * submits to the real, live HubSpot form by default. This suite only covers
 * its validation error paths, which never reach the network.
 */
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, "..", "dist", "index.js");

function createClient() {
  const proc = spawn("node", [SERVER_PATH], { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  const pending = new Map();

  proc.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  let nextId = 1;
  function send(method, params) {
    return new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  function notify(method, params) {
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }
  function close() {
    proc.kill();
  }
  return { send, notify, close };
}

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ok   - ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL - ${name}\n         ${err.message}`);
    failed++;
  }
}

async function main() {
  const client = createClient();

  await client.send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "e2e-test", version: "1.0" },
  });
  client.notify("notifications/initialized");
  await new Promise((r) => setTimeout(r, 150));

  const list = await client.send("tools/list");
  const toolNames = list.result.tools.map((t) => t.name).sort();
  check("tools/list returns all 3 tools", () => {
    assert.deepEqual(
      toolNames,
      ["melt_analyze_value_vectors", "melt_estimate_annual_leak", "melt_request_scan"].sort()
    );
  });

  // --- happy paths ---
  let r = await client.send("tools/call", {
    name: "melt_estimate_annual_leak",
    arguments: {
      leakDescription: "reps bypassing Gong call summaries",
      totalVolume: 1000,
      leakRatePct: 29,
      valuePerEvent: 100,
    },
  });
  check("estimate_annual_leak happy path", () => {
    assert.ok(!r.result.isError);
    assert.match(r.result.content[0].text, /\$29,000\/yr/);
    assert.match(r.result.content[0].text, /290 of 1,000 events/);
  });

  r = await client.send("tools/call", {
    name: "melt_analyze_value_vectors",
    arguments: {
      departmentType: "Engineering",
      headcount: 40,
      primaryUnstructuredDataInput: "CUSTOMER_TICKETS",
      averageHourlyLaborCost: 60,
    },
  });
  check("analyze_value_vectors happy path", () => {
    assert.ok(!r.result.isError);
    assert.match(r.result.content[0].text, /\$345,600\/yr/);
  });

  // --- error paths: must return Melt's self-healing text, not a generic MCP error ---
  r = await client.send("tools/call", {
    name: "melt_analyze_value_vectors",
    arguments: { departmentType: "Marketing", headcount: 10, primaryUnstructuredDataInput: "PDF_INVOICES", averageHourlyLaborCost: 40 },
  });
  check("invalid department returns self-healing error", () => {
    assert.ok(r.result.isError);
    assert.match(r.result.content[0].text, /ERR_INVALID_DEPARTMENT_TYPE/);
  });

  r = await client.send("tools/call", {
    name: "melt_analyze_value_vectors",
    arguments: { departmentType: "Finance", headcount: 10, primaryUnstructuredDataInput: "EMAIL_THREADS", averageHourlyLaborCost: 40 },
  });
  check("invalid data input returns self-healing error", () => {
    assert.ok(r.result.isError);
    assert.match(r.result.content[0].text, /ERR_INVALID_DATA_INPUT_TYPE/);
  });

  r = await client.send("tools/call", {
    name: "melt_analyze_value_vectors",
    arguments: { departmentType: "Finance", headcount: 0, primaryUnstructuredDataInput: "PDF_INVOICES", averageHourlyLaborCost: 40 },
  });
  check("zero headcount returns self-healing error", () => {
    assert.ok(r.result.isError);
    assert.match(r.result.content[0].text, /ERR_NEGATIVE_OR_ZERO_HEADCOUNT/);
  });

  r = await client.send("tools/call", {
    name: "melt_estimate_annual_leak",
    arguments: { leakDescription: "test", totalVolume: 1000, leakRatePct: 250, valuePerEvent: 100 },
  });
  check("out-of-range leak rate returns self-healing error", () => {
    assert.ok(r.result.isError);
    assert.match(r.result.content[0].text, /ERR_LEAK_RATE_OUT_OF_RANGE/);
  });

  r = await client.send("tools/call", {
    name: "melt_request_scan",
    arguments: { notes: "no company or email given" },
  });
  check("missing contact info returns self-healing error", () => {
    assert.ok(r.result.isError);
    assert.match(r.result.content[0].text, /ERR_MISSING_CONTACT_INFO/);
  });

  r = await client.send("tools/call", {
    name: "melt_request_scan",
    arguments: { company: "Test Co", contactEmail: "not-an-email" },
  });
  check("malformed email returns self-healing error", () => {
    assert.ok(r.result.isError);
    assert.match(r.result.content[0].text, /ERR_INVALID_EMAIL_FORMAT/);
  });

  client.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
