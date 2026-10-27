import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAmountKey,
  displayAmountExpression,
  evaluateAmountExpression,
  formatAmountValue,
  readAmountExpression,
} from '../src/lib/amount-expression.ts';

test('multiplication and division bind tighter than addition and subtraction', () => {
  assert.deepEqual(evaluateAmountExpression('12.50+3*2'), { ok: true, value: 18.5 });
  assert.deepEqual(evaluateAmountExpression('2+3*4'), { ok: true, value: 14 });
  assert.deepEqual(evaluateAmountExpression('2*3+4'), { ok: true, value: 10 });
  assert.deepEqual(evaluateAmountExpression('100-50/2'), { ok: true, value: 75 });
  assert.deepEqual(evaluateAmountExpression('8-3+2'), { ok: true, value: 7 });
  assert.deepEqual(evaluateAmountExpression('8/4/2'), { ok: true, value: 1 });
});

test('rounds money to the nearest cent', () => {
  assert.deepEqual(evaluateAmountExpression('10/3'), { ok: true, value: 3.33 });
  assert.deepEqual(evaluateAmountExpression('0.1+0.2'), { ok: true, value: 0.3 });
  assert.equal(formatAmountValue(18.5), '18.5');
  assert.equal(formatAmountValue(18), '18');
  assert.equal(formatAmountValue(10.1), '10.1');
});

test('rejects incomplete expressions, divide by zero, and junk', () => {
  assert.equal(evaluateAmountExpression('').ok, false);
  assert.equal(evaluateAmountExpression('12+').reason, 'incomplete');
  assert.equal(evaluateAmountExpression('12.').reason, 'incomplete');
  assert.equal(evaluateAmountExpression('10/0').reason, 'divide-by-zero');
  assert.equal(evaluateAmountExpression('12..5').reason, 'invalid');
  assert.equal(readAmountExpression('10/0').error, 'Cannot divide by zero.');
  assert.equal(readAmountExpression('12+').error, 'Finish the calculation.');
});

test('accepts calculator glyphs and plain amounts', () => {
  assert.deepEqual(evaluateAmountExpression('12.50+3×2'), { ok: true, value: 18.5 });
  assert.deepEqual(evaluateAmountExpression('10÷4'), { ok: true, value: 2.5 });
  assert.equal(displayAmountExpression('12.50+3*2'), '12.50+3×2');
  assert.deepEqual(readAmountExpression('15'), { ok: true, value: 15 });
});

test('key presses build, correct, and resolve an expression', () => {
  let expression = '';
  let fresh = false;
  for (const key of ['1', '2', '.', '5', '0', '+', '3', '*', '2', 'equals'] as const) {
    const next = applyAmountKey(expression, key, { fresh });
    expression = next.expression;
    fresh = next.evaluated;
    assert.equal(next.error, null);
  }
  assert.equal(expression, '18.5');
  assert.equal(fresh, true);

  const replaced = applyAmountKey(expression, '4', { fresh });
  assert.equal(replaced.expression, '4');

  const continued = applyAmountKey(expression, '+', { fresh: true });
  assert.equal(continued.expression, '18.5+');
});

test('ignores a second decimal, a leading operator, and extra zeros', () => {
  assert.equal(applyAmountKey('1.2', '.').expression, '1.2');
  assert.equal(applyAmountKey('', '+').expression, '');
  assert.equal(applyAmountKey('0', '5').expression, '5');
  assert.equal(applyAmountKey('12+', '*').expression, '12*');
  assert.equal(applyAmountKey('12.', '+').expression, '12+');
  assert.equal(applyAmountKey('12+', 'backspace').expression, '12');
  assert.equal(applyAmountKey('12+3', 'clear').expression, '');
});

test('equals keeps the expression and explains why it cannot resolve', () => {
  const divided = applyAmountKey('10/0', 'equals');
  assert.equal(divided.expression, '10/0');
  assert.equal(divided.error, 'Cannot divide by zero.');
  assert.equal(divided.evaluated, false);

  const unfinished = applyAmountKey('12+', 'equals');
  assert.equal(unfinished.error, 'Finish the calculation.');
});
