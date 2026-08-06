import { useState, type FormEvent } from 'react';
import PayerSelect from '../components/PayerSelect';
import type { PlannedItem } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import { shortId, type MemberNames, useHouseholdMemberRoster } from '../lib/members';
import {
  addPlannedItem,
  completePlannedItem,
  removePlannedItem,
  updatePlannedItem,
  usePlannedItems,
} from '../lib/planned-items';
import { useAuth } from '../lib/use-auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Button } from '../components/ui/button';
import { Field, FieldError, FieldLabel } from '../components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../components/ui/input-group';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';

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
        <Button
          type="button"
          variant="link"
          size="sm"
          className="sheet-close-button"
          onClick={onDone}
        >
          Cancel
        </Button>
      </div>
      <form className="transaction-form" onSubmit={submit}>
        <Field>
          <FieldLabel htmlFor="plan-title">What do you need?</FieldLabel>
          <input
            className="ui-native-input"
            id="plan-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Groceries"
            required
            disabled={submitting}
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-amount">Estimated amount</FieldLabel>
          <InputGroup>
            <InputGroupAddon aria-hidden="true">RM</InputGroupAddon>
            <InputGroupInput
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
          </InputGroup>
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-date">
            Buy by <span className="optional">(optional)</span>
          </FieldLabel>
          <input
            className="ui-native-input"
            id="plan-date"
            type="date"
            value={plannedFor}
            onChange={(event) => setPlannedFor(event.target.value)}
            disabled={submitting}
          />
        </Field>
        {error && <FieldError className="form-message">{error}</FieldError>}
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : item ? 'Save changes' : 'Add item'}
        </Button>
      </form>
    </section>
  );
}

export default function Plan({ memberNames }: { memberNames: MemberNames }) {
  const { user, displayName, householdId } = useAuth();
  const members = useHouseholdMemberRoster(householdId);
  const items = usePlannedItems(householdId);
  const [formItem, setFormItem] = useState<PlannedItem | null | undefined>(undefined);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [completionItem, setCompletionItem] = useState<PlannedItem | null>(null);
  const [completionPayerId, setCompletionPayerId] = useState('');
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [removeItem, setRemoveItem] = useState<PlannedItem | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const activeItems = items.filter((item) => !item.completed_at);
  const historyItems = items.filter((item) => item.completed_at);

  function beginCompletion(item: PlannedItem) {
    setCompletionItem(item);
    setCompletionPayerId(user?.id ?? item.created_by);
    setCompletionError(null);
    setMessage(null);
  }

  function cancelCompletion() {
    if (busyItemId) return;
    setCompletionItem(null);
    setCompletionError(null);
  }

  async function complete() {
    if (!completionItem) return;
    setBusyItemId(completionItem.id);
    setCompletionError(null);
    try {
      await completePlannedItem(completionItem, { user, householdId }, completionPayerId);
      setCompletionItem(null);
      setMessage(`${completionItem.title} was added to spending.`);
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : 'Could not complete this item.');
    } finally {
      setBusyItemId(null);
    }
  }

  async function confirmRemove() {
    if (!removeItem) return;
    setBusyItemId(removeItem.id);
    setRemoveError(null);
    setMessage(null);
    try {
      await removePlannedItem(removeItem, { user, householdId });
      setRemoveItem(null);
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : 'Could not remove this item.');
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="view-add-button"
          onClick={() => setFormItem(null)}
        >
          Add item
        </Button>
      </header>

      <Sheet
        open={formItem !== undefined}
        onOpenChange={(open) => {
          if (!open) setFormItem(undefined);
        }}
      >
        {formItem !== undefined && (
          <SheetContent side="bottom" className="sheet" aria-describedby="plan-form-description">
            <SheetHeader className="sr-only">
              <SheetTitle>{formItem ? 'Edit planned item' : 'Add planned item'}</SheetTitle>
              <SheetDescription id="plan-form-description">
                Add or update an item in your shared spending plan.
              </SheetDescription>
            </SheetHeader>
            <PlanItemForm item={formItem} onDone={() => setFormItem(undefined)} />
          </SheetContent>
        )}
      </Sheet>
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
                  onChange={() => beginCompletion(item)}
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
                    onClick={() => {
                      setRemoveError(null);
                      setRemoveItem(item);
                    }}
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

      <Sheet
        open={Boolean(completionItem)}
        onOpenChange={(open) => {
          if (!open) cancelCompletion();
        }}
      >
        {completionItem && (
          <SheetContent
            side="bottom"
            className="sheet"
            aria-describedby="complete-plan-description"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Move planned item to spending</SheetTitle>
              <SheetDescription id="complete-plan-description">
                Choose who paid before adding this planned item to spending.
              </SheetDescription>
            </SheetHeader>
            <section className="plan-form-card" aria-labelledby="complete-plan-title">
              <p className="section-eyebrow">Move to spending</p>
              <h2 id="complete-plan-title">{completionItem.title}</h2>
              <p className="muted">
                {formatCurrency(completionItem.amount)} will be added to this month’s spending.
              </p>
              <form
                className="transaction-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void complete();
                }}
              >
                <PayerSelect
                  id="completion-payer"
                  value={completionPayerId}
                  members={members}
                  currentUserId={user?.id ?? ''}
                  currentUserName={displayName}
                  additionalUserIds={[completionItem.created_by]}
                  disabled={Boolean(busyItemId)}
                  onChange={setCompletionPayerId}
                />
                {completionError && (
                  <FieldError className="form-message">{completionError}</FieldError>
                )}
                <Button className="w-full" type="submit" disabled={Boolean(busyItemId)}>
                  {busyItemId ? 'Saving…' : 'Mark as purchased'}
                </Button>
              </form>
            </section>
          </SheetContent>
        )}
      </Sheet>

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

      <AlertDialog
        open={Boolean(removeItem)}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveItem(null);
            setRemoveError(null);
          }
        }}
      >
        {removeItem && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from plan?</AlertDialogTitle>
              <AlertDialogDescription>
                “{removeItem.title}” will be removed from your shared shopping plan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {removeError && <FieldError>{removeError}</FieldError>}
            <AlertDialogFooter>
              <AlertDialogCancel>Keep item</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void confirmRemove();
                }}
              >
                Remove item
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </section>
  );
}
