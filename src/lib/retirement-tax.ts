// SARS rates for individuals. Each ceiling is the last rand in that band.
// https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
const marginalRates = [0.18, 0.26, 0.31, 0.36, 0.39, 0.41, 0.45];
type TaxRules = { ceilings: number[]; primaryRebate: number; contributionCap: number };

const rules2025and2026: TaxRules = {
  ceilings: [237100, 370500, 512800, 673000, 857900, 1817000, Infinity],
  primaryRebate: 17235,
  contributionCap: 350000,
};

export const taxYears: Record<string, TaxRules> = {
  2025: rules2025and2026,
  2026: rules2025and2026,
  2027: {
    ceilings: [245100, 383100, 530200, 695800, 887000, 1878600, Infinity],
    primaryRebate: 17820,
    contributionCap: 430000,
  },
};

function incomeTax(income: number, rules: TaxRules) {
  let tax = 0;
  let lowerLimit = 0;
  for (const [index, upperLimit] of rules.ceilings.entries()) {
    tax += (Math.min(income, upperLimit) - lowerLimit) * marginalRates[index];
    if (income <= upperLimit) break;
    lowerLimit = upperLimit;
  }
  return Math.max(0, tax - rules.primaryRebate);
}

export function estimateRetirementTax(income: number, pension: number, ra: number, rules: TaxRules) {
  const total = pension + ra;
  const limit = Math.min(income * 0.275, rules.contributionCap);
  const allowable = Math.min(total, limit);
  const existingDeduction = Math.min(pension, limit);
  const taxBefore = incomeTax(income - existingDeduction, rules);
  const taxAfter = incomeTax(income - allowable, rules);
  const saved = taxBefore - taxAfter;
  return {
    total, limit, allowable, taxBefore, taxAfter, saved,
    effective: ra - saved,
    discount: ra > 0 ? 100 * saved / ra : 0,
    carried: total - allowable,
  };
}
