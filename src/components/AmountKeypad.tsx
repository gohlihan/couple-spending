import { useEffect, useRef, useState, type FocusEvent, type PointerEvent, type Ref } from 'react';
import { FieldError } from './ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { cn } from '@/lib/utils';
import {
  applyAmountKey,
  displayAmountExpression,
  formatAmountValue,
  readAmountExpression,
  type AmountKey,
} from '../lib/amount-expression';

interface AmountKeypadProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  placeholder?: string;
}

interface KeyDef {
  key: AmountKey;
  label: string;
  aria: string;
  kind: 'digit' | 'operator' | 'equals' | 'utility';
  className?: string;
}

const KEYS: KeyDef[] = [
  { key: 'clear', label: 'C', aria: 'Clear', kind: 'utility', className: 'col-span-2' },
  { key: 'backspace', label: '⌫', aria: 'Delete', kind: 'utility', className: 'col-span-2' },
  { key: '7', label: '7', aria: '7', kind: 'digit' },
  { key: '8', label: '8', aria: '8', kind: 'digit' },
  { key: '9', label: '9', aria: '9', kind: 'digit' },
  { key: '/', label: '÷', aria: 'Divide', kind: 'operator' },
  { key: '4', label: '4', aria: '4', kind: 'digit' },
  { key: '5', label: '5', aria: '5', kind: 'digit' },
  { key: '6', label: '6', aria: '6', kind: 'digit' },
  { key: '*', label: '×', aria: 'Multiply', kind: 'operator' },
  { key: '1', label: '1', aria: '1', kind: 'digit' },
  { key: '2', label: '2', aria: '2', kind: 'digit' },
  { key: '3', label: '3', aria: '3', kind: 'digit' },
  { key: '-', label: '−', aria: 'Subtract', kind: 'operator' },
  { key: '0', label: '0', aria: '0', kind: 'digit' },
  { key: '.', label: '.', aria: 'Decimal point', kind: 'digit' },
  { key: 'equals', label: '=', aria: 'Equals', kind: 'equals' },
  { key: '+', label: '+', aria: 'Add', kind: 'operator' },
];

export default function AmountKeypad({
  id,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  required = false,
  placeholder = '0.00',
  ref,
}: AmountKeypadProps & { ref?: Ref<HTMLInputElement> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const freshRef = useRef(false);
  const valueRef = useRef(value);
  const blurTimer = useRef<number | null>(null);
  const keyGesture = useRef(false);
  const lastPressAt = useRef(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = `${id}-error`;
  const keypadId = `${id}-keypad`;
  valueRef.current = value;

  useEffect(() => {
    if (!open) return;
    containerRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  useEffect(
    () => () => {
      if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
    },
    [],
  );

  function assignInput(node: HTMLInputElement | null) {
    inputRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }

  function commit() {
    const expression = valueRef.current;
    const parsed = readAmountExpression(expression);
    if (parsed.ok) {
      const formatted = formatAmountValue(parsed.value);
      setError(null);
      if (formatted !== expression) {
        valueRef.current = formatted;
        onChange(formatted);
      }
      return;
    }
    setError(expression.trim() ? parsed.error : null);
  }

  function cancelBlurClose() {
    if (blurTimer.current === null) return;
    window.clearTimeout(blurTimer.current);
    blurTimer.current = null;
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    // A key tap blurs the amount on iPhone before the button is focused, and
    // relatedTarget is empty, so the keypad would close after every key.
    if (keyGesture.current) {
      keyGesture.current = false;
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    const container = containerRef.current;
    cancelBlurClose();
    blurTimer.current = window.setTimeout(() => {
      blurTimer.current = null;
      if (keyGesture.current || container?.contains(document.activeElement)) return;
      commit();
      setOpen(false);
    }, 0);
  }

  function press(key: AmountKey) {
    const now = performance.now();
    // One tap fires both touch and pointer events. Ignore the duplicate.
    if (now - lastPressAt.current < 40) return;
    lastPressAt.current = now;
    keyGesture.current = true;
    cancelBlurClose();
    const current = valueRef.current;
    const next = applyAmountKey(current, key, { fresh: freshRef.current });
    freshRef.current = next.evaluated;
    valueRef.current = next.expression;
    setError(next.error);
    if (next.expression !== current) onChange(next.expression);
    inputRef.current?.focus({ preventScroll: true });
    window.setTimeout(() => {
      keyGesture.current = false;
    }, 200);
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>, key: AmountKey) {
    if (event.pointerType !== 'touch') event.preventDefault();
    press(key);
  }

  return (
    <div ref={containerRef} onBlur={handleBlur}>
      <InputGroup>
        <InputGroupAddon aria-hidden="true">RM</InputGroupAddon>
        <InputGroupInput
          ref={assignInput}
          id={id}
          type="text"
          inputMode="none"
          readOnly
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={displayAmountExpression(value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-expanded={open}
          aria-controls={open ? keypadId : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
        />
      </InputGroup>
      {open && !disabled && (
        <div
          id={keypadId}
          role="group"
          aria-label="Amount keypad"
          className="mt-2 grid grid-cols-4 gap-2"
        >
          {KEYS.map((key) => (
            <button
              key={key.aria}
              type="button"
              aria-label={key.aria}
              className={cn(
                'min-h-12 rounded-[14px] text-base font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                key.className,
                key.kind === 'digit' && 'border border-input bg-background text-foreground',
                key.kind === 'utility' && 'bg-secondary text-foreground',
                key.kind === 'operator' && 'bg-accent text-accent-foreground',
                key.kind === 'equals' && 'bg-primary text-primary-foreground',
              )}
              onPointerDown={(event) => handlePointerDown(event, key.key)}
              onTouchStart={() => press(key.key)}
              onKeyDown={(event) => {
                if (event.repeat) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                press(key.key);
              }}
            >
              {key.label}
            </button>
          ))}
        </div>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
