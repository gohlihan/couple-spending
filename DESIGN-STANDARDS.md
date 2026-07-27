# Couple Spending UI Design Standards

The signed-in experience follows a premium iOS-neobank analytics aesthetic. This
file is the implementation reference for all future UI work.

## Principles

- **Soft minimalism:** show one clear financial hierarchy at a time.
- **Breathing room:** use the 8px spacing scale; do not compress controls or
  cards to fit extra content.
- **Calm surfaces:** a very light grey app canvas carries white cards with no
  decorative shadows, gradients, dense borders, or neumorphic treatments.
- **Mobile first:** the primary reference viewport is a 390px-wide iPhone.
  Layouts may expand gracefully but must remain comfortable at 320px.
- **Real data first:** analytics, labels, and transaction states must reflect
  local Dexie data and preserve offline-first behaviour.

## Foundations

### Color

| Token        |     Value | Use                                               |
| ------------ | --------: | ------------------------------------------------- |
| `--canvas`   | `#F5F7FA` | App background                                    |
| `--surface`  | `#FFFFFF` | Cards, panels, sheets                             |
| `--ink`      | `#18212F` | Primary text                                      |
| `--muted`    | `#6D7A8C` | Supporting text and metadata                      |
| `--accent`   | `#1976F3` | Primary action and selected navigation            |
| `--positive` | `#108A62` | Positive/remaining values and transaction amounts |
| `--danger`   | `#C8414B` | Destructive/error states                          |
| `--line`     | `#E8EDF3` | Sparse separators only                            |

All money is Malaysian ringgit, formatted through `src/lib/currency.ts` as
`RM 100.00`. Currency inputs visibly prefix `RM`.

### Typography

- **Display/headings:** `Iowan Old Style`, `Baskerville`, `Georgia`, serif.
  Use for the Insights heading and major balance values only.
- **UI/body:** system sans stack (`ui-sans-serif`, `-apple-system`, `Inter`,
  `Segoe UI`, sans-serif).
- Use charcoal for primary content and blue-grey for secondary text. Avoid
  all-caps blocks and more than two weights in a single card.

### Spacing and shape

- Base unit: **8px**. Use 8, 12, 16, 24, 32, and 40px increments.
- Analytics and content cards: **24px** radius.
- Small utility/pill controls: fully rounded or 14–16px radius.
- Keep at least 16px horizontal screen padding and 24px around primary groups.
- Respect `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.

## Signed-in screen anatomy

1. Leave iOS status-bar breathing room at the top.
2. Use a small personalized greeting above the serif **Insights** page heading.
   Keep the invite action inside **More**, not in the header.
3. Place a compact monthly period pill beside a clear date range with previous
   and next controls.
4. Use one horizontally scrollable, snap-aligned row of four analytics cards.
   Each card includes a short label, prominent single-line value, muted context,
   and a minimal seven-day microchart.
5. Use thin vertical chart strokes, small circular data points, and seven short
   day labels. No axes, legends, gradients, or heavy chart furniture.
6. Show recent transactions inside **one** white, 24px-radius panel. Group
   rows by local calendar date, with a small date label between groups. Each row
   has a pale circular category icon, readable wrapping title, muted metadata,
   and a right-aligned emerald amount. Tapping the row opens full note/detail
   content with the edit and delete actions.
7. Use a five-item fixed bottom nav: Insights, Plan, Add, Statistics, More.
   The selected item is electric blue; every item is at least a 44px target.
   Add opens the transaction sheet; Plan and Statistics are real screens; More
   owns budget settings, invite, sync status, and sign-out.

## Interaction and accessibility

- Use semantic `header`, `main`, `section`, `article`, `nav`, `aside`, lists,
  and labelled buttons.
- Buttons must provide `:hover` and `:focus-visible` states; do not remove
  browser focus without a visible replacement.
- Dialogs require names, modal semantics, backdrop dismissal, Escape dismissal,
  and safe-area-aware spacing.
- Use `aria-current="page"` for the active bottom-nav item. Status updates
  remain live-announced.
- Avoid relying on colour alone: text labels and icons must retain meaning.

## Avoid

- Heavy shadows, gradients, thick card outlines, or embossed effects.
- More than one primary CTA per view.
- Crowded chart labels, decorative legends, or fake analytics data.
- Fixed content hidden beneath the bottom nav.
- Reintroducing USD or locale-dependent currency presentation.
