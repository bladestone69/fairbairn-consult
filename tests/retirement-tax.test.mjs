import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateRetirementTax, taxYears } from '../src/lib/retirement-tax.ts';

test('an existing pension cannot produce a saving or a cost for a zero extra RA', () => {
  for (const rules of Object.values(taxYears)) {
    const result = estimateRetirementTax(600000, 60000, 0, rules);
    assert.equal(result.taxBefore, result.taxAfter);
    assert.equal(result.saved, 0);
    assert.equal(result.effective, 0);
    assert.equal(result.discount, 0);
  }
});

test('the example crosses tax bands and uses the rates for the selected year', () => {
  for (const [year, before, after] of [[2027, 111307, 79817], [2026, 114032, 81672], [2025, 114032, 81672]]) {
    const result = estimateRetirementTax(600000, 60000, 100000, taxYears[year]);
    assert.equal(result.taxBefore, before);
    assert.equal(result.taxAfter, after);
    assert.equal(result.saved, before - after);
    assert.equal(result.effective, 100000 - result.saved);
  }
});

test('only the remaining annual allowance can generate an additional saving', () => {
  const current = estimateRetirementTax(2000000, 420000, 100000, taxYears[2027]);
  assert.equal(current.allowable, 430000);
  assert.equal(current.carried, 90000);
  assert.equal(current.saved, 4100);
  const prior = estimateRetirementTax(2000000, 420000, 100000, taxYears[2026]);
  assert.equal(prior.allowable, 350000);
  assert.equal(prior.saved, 0);
  assert.equal(prior.effective, 100000);
});

test('the salary limit and primary rebate apply independently', () => {
  const result = estimateRetirementTax(120000, 0, 50000, taxYears[2027]);
  assert.equal(result.allowable, 33000);
  assert.equal(result.carried, 17000);
  assert.equal(result.taxBefore, 3780);
  assert.equal(result.taxAfter, 0);
  assert.equal(result.saved, 3780);
  assert.equal(estimateRetirementTax(0, 0, 500, taxYears[2027]).saved, 0);
});
