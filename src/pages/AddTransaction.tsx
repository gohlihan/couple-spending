import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Transaction } from '../lib/db';
import { addTransaction, updateTransaction } from '../lib/transactions';
import { useAuth } from '../lib/use-auth';

const chips = ['eat', 'shop', 'petrol', 'bills', 'fun'];

function localDateTimeValue(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

interface AddTransactionProps {
  transaction?: Transaction;
  onSaved?: (transaction: Transaction) => void;
}

/** One accessible form for both new spending and Phase-7 transaction edits. */
export default function AddTransaction({ transaction, onSaved }: AddTransactionProps) {
  const { user, householdId } = useAuth();
  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [spentAt, setSpentAt] = useState(() =>
    transaction ? localDateTimeValue(new Date(transaction.spent_at)) : localDateTimeValue(),
  );
  const [note, setNote] = useState(transaction?.note ?? '');
  const [chip, setChip] = useState(transaction?.chip ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(transaction);

  useEffect(() => {
    setAmount(transaction ? String(transaction.amount) : '');
    setSpentAt(
      transaction ? localDateTimeValue(new Date(transaction.spent_at)) : localDateTimeValue(),
    );
    setNote(transaction?.note ?? '');
    setChip(transaction?.chip ?? '');
    setMessage(null);
    setError(null);
  }, [transaction]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter an amount greater than zero.');
      setMessage(null);
      return;
    }

    const parsedSpentAt = new Date(spentAt);
    if (Number.isNaN(parsedSpentAt.getTime())) {
      setError('Choose a valid date and time.');
      setMessage(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const input = {
        amount: numericAmount,
        spentAt: parsedSpentAt.toISOString(),
        note,
        chip,
      };
      const saved = transaction
        ? await updateTransaction(transaction, input, { user, householdId })
        : await addTransaction(input, { user, householdId });

      if (editing) {
        setMessage('Transaction updated locally.');
        onSaved?.(saved);
      } else {
        setAmount('');
        setSpentAt(localDateTimeValue());
        setNote('');
        setChip('');
        setMessage('Transaction saved locally.');
        amountRef.current?.focus();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save transaction.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="transaction-card" aria-labelledby="add-transaction-title">
      <h2 id="add-transaction-title">{editing ? 'Edit spending' : 'Add spending'}</h2>
      <form className="transaction-form" onSubmit={handleSubmit}>
        <label className="field" htmlFor="transaction-amount">
          <span className="field-label">Amount (RM)</span>
          <span className="currency-input">
            <span className="currency-prefix" aria-hidden="true">
              RM
            </span>
            <input
              ref={amountRef}
              id="transaction-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              disabled={submitting}
            />
          </span>
        </label>

        <label className="field" htmlFor="transaction-spent-at">
          <span className="field-label">When</span>
          <input
            id="transaction-spent-at"
            type="datetime-local"
            required
            value={spentAt}
            onChange={(event) => setSpentAt(event.target.value)}
            disabled={submitting}
          />
        </label>

        <fieldset className="chip-fieldset" disabled={submitting}>
          <legend className="field-label">Quick tag</legend>
          <div className="chip-row">
            {chips.map((option) => (
              <button
                key={option}
                type="button"
                className={`chip-button${chip === option ? ' chip-button-selected' : ''}`}
                onClick={() => setChip(chip === option ? '' : option)}
                aria-pressed={chip === option}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field" htmlFor="transaction-note">
          <span className="field-label">
            Note <span className="optional">(optional)</span>
          </span>
          <input
            id="transaction-note"
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What was this for?"
            disabled={submitting}
          />
        </label>

        {error && (
          <p className="form-message form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form-message form-success" role="status">
            {message}
          </p>
        )}
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
        </button>
      </form>
    </section>
  );
}
