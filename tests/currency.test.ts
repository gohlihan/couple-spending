import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency } from '../src/lib/currency.ts';

test('formats user-facing amounts as Malaysian ringgit', () => {
  assert.equal(formatCurrency(100), 'RM 100.00');
  assert.equal(formatCurrency(12.5), 'RM 12.50');
});
