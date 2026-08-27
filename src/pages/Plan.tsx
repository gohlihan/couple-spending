import { useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import PayerSelect from '../components/PayerSelect';
import type { PlannedItem, PlanningEvent } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import { shortId, type MemberNames, useHouseholdMemberRoster } from '../lib/members';
import {
  addPlannedItem,
  completePlannedItem,
  removePlannedItem,
  updatePlannedItem,
  usePlannedItems,
} from '../lib/planned-items';
import {
  addPlanningEvent,
  removePlanningEvent,
  updatePlanningEvent,
  usePlanningEvents,
} from '../lib/planning-events';
import { partitionItemsByEvent } from '../lib/planning-events-core';
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
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Field, FieldError, FieldLabel } from '../components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../components/ui/input-group';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
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

const DAY_MONTH_LABEL = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
});

function formatPlannedDate(value: string | null): string {
  return value ? DATE_LABEL.format(new Date(`${value}T12:00:00`)) : 'Any time';
}

function eventRangeLabel(event: PlanningEvent): string {
  if (!event.starts_on && !event.ends_on) return 'No dates';
  if (!event.starts_on || !event.ends_on) {
    return formatPlannedDate(event.starts_on ?? event.ends_on);
  }
  const startYear = event.starts_on.slice(0, 4);
  const end = DAY_MONTH_LABEL.format(new Date(`${event.ends_on}T12:00:00`));
  if (startYear === event.ends_on.slice(0, 4)) {
    return `${DAY_MONTH_LABEL.format(new Date(`${event.starts_on}T12:00:00`))} – ${end} ${startYear}`;
  }
  return `${formatPlannedDate(event.starts_on)} – ${formatPlannedDate(event.ends_on)}`;
}

function PlanItemForm({
  item,
  eventId,
  onDone,
}: {
  item: PlannedItem | null;
  eventId?: string | null;
  onDone: () => void;
}) {
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
      const input = { title, amount: numericAmount, plannedFor, eventId };
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
    <Card as="section" className="plan-form-card" aria-labelledby="plan-form-title">
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
          <Input
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
          <Input
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
    </Card>
  );
}

function EventForm({ event, onDone }: { event: PlanningEvent | null; onDone: () => void }) {
  const { user, householdId } = useAuth();
  const [title, setTitle] = useState(event?.title ?? '');
  const [startsOn, setStartsOn] = useState(event?.starts_on ?? '');
  const [endsOn, setEndsOn] = useState(event?.ends_on ?? '');
  const [note, setNote] = useState(event?.note ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input = { title, startsOn, endsOn, note };
      if (event) await updatePlanningEvent(event, input, { user, householdId });
      else await addPlanningEvent(input, { user, householdId });
      onDone();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save this event.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card as="section" className="plan-form-card" aria-labelledby="event-form-title">
      <div className="plan-form-heading">
        <h2 id="event-form-title">{event ? 'Edit event' : 'New event'}</h2>
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
          <FieldLabel htmlFor="event-title">What are you planning?</FieldLabel>
          <Input
            id="event-title"
            value={title}
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
            placeholder="e.g. Bali trip"
            required
            disabled={submitting}
            autoFocus
          />
        </Field>
        <div className="form-row-2col">
          <Field>
            <FieldLabel htmlFor="event-start">
              Start <span className="optional">(optional)</span>
            </FieldLabel>
            <Input
              id="event-start"
              type="date"
              value={startsOn}
              onChange={(changeEvent) => setStartsOn(changeEvent.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="event-end">
              End <span className="optional">(optional)</span>
            </FieldLabel>
            <Input
              id="event-end"
              type="date"
              value={endsOn}
              min={startsOn || undefined}
              onChange={(changeEvent) => setEndsOn(changeEvent.target.value)}
              disabled={submitting}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="event-note">
            Note <span className="optional">(optional)</span>
          </FieldLabel>
          <Textarea
            id="event-note"
            rows={2}
            value={note}
            onChange={(changeEvent) => setNote(changeEvent.target.value)}
            placeholder="Anything to remember?"
            disabled={submitting}
          />
        </Field>
        {error && <FieldError className="form-message">{error}</FieldError>}
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : event ? 'Save changes' : 'Create event'}
        </Button>
      </form>
    </Card>
  );
}

function PlanRow({
  item,
  memberNames,
  busy,
  onBeginCompletion,
  onEdit,
  onRemove,
}: {
  item: PlannedItem;
  memberNames: MemberNames;
  busy: boolean;
  onBeginCompletion: (item: PlannedItem) => void;
  onEdit: (item: PlannedItem) => void;
  onRemove: (item: PlannedItem) => void;
}) {
  return (
    <li className="plan-item">
      <span className="plan-checkbox-hit">
        <Checkbox
          className="plan-checkbox"
          aria-label={`Mark ${item.title} as purchased`}
          checked={false}
          disabled={busy}
          onCheckedChange={() => onBeginCompletion(item)}
        />
      </span>
      <div className="plan-item-copy">
        <p>{item.title}</p>
        <span>
          {formatPlannedDate(item.planned_for)} ·{' '}
          {memberNames[item.created_by] ?? shortId(item.created_by)}
        </span>
      </div>
      <span className="plan-item-amount">{formatCurrency(item.amount)}</span>
      <div className="plan-item-actions">
        <Button
          variant="link"
          size="sm"
          className="plan-item-action"
          type="button"
          onClick={() => onEdit(item)}
          disabled={busy}
        >
          Edit
        </Button>
        <Button
          variant="link"
          size="sm"
          className="plan-item-action plan-item-action-danger"
          type="button"
          onClick={() => onRemove(item)}
          disabled={busy}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}

export default function Plan({ memberNames }: { memberNames: MemberNames }) {
  const { user, displayName, householdId } = useAuth();
  const members = useHouseholdMemberRoster(householdId);
  const items = usePlannedItems(householdId);
  const events = usePlanningEvents(householdId);
  const [formState, setFormState] = useState<
    { item: PlannedItem | null; eventId: string | null } | undefined
  >(undefined);
  const [eventFormItem, setEventFormItem] = useState<PlanningEvent | null | undefined>(undefined);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [completionItem, setCompletionItem] = useState<PlannedItem | null>(null);
  const [completionPayerId, setCompletionPayerId] = useState('');
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [removeItem, setRemoveItem] = useState<PlannedItem | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeEvt, setRemoveEvt] = useState<PlanningEvent | null>(null);
  const [removeEvtError, setRemoveEvtError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Unassigned active items feed the general to-buy list; completed items from
  // every event still land in the shared history below.
  const { general, byEvent } = partitionItemsByEvent(items);
  const activeItems = general.filter((item) => !item.completed_at);
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

  async function confirmRemoveEvent() {
    if (!removeEvt) return;
    setRemoveEvtError(null);
    setMessage(null);
    try {
      const deletedId = removeEvt.id;
      await removePlanningEvent(removeEvt, { user, householdId });
      if (expandedEventId === deletedId) setExpandedEventId(null);
      setRemoveEvt(null);
    } catch (error) {
      setRemoveEvtError(error instanceof Error ? error.message : 'Could not delete this event.');
    }
  }

  function openItemForm(item: PlannedItem | null, eventId: string | null = null) {
    setFormState({ item, eventId });
  }

  const activeEventFormTitle =
    formState?.eventId && !formState.item
      ? (events.find((event) => event.id === formState.eventId)?.title ?? null)
      : null;

  return (
    <section className="plan-screen" aria-labelledby="plan-title">
      <header className="view-header">
        <div>
          <p className="section-eyebrow">Shared list</p>
          <h1 id="plan-title">Plan</h1>
          <p>Set aside what you need before it becomes spending.</p>
        </div>
        <div className="view-header-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="view-add-button"
            onClick={() => openItemForm(null)}
          >
            Add item
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="view-add-button"
            onClick={() => setEventFormItem(null)}
          >
            Add event
          </Button>
        </div>
      </header>

      <Sheet
        open={formState !== undefined}
        onOpenChange={(open) => {
          if (!open) setFormState(undefined);
        }}
      >
        {formState !== undefined && (
          <SheetContent
            side="bottom"
            className="sheet"
            showCloseButton={false}
            aria-describedby="plan-form-description"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>
                {formState.item
                  ? 'Edit planned item'
                  : activeEventFormTitle
                    ? `Add item to ${activeEventFormTitle}`
                    : 'Add planned item'}
              </SheetTitle>
              <SheetDescription id="plan-form-description">
                Add or update an item in your shared spending plan.
              </SheetDescription>
            </SheetHeader>
            <PlanItemForm
              item={formState.item}
              eventId={formState.eventId}
              onDone={() => setFormState(undefined)}
            />
          </SheetContent>
        )}
      </Sheet>

      <Sheet
        open={eventFormItem !== undefined}
        onOpenChange={(open) => {
          if (!open) setEventFormItem(undefined);
        }}
      >
        {eventFormItem !== undefined && (
          <SheetContent
            side="bottom"
            className="sheet"
            showCloseButton={false}
            aria-describedby="event-form-description"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{eventFormItem ? 'Edit event' : 'New event'}</SheetTitle>
              <SheetDescription id="event-form-description">
                Group planned purchases under a trip or project.
              </SheetDescription>
            </SheetHeader>
            <EventForm event={eventFormItem} onDone={() => setEventFormItem(undefined)} />
          </SheetContent>
        )}
      </Sheet>
      {message && (
        <Alert variant="success" className="plan-message" role="status">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <Card as="section" className="plan-list-section" aria-labelledby="plan-events-title">
        <div className="section-title-row">
          <h2 id="plan-events-title">Events</h2>
          <Badge variant="outline">{events.length}</Badge>
        </div>
        {events.length === 0 ? (
          <p className="plan-empty">Plan a trip or project, then add what you need for it.</p>
        ) : (
          <ol className="event-list">
            {events.map((event) => {
              const eventItems = byEvent.get(event.id) ?? [];
              const eventActive = eventItems.filter((item) => !item.completed_at);
              const estimated = eventActive.reduce((sum, item) => sum + item.amount, 0);
              const expanded = expandedEventId === event.id;
              return (
                <li key={event.id} className="event-entry">
                  <button
                    type="button"
                    className="event-row"
                    aria-expanded={expanded}
                    onClick={() => setExpandedEventId(expanded ? null : event.id)}
                  >
                    <span className="event-row-copy">
                      <p>{event.title}</p>
                      <span>
                        {eventActive.length} item{eventActive.length === 1 ? '' : 's'} ·{' '}
                        {formatCurrency(estimated)} est.
                      </span>
                    </span>
                    <span className="event-row-side">
                      <Badge variant="outline">{eventRangeLabel(event)}</Badge>
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={expanded ? 'event-chevron event-chevron-open' : 'event-chevron'}
                      />
                    </span>
                  </button>
                  {expanded && (
                    <div className="event-detail">
                      <div className="event-actions">
                        <Button
                          variant="link"
                          size="sm"
                          className="plan-item-action"
                          type="button"
                          onClick={() => setEventFormItem(event)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="link"
                          size="sm"
                          className="plan-item-action plan-item-action-danger"
                          type="button"
                          onClick={() => {
                            setRemoveEvtError(null);
                            setRemoveEvt(event);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                      {eventActive.length === 0 ? (
                        <p className="plan-empty">No items planned for this event yet.</p>
                      ) : (
                        <ol className="plan-item-list">
                          {eventActive.map((item) => (
                            <PlanRow
                              key={item.id}
                              item={item}
                              memberNames={memberNames}
                              busy={busyItemId === item.id}
                              onBeginCompletion={beginCompletion}
                              onEdit={(row) => openItemForm(row)}
                              onRemove={(row) => {
                                setRemoveError(null);
                                setRemoveItem(row);
                              }}
                            />
                          ))}
                        </ol>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="event-add-item-button"
                        type="button"
                        onClick={() => openItemForm(null, event.id)}
                      >
                        Add item to event
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card as="section" className="plan-list-section" aria-labelledby="plan-active-title">
        <div className="section-title-row">
          <h2 id="plan-active-title">To buy</h2>
          <Badge variant="outline">{activeItems.length}</Badge>
        </div>
        {activeItems.length === 0 ? (
          <p className="plan-empty">Nothing planned yet. Add the next thing you need.</p>
        ) : (
          <ol className="plan-item-list">
            {activeItems.map((item) => (
              <PlanRow
                key={item.id}
                item={item}
                memberNames={memberNames}
                busy={busyItemId === item.id}
                onBeginCompletion={beginCompletion}
                onEdit={(row) => openItemForm(row)}
                onRemove={(row) => {
                  setRemoveError(null);
                  setRemoveItem(row);
                }}
              />
            ))}
          </ol>
        )}
      </Card>

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
            <Card as="section" className="plan-form-card" aria-labelledby="complete-plan-title">
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
            </Card>
          </SheetContent>
        )}
      </Sheet>

      <Card
        as="section"
        className="plan-list-section plan-history"
        aria-labelledby="plan-history-title"
      >
        <div className="section-title-row">
          <h2 id="plan-history-title">History</h2>
          <Badge variant="outline">{historyItems.length}</Badge>
        </div>
        {historyItems.length === 0 ? (
          <p className="plan-empty">Checked items move here with their spending record.</p>
        ) : (
          <ol className="plan-item-list">
            {historyItems.map((item) => (
              <li key={item.id} className="plan-item plan-item-completed">
                <span className="plan-checkbox-hit">
                  <Checkbox
                    className="plan-checkbox"
                    checked
                    disabled
                    aria-label={`${item.title} purchased`}
                  />
                </span>
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
      </Card>

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

      <AlertDialog
        open={Boolean(removeEvt)}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveEvt(null);
            setRemoveEvtError(null);
          }
        }}
      >
        {removeEvt && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete event?</AlertDialogTitle>
              <AlertDialogDescription>
                “{removeEvt.title}” will be deleted. Its items move back to the general to-buy list;
                spending records are untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {removeEvtError && <FieldError>{removeEvtError}</FieldError>}
            <AlertDialogFooter>
              <AlertDialogCancel>Keep event</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void confirmRemoveEvent();
                }}
              >
                Delete event
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </section>
  );
}
