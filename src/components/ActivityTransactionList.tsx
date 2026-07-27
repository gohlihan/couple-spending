import { useRef, useState } from 'react';
import type { Transaction } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import { shortId, type MemberNames } from '../lib/members';
import { groupTransactionsByDay } from '../lib/statistics';

const DATE_LABEL = new Intl.DateTimeFormat('en-MY', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
});
const TIME_LABEL = new Intl.DateTimeFormat('en-MY', {
  hour: 'numeric',
  minute: '2-digit',
});

interface ActivityTransactionListProps {
  transactions: Transaction[];
  memberNames: MemberNames;
  onOpen: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

function titleFor(transaction: Transaction): string {
  return transaction.note?.trim() || transaction.chip || 'Spending';
}

function iconFor(transaction: Transaction): string {
  const icon: Record<string, string> = { eat: 'E', shop: 'S', petrol: 'P', bills: 'B', fun: 'F' };
  return transaction.chip
    ? (icon[transaction.chip] ?? transaction.chip[0]?.toUpperCase() ?? '•')
    : '•';
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

function SwipeableTransactionRow({
  transaction,
  memberName,
  onOpen,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  memberName: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [swiped, setSwiped] = useState(false);
  const startX = useRef<number | null>(null);
  const moved = useRef(false);

  function resetPointer() {
    startX.current = null;
  }

  return (
    <li className={`swipe-transaction${swiped ? ' is-swiped' : ''}`}>
      <div className="swipe-actions" aria-hidden={!swiped}>
        <button
          type="button"
          className="swipe-action-edit"
          tabIndex={swiped ? 0 : -1}
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className="swipe-action-delete"
          tabIndex={swiped ? 0 : -1}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
      <button
        type="button"
        className="activity-transaction-row"
        aria-label={`${titleFor(transaction)}, ${formatCurrency(transaction.amount)}. Open details.`}
        onPointerDown={(event) => {
          startX.current = event.clientX;
          moved.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (startX.current === null) return;
          const delta = event.clientX - startX.current;
          if (Math.abs(delta) > 8) moved.current = true;
          if (delta < -42) setSwiped(true);
          if (delta > 26) setSwiped(false);
        }}
        onPointerUp={resetPointer}
        onPointerCancel={resetPointer}
        onClick={() => {
          if (moved.current || swiped) {
            moved.current = false;
            setSwiped(false);
            return;
          }
          onOpen();
        }}
      >
        <span className="transaction-category-icon" aria-hidden="true">
          {iconFor(transaction)}
        </span>
        <span className="activity-transaction-copy">
          <span className="transaction-row-title">{titleFor(transaction)}</span>
          <span className="transaction-row-meta">
            {TIME_LABEL.format(new Date(transaction.spent_at))} · {memberName}
          </span>
        </span>
        <span className="transaction-row-amount">{formatCurrency(transaction.amount)}</span>
      </button>
    </li>
  );
}

/** Month activity grouped by calendar day, with a touch-friendly left swipe tray. */
export default function ActivityTransactionList({
  transactions,
  memberNames,
  onOpen,
  onEdit,
  onDelete,
}: ActivityTransactionListProps) {
  const groups = groupTransactionsByDay(transactions);

  if (groups.length === 0) {
    return <p className="activity-empty">No transactions for this month yet.</p>;
  }

  return (
    <div className="activity-day-groups">
      {groups.map((group) => (
        <section
          key={group.date}
          className="activity-day-group"
          aria-label={DATE_LABEL.format(dateFromKey(group.date))}
        >
          <p className="activity-date-label">{DATE_LABEL.format(dateFromKey(group.date))}</p>
          <ol className="activity-transaction-list">
            {group.transactions.map((transaction) => (
              <SwipeableTransactionRow
                key={transaction.id}
                transaction={transaction}
                memberName={memberNames[transaction.created_by] ?? shortId(transaction.created_by)}
                onOpen={() => onOpen(transaction)}
                onEdit={() => onEdit(transaction)}
                onDelete={() => onDelete(transaction)}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
