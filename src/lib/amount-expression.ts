export type AmountKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '.'
  | '+'
  | '-'
  | '*'
  | '/'
  | 'backspace'
  | 'clear'
  | 'equals';

export type AmountKeyResult = {
  expression: string;
  error: string | null;
  /** True after equals resolves, so the next digit starts a new amount. */
  evaluated: boolean;
};

type EvaluateAmountResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'incomplete' | 'divide-by-zero' | 'invalid' };

type Operator = '+' | '-' | '*' | '/';
type Token = { type: 'num'; value: number } | { type: 'op'; op: Operator };

const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const OPERATORS = new Set<Operator>(['+', '-', '*', '/']);
const MAX_NUMBER_DIGITS = 12;

/** Show calculator glyphs while the stored expression stays ASCII. */
export function displayAmountExpression(expression: string): string {
  return expression.replaceAll('*', '×').replaceAll('/', '÷').replaceAll('-', '−');
}

export function formatAmountValue(value: number): string {
  const rounded = roundMoney(value);
  if (!Number.isFinite(rounded)) return '';
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return normalized.toFixed(2).replace(/\.?0+$/, '');
}

export function evaluateAmountExpression(expression: string): EvaluateAmountResult {
  const normalized = expression
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('−', '-')
    .replace(/\s+/g, '');
  if (!normalized) return { ok: false, reason: 'empty' };

  const scanned = tokenize(normalized);
  if ('error' in scanned) return { ok: false, reason: scanned.error };
  const { tokens } = scanned;
  if (tokens.length === 0) return { ok: false, reason: 'empty' };
  if (tokens[0].type === 'op' || tokens[tokens.length - 1].type === 'op') {
    return { ok: false, reason: 'incomplete' };
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const expectNumber = index % 2 === 0;
    if (expectNumber && tokens[index].type !== 'num') return { ok: false, reason: 'invalid' };
    if (!expectNumber && tokens[index].type !== 'op') return { ok: false, reason: 'invalid' };
  }

  try {
    const value = evaluateTokens(tokens);
    if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
    return { ok: true, value: roundMoney(value) };
  } catch (error) {
    if (error instanceof Error && error.message === 'divide-by-zero') {
      return { ok: false, reason: 'divide-by-zero' };
    }
    return { ok: false, reason: 'invalid' };
  }
}

export function readAmountExpression(
  expression: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const result = evaluateAmountExpression(expression);
  if (result.ok) return { ok: true, value: result.value };
  return { ok: false, error: messageFor(result.reason) };
}

export function applyAmountKey(
  expression: string,
  key: AmountKey,
  options?: { fresh?: boolean },
): AmountKeyResult {
  const fresh = options?.fresh ?? false;
  if (key === 'clear') return { expression: '', error: null, evaluated: false };
  if (key === 'backspace') {
    return { expression: expression.slice(0, -1), error: null, evaluated: false };
  }
  if (key === 'equals') {
    const result = evaluateAmountExpression(expression);
    if (!result.ok) {
      return {
        expression,
        error: result.reason === 'empty' ? null : messageFor(result.reason),
        evaluated: false,
      };
    }
    return { expression: formatAmountValue(result.value), error: null, evaluated: true };
  }
  if (DIGITS.has(key)) {
    return {
      expression: fresh ? key : appendDigit(expression, key),
      error: null,
      evaluated: false,
    };
  }
  if (key === '.') {
    return {
      expression: fresh ? '0.' : appendDecimal(expression),
      error: null,
      evaluated: false,
    };
  }
  if (key === '+' || key === '-' || key === '*' || key === '/') {
    return { expression: appendOperator(expression, key), error: null, evaluated: false };
  }
  return { expression, error: null, evaluated: false };
}

function messageFor(reason: Exclude<EvaluateAmountResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'empty':
      return 'Enter an amount.';
    case 'incomplete':
      return 'Finish the calculation.';
    case 'divide-by-zero':
      return 'Cannot divide by zero.';
    case 'invalid':
      return 'Enter a valid amount.';
    default:
      return 'Enter a valid amount.';
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function tokenize(input: string): { tokens: Token[] } | { error: 'incomplete' | 'invalid' } {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ type: 'op', op: char });
      index += 1;
      continue;
    }
    if (char !== '.' && (char < '0' || char > '9')) return { error: 'invalid' };

    const start = index;
    let sawDigit = false;
    let sawDot = false;
    while (index < input.length) {
      const current = input[index];
      if (current >= '0' && current <= '9') {
        sawDigit = true;
        index += 1;
        continue;
      }
      if (current === '.' && !sawDot) {
        sawDot = true;
        index += 1;
        continue;
      }
      break;
    }
    if (!sawDigit) return { error: 'incomplete' };
    if (input[index - 1] === '.') {
      return { error: index < input.length ? 'invalid' : 'incomplete' };
    }
    const value = Number(input.slice(start, index));
    if (!Number.isFinite(value)) return { error: 'invalid' };
    tokens.push({ type: 'num', value });
  }
  return { tokens };
}

function evaluateTokens(tokens: Token[]): number {
  const collapsed: Token[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'op' && (token.op === '*' || token.op === '/')) {
      const left = collapsed.pop();
      const right = tokens[index + 1];
      if (!left || left.type !== 'num' || !right || right.type !== 'num') {
        throw new Error('invalid');
      }
      if (token.op === '/' && right.value === 0) throw new Error('divide-by-zero');
      const value = token.op === '*' ? left.value * right.value : left.value / right.value;
      collapsed.push({ type: 'num', value });
      index += 1;
      continue;
    }
    collapsed.push(token);
  }

  const first = collapsed[0];
  if (!first || first.type !== 'num') throw new Error('invalid');
  let result = first.value;
  for (let index = 1; index < collapsed.length; index += 2) {
    const operator = collapsed[index];
    const right = collapsed[index + 1];
    if (!operator || operator.type !== 'op' || !right || right.type !== 'num') {
      throw new Error('invalid');
    }
    result = operator.op === '+' ? result + right.value : result - right.value;
  }
  return result;
}

function currentNumber(expression: string): string {
  const match = /(?:^|[+\-*/])(\d*\.?\d*)$/.exec(expression);
  return match?.[1] ?? '';
}

function appendDigit(expression: string, digit: string): string {
  const number = currentNumber(expression);
  if (number.replace('.', '').length >= MAX_NUMBER_DIGITS) return expression;
  if (number === '0') return expression.slice(0, -1) + digit;
  return expression + digit;
}

function appendDecimal(expression: string): string {
  const number = currentNumber(expression);
  if (number.includes('.')) return expression;
  if (!number) return `${expression}0.`;
  return `${expression}.`;
}

function appendOperator(expression: string, operator: Operator): string {
  if (!expression) return '';
  if (OPERATORS.has(expression.at(-1) as Operator)) return expression.slice(0, -1) + operator;
  if (expression.endsWith('.')) return expression.slice(0, -1) + operator;
  return expression + operator;
}
