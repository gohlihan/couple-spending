import { useEffect, useState, type FormEvent } from 'react';
import type { Budget } from '../lib/db';
import { saveBudget } from '../lib/budget';
import { useAuth } from '../lib/use-auth';

interface BudgetSettingsProps {
  budget: Budget | null;
}

export default function BudgetSettings({ budget }: BudgetSettingsProps) {
  const { user, householdId } = useAuth();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (budget) setAmount(String(budget.amount));
  }, [budget]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedAmount = amount.trim();
    const numericAmount = Number(trimmedAmount);

    if (!trimmedAmount || !Number.isFinite(numericAmount) || numericAmount < 0) {
      setError('Enter a valid amount of zero or more.');
      setMessage(null);
      return;
    }

    if (!user || !householdId) {
      setError('You must be signed in to a household before changing the budget.');
      setMessage(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await saveBudget(numericAmount, { user, householdId });
      setMessage('Budget saved locally.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save budget.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="budget-card" aria-labelledby="budget-settings-title">
      <h2 id="budget-settings-title">Budget settings</h2>
      <p className="muted">Set the shared monthly budget. It carries forward until changed.</p>
      <form className="transaction-form" onSubmit={handleSubmit}>
        <label className="field" htmlFor="budget-amount">
          <span className="field-label">Monthly amount (RM)</span>
          <span className="currency-input">
            <span className="currency-prefix" aria-hidden="true">
              RM
            </span>
            <input
              id="budget-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="100.00"
              disabled={submitting}
              autoFocus
            />
          </span>
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
          {submitting ? 'Saving…' : 'Save budget'}
        </button>
      </form>
    </section>
  );
}
