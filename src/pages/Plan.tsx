import { useState, type FormEvent } from 'react';
import type { PlannedItem } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import { shortId, type MemberNames } from '../lib/members';
import {
  addPlannedItem,
  completePlannedItem,
  removePlannedItem,
  updatePlannedItem,
  usePlannedItems,
} from '../lib/planned-items';
import { useAuth } from '../lib/use-auth';

const DATE_LABEL = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatPlannedDate(value: string | null): string {
  return value ? DATE_LABEL.format(new Date(`${value}T12:00:00`)) : 'Any time';
}

function PlanItemForm({ item, onDone }: { item: PlannedItem | null; onDone: () => void }) {
  const { user, householdId } = useAuth();
  const [title, setTitle] = useState(item?.title ?? '');
  const [amount, setAmount] = useState(item ? String(item.amount) : '');
  const [plannedFor, setPlannedFor] = useState(item?.planned_for ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    setSubmitting(true);
    setError(null);
    try {
      const input = { title, amount: numericAmount, plannedFor };
      if (item) await updatePlannedItem(item, input, { user, householdId });
      else await addPlannedItem(input, { user, householdId });
      onDone();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save this item.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="plan-form-card" aria-labelledby="plan-form-title">
      <div className="plan-form-heading">
        <h2 id="plan-form-title">{item ? 'Edit item' : 'Add to plan'}</h2>
        <button type="button" className="sheet-close-button" onClick={onDone}>
          Cancel
        </button>
      </div>
      <form className="transaction-form" onSubmit={submit}>
        <label className="field" htmlFor="plan-title">
          <span className="field-label">What do you need?</span>
          <input
            id="plan-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Groceries"
            required
            disabled={submitting}
            autoFocus
          />
        </label>
        <label className="field" htmlFor="plan-amount">
          <span className="field-label">Estimated amount (RM)</span>
          <span className="currency-input">
            <span className="currency-prefix" aria-hidden="true">
              RM
            </span>
            <input
              id="plan-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              required
              disabled={submitting}
            />
          </span>
        </label>
        <label className="field" htmlFor="plan-date">
          <span className="field-label">
            Buy by <span className="optional">(optional)</span>
          </span>
          <input
            id="plan-date"
            type="date"
            value={plannedFor}
            onChange={(event) => setPlannedFor(event.target.value)}
            disabled={submitting}
          />
        </label>
        {error && (
          <p className="form-message form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : item ? 'Save changes' : 'Add item'}
        </button>
      </form>
    </section>
  );
}

export default function Plan({ memberNames }: { memberNames: MemberNames }) {
  const { user, householdId } = useAuth();
  const items = usePlannedItems(householdId);
  const [formItem, setFormItem] = useState<PlannedItem | null | undefined>(undefined);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const activeItems = items.filter((item) => !item.completed_at);
  const historyItems = items.filter((item) => item.completed_at);

  async function complete(item: PlannedItem) {
    setBusyItemId(item.id);
    setMessage(null);
    try {
      await completePlannedItem(item, { user, householdId });
      setMessage(`${item.title} was added to spending.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not complete this item.');
    } finally {
      setBusyItemId(null);
    }
  }

  async function remove(item: PlannedItem) {
    if (!window.confirm(`Remove “${item.title}” from your plan?`)) return;
    setBusyItemId(item.id);
    setMessage(null);
    try {
      await removePlannedItem(item, { user, householdId });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove this item.');
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <section className="plan-screen" aria-labelledby="plan-title">
      <header className="view-header">
        <div>
          <p className="section-eyebrow">Shared list</p>
          <h1 id="plan-title">Plan</h1>
          <p>Set aside what you need before it becomes spending.</p>
        </div>
        <button type="button" className="view-add-button" onClick={() => setFormItem(null)}>
          Add item
        </button>
      </header>

      {formItem !== undefined && (
        <PlanItemForm item={formItem} onDone={() => setFormItem(undefined)} />
      )}
      {message && (
        <p className="plan-message" role="status">
          {message}
        </p>
      )}

      <section className="plan-list-section" aria-labelledby="plan-active-title">
        <div className="section-title-row">
          <h2 id="plan-active-title">To buy</h2>
          <span>{activeItems.length}</span>
        </div>
        {activeItems.length === 0 ? (
          <p className="plan-empty">Nothing planned yet. Add the next thing you need.</p>
        ) : (
          <ol className="plan-item-list">
            {activeItems.map((item) => (
              <li key={item.id} className="plan-item">
                <input
                  type="checkbox"
                  aria-label={`Mark ${item.title} as purchased`}
                  checked={false}
                  disabled={busyItemId === item.id}
                  onChange={() => void complete(item)}
                />
                <div className="plan-item-copy">
                  <p>{item.title}</p>
                  <span>
                    {formatPlannedDate(item.planned_for)} ·{' '}
                    {memberNames[item.created_by] ?? shortId(item.created_by)}
                  </span>
                </div>
                <span className="plan-item-amount">{formatCurrency(item.amount)}</span>
                <div className="plan-item-actions">
                  <button
                    type="button"
                    onClick={() => setFormItem(item)}
                    disabled={busyItemId === item.id}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(item)}
                    disabled={busyItemId === item.id}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="plan-list-section plan-history" aria-labelledby="plan-history-title">
        <div className="section-title-row">
          <h2 id="plan-history-title">History</h2>
          <span>{historyItems.length}</span>
        </div>
        {historyItems.length === 0 ? (
          <p className="plan-empty">Checked items move here with their spending record.</p>
        ) : (
          <ol className="plan-item-list">
            {historyItems.map((item) => (
              <li key={item.id} className="plan-item plan-item-completed">
                <input type="checkbox" checked readOnly aria-label={`${item.title} purchased`} />
                <div className="plan-item-copy">
                  <p>{item.title}</p>
                  <span>
                    Bought {item.completed_at ? DATE_LABEL.format(new Date(item.completed_at)) : ''}{' '}
                    ·{' '}
                    {memberNames[item.completed_by ?? item.created_by] ??
                      shortId(item.completed_by ?? item.created_by)}
                  </span>
                </div>
                <span className="plan-item-amount">{formatCurrency(item.amount)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
