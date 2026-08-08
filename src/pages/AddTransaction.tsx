import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Transaction } from '../lib/db';
import PayerSelect from '../components/PayerSelect';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Field, FieldLabel } from '../components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../components/ui/input-group';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { useHouseholdMemberRoster } from '../lib/members';
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
  const { user, displayName, householdId } = useAuth();
  const members = useHouseholdMemberRoster(householdId);
  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [spentAt, setSpentAt] = useState(() =>
    transaction ? localDateTimeValue(new Date(transaction.spent_at)) : localDateTimeValue(),
  );
  const [note, setNote] = useState(transaction?.note ?? '');
  const [chip, setChip] = useState(transaction?.chip ?? '');
  const [payerId, setPayerId] = useState(
    transaction?.payer_id || transaction?.created_by || user?.id || '',
  );
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
    setPayerId(transaction?.payer_id || transaction?.created_by || user?.id || '');
    setMessage(null);
    setError(null);
  }, [transaction, user?.id]);

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
        payerId,
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
        setPayerId(user?.id ?? '');
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
    <Card as="section" className="transaction-card" aria-labelledby="add-transaction-title">
      <h2 id="add-transaction-title">{editing ? 'Edit spending' : 'Add spending'}</h2>
      <form className="transaction-form" onSubmit={handleSubmit}>
        <Field>
          <FieldLabel htmlFor="transaction-amount">Amount</FieldLabel>
          <InputGroup>
            <InputGroupAddon aria-hidden="true">RM</InputGroupAddon>
            <InputGroupInput
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
          </InputGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="transaction-spent-at">When</FieldLabel>
          <Input
            id="transaction-spent-at"
            type="datetime-local"
            required
            value={spentAt}
            onChange={(event) => setSpentAt(event.target.value)}
            disabled={submitting}
          />
        </Field>

        <PayerSelect
          id="transaction-payer"
          value={payerId}
          members={members}
          currentUserId={user?.id ?? ''}
          currentUserName={displayName}
          additionalUserIds={transaction ? [transaction.created_by] : []}
          disabled={submitting}
          onChange={setPayerId}
        />

        <fieldset className="chip-fieldset" disabled={submitting}>
          <legend className="field-label">Quick tag</legend>
          <ToggleGroup
            type="single"
            value={chip}
            onValueChange={setChip}
            className="chip-row"
            aria-label="Quick tag"
          >
            {chips.map((option) => (
              <ToggleGroupItem
                key={option}
                value={option}
                aria-label={`Tag as ${option}`}
              >
                {option}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </fieldset>

        <Field>
          <FieldLabel htmlFor="transaction-note">
            Note <span className="optional">(optional)</span>
          </FieldLabel>
          <Textarea
            id="transaction-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What was this for?"
            rows={3}
            disabled={submitting}
          />
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
          {submitting ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
        </Button>
      </form>
    </Card>
  );
}
