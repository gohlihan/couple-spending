import { shortId, type HouseholdMemberOption } from '../lib/members';
import { Field, FieldLabel } from './ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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
    <Field>
      <FieldLabel htmlFor={id}>Paid by</FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={disabled} required>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select who paid" />
        </SelectTrigger>
        <SelectContent>
          {options.map((member) => (
            <SelectItem key={member.userId} value={member.userId}>
              {labelFor(member, currentUserId, currentUserName)}
              {member.userId === currentUserId ? ' (you)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
