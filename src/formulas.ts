/**
 * Melt value-leak math, matching the current "Anatomy of a Scan" methodology
 * (see CLAUDE.md) — a real scan found a $77,235/yr leak by tying specific
 * event volumes and leak rates (29% Gong open rate, 62% Clari override rate,
 * etc.) to a dollar value per leaking event. This generalizes that pattern
 * rather than reintroducing the retired DSO/Contract-Cycle/Win-Rate formulas,
 * which don't appear in any current Melt material.
 *
 * Kept as pure functions so the MCP tool layer stays a thin adapter and the
 * same math can be unit tested or reused elsewhere later.
 */

export function annualLeakEstimate(
  totalVolume: number,
  leakRatePct: number,
  valuePerEvent: number
): number {
  return totalVolume * (leakRatePct / 100) * valuePerEvent;
}

/**
 * Asymmetric Workflow Profiling — heuristic used by analyze_value_vectors,
 * Melt's free Stage-1 Sandbox estimator (synthetic data modeled on the
 * prospect's industry/size, per the Frictionless POC Playbook — not a real
 * scan). Friction multipliers reflect how much manual labor a given
 * unstructured input type typically consumes per employee per week before
 * automation. These are directional planning constants, not measured data —
 * every tool response says so explicitly so agents don't repeat them as fact.
 */
export const FRICTION_HOURS_PER_EMPLOYEE_PER_WEEK: Record<string, number> = {
  PDF_INVOICES: 6.5,
  CUSTOMER_TICKETS: 5.0,
  LOGISTICS_DOCUMENTS: 7.0,
  MANUAL_EXCEL: 4.0,
};

export function annualizedAddressableLaborCost(
  headcount: number,
  hourlyLaborCost: number,
  frictionHoursPerWeek: number,
  workWeeksPerYear = 48
): number {
  return headcount * hourlyLaborCost * frictionHoursPerWeek * workWeeksPerYear;
}
