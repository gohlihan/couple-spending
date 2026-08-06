import { shortId, type HouseholdMemberOption } from '../lib/members';

interface PayerSelectProps {
  id: string;
  value: string;
  members: HouseholdMemberOption[];
  currentUserId: string;
  currentUserName?: string | null;
  additionalUserIds?: string[];
  disabled?: boolean;
  onChange: (userId: string) => void;
}

function labelFor(
  member: HouseholdMemberOption,
  currentUserId: string,
  currentUserName: string | null | undefined,
): string {
  if (member.userId === currentUserId) return currentUserName?.trim() || 'You';
  return member.displayName?.trim() || shortId(member.userId);
}

export default function PayerSelect({
  id,
  value,
  members,
  currentUserId,
  currentUserName,
  additionalUserIds = [],
  disabled = false,
  onChange,
}: PayerSelectProps) {
  const options = [...members];
  const knownIds = new Set(options.map((member) => member.userId));
  for (const userId of [currentUserId, ...additionalUserIds, value]) {
    if (userId && !knownIds.has(userId)) {
      options.push({ userId, displayName: null });
      knownIds.add(userId);
    }
  }
  options.sort((left, right) => {
    if (left.userId === currentUserId) return -1;
    if (right.userId === currentUserId) return 1;
    return 0;
  });

  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">Paid by</span>
      <select
        id={id}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="" disabled>
          Select who paid
        </option>
        {options.map((member) => (
          <option key={member.userId} value={member.userId}>
            {labelFor(member, currentUserId, currentUserName)}
            {member.userId === currentUserId ? ' (you)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
