import {
  CircleDollarSign,
  Fuel,
  PartyPopper,
  ReceiptText,
  ShoppingBag,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  eat: UtensilsCrossed,
  shop: ShoppingBag,
  petrol: Fuel,
  bills: ReceiptText,
  fun: PartyPopper,
};

export function categoryIcon(chip?: string | null): LucideIcon {
  if (!chip) return CircleDollarSign;
  return CATEGORY_ICONS[chip.trim().toLowerCase()] ?? CircleDollarSign;
}
