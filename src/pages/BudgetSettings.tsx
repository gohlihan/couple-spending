import { useEffect, useState, type FormEvent } from 'react';
import type { Budget } from '../lib/db';
import { saveBudget } from '../lib/budget';
import { useAuth } from '../lib/use-auth';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Field, FieldLabel } from '../components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../components/ui/input-group';

interface BudgetSettingsProps {
  budget: Budget | null;
}

export default function BudgetSettings({ budget }: BudgetSettingsProps) {
  const { user, householdId } = useAuth();
  const [amount, setAmount] = useState('');
  // A hydration/realtime update can arrive while the user is entering a new
  // amount. Keep their in-progress value authoritative until they save.
  const [isDirty, setIsDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!budget) return;
    if (!isDirty) {
      setAmount(String(budget.amount));
    } else if (Number(amount) === budget.amount) {
      // The saved local value arrived; accept future remote updates again.
      setIsDirty(false);
    }
  }, [amount, budget, isDirty]);

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
    <Card as="section" className="budget-card" aria-labelledby="budget-settings-title">
      <h2 id="budget-settings-title">Budget settings</h2>
      <p className="muted">Set the shared monthly budget. It carries forward until changed.</p>
      <form className="transaction-form" onSubmit={handleSubmit}>
        <Field>
          <FieldLabel htmlFor="budget-amount">Monthly amount</FieldLabel>
          <InputGroup>
            <InputGroupAddon aria-hidden="true">RM</InputGroupAddon>
            <InputGroupInput
              id="budget-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => {
                setIsDirty(true);
                setAmount(event.target.value);
              }}
              placeholder="100.00"
              disabled={submitting}
              autoFocus
            />
          </InputGroup>
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {message && (
          <Alert variant="success" role="status">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save budget'}
        </Button>
      </form>
    </Card>
  );
}
