import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePasswordChange } from '../src/lib/password.ts';

test('rejects short passwords', () => {
  assert.equal(validatePasswordChange('12345', '12345'), 'Password must be at least 6 characters.');
});

test('rejects mismatched passwords', () => {
  assert.equal(validatePasswordChange('secret1', 'secret2'), 'Passwords do not match.');
});

test('accepts matching passwords of the minimum length', () => {
  assert.equal(validatePasswordChange('secret1', 'secret1'), null);
});
