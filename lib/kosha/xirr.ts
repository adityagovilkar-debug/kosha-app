// XIRR — the annualized return for a series of irregularly-dated cash
// flows (KOSHA-PLAN.md §6.2). Convention: money leaving your pocket
// (a buy) is negative, money arriving (a sell, dividend, or the current
// notional value) is positive. Newton's method over the NPV function.

export interface CashFlow {
  date: string; // YYYY-MM-DD
  amount: number; // any consistent unit — sign is what matters
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

export function xirr(cashFlows: CashFlow[], guess = 0.15): number | null {
  const flows = cashFlows.filter((cf) => cf.amount !== 0);
  if (flows.length < 2) return null;
  // Needs at least one negative and one positive flow, or there's no rate that solves it.
  if (!flows.some((cf) => cf.amount < 0) || !flows.some((cf) => cf.amount > 0)) return null;

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = new Date(sorted[0].date).getTime();
  const years = sorted.map((cf) => (new Date(cf.date).getTime() - t0) / MS_PER_YEAR);

  function npv(rate: number): number {
    return sorted.reduce((sum, cf, i) => sum + cf.amount / Math.pow(1 + rate, years[i]), 0);
  }
  function dnpv(rate: number): number {
    return sorted.reduce((sum, cf, i) => sum - (years[i] * cf.amount) / Math.pow(1 + rate, years[i] + 1), 0);
  }

  // Convergence tolerance is relative to the flows' scale: amounts are in
  // paise, so a lakh-sized portfolio has |flows| ~ 1e7 and an absolute
  // "< 1" test would reject perfectly good roots as non-converged.
  const scale = sorted.reduce((s, cf) => s + Math.abs(cf.amount), 0);
  const tolerance = Math.max(1, scale * 1e-6);

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    const fPrime = dnpv(rate);
    if (Math.abs(fPrime) < 1e-10) break;
    let nextRate = rate - f / fPrime;
    if (nextRate <= -1) nextRate = (rate - 1) / 2; // keep (1+rate) positive
    if (!Number.isFinite(nextRate)) break;
    if (Math.abs(nextRate - rate) < 1e-7) {
      rate = nextRate;
      break;
    }
    rate = nextRate;
  }
  return Number.isFinite(rate) && rate > -1 && Math.abs(npv(rate)) < tolerance ? rate : null;
}
