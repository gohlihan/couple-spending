import type { Transaction } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import { shortId, type MemberNames } from '../lib/members';
import { groupTransactionsByDay } from '../lib/statistics';
import { Badge } from './ui/badge';

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

function TransactionRow({
  transaction,
  payerName,
  onOpen,
}: {
  transaction: Transaction;
  payerName: string;
  onOpen: () => void;
}) {
  return (
    <li className="activity-transaction-item">
      <button
        type="button"
        className="activity-transaction-row"
        aria-label={`${titleFor(transaction)}, ${formatCurrency(transaction.amount)}. Open details.`}
        onClick={onOpen}
      >
        <span className="transaction-category-icon" aria-hidden="true">
          {iconFor(transaction)}
        </span>
        <span className="activity-transaction-copy">
          <span className="transaction-row-title">{titleFor(transaction)}</span>
          <span className="transaction-row-meta">
            {TIME_LABEL.format(new Date(transaction.spent_at))} · Paid by {payerName}
          </span>
        </span>
        <span className="transaction-row-amount">{formatCurrency(transaction.amount)}</span>
      </button>
    </li>
  );
}

/** Month activity grouped by calendar day. Tap a row to view details and actions. */
export default function ActivityTransactionList({
  transactions,
  memberNames,
  onOpen,
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
          <div className="activity-date-heading">
            <p className="activity-date-label">{DATE_LABEL.format(dateFromKey(group.date))}</p>
            <Badge variant="positive" className="activity-date-total">
              {formatCurrency(group.total)}
            </Badge>
          </div>
          <ol className="activity-transaction-list">
            {group.transactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                payerName={
                  memberNames[transaction.payer_id ?? transaction.created_by] ??
                  shortId(transaction.payer_id ?? transaction.created_by)
                }
                onOpen={() => onOpen(transaction)}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
