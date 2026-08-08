# Couple Spending: shadcn/ui Redesign Build Plan

This is the tracked implementation checklist for the full UI redesign and the
daily spending subtotal feature.

## Branch

Work on:

```text
feat/shadcn-ui-redesign
```

Do not make implementation commits directly on `main`. The current `main`
branch remains the rollback version for the existing GitHub Pages deployment.

## Objective

Rebuild the entire active user interface with the project's existing shadcn/ui
configuration while preserving application behavior, offline-first data
handling, accessibility, and mobile PWA support.

Do not clone or copy the upstream shadcn/ui repository. Use the existing
`components.json`, Tailwind CSS 4 setup, semantic theme variables, and local
components in `src/components/ui/`.

## Confirmed Product Decisions

- [x] Redesign the entire active app, including authentication screens.
- [x] Retain the current light mobile-first neobank visual direction.
- [x] Retain the existing blue accent, green positive state, red destructive
      state, light-grey canvas, and white card surfaces.
- [x] Add a prominent `Today` spending card only when the current calendar
      month is selected.
- [x] Add a compact daily subtotal beside every transaction timeline date.
- [x] Do not show a misleading Today card for past or future selected months.
- [x] Preserve Malaysian ringgit formatting through `formatCurrency`.
- [x] Preserve database, Supabase, Dexie, sync, and offline behavior.

## Non-Goals

- [ ] No database or Supabase migration.
- [ ] No change to transaction, budget, household, or synchronization
      semantics.
- [ ] No routing rewrite.
- [ ] No dark mode unless separately requested.
- [ ] No charting library.
- [ ] No replacement of native date or datetime pickers.
- [ ] Do not migrate or delete unused `src/components/Waterfall.tsx` unless it
      becomes part of the active UI.
- [ ] Do not replace working Radix dialog or sheet behavior with custom modal
      logic.

## Phase 0: Baseline and Branch Safety

- [x] Confirm the worktree was clean before branching.
- [x] Create branch `feat/shadcn-ui-redesign` from `main`.
- [x] Record the baseline results of `npm test`, `npm run lint`, and
      `npm run build` before implementation.
- [x] Do not commit secrets from `.env.local` or generated deployment files.
- [x] Keep `main` untouched so it remains a rollback/deployment option.

Baseline results before implementation (after `npm ci` installed the committed
lockfile dependencies):

- `npm test`: 17 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed; Vite reported the existing large-chunk warning.
- The first build attempt before dependency installation failed because
  `node_modules` was absent, not because of source errors.

## Phase 1: shadcn/ui Foundation

### Existing foundation to preserve

- `components.json`
- `src/index.css`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/field.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/input-group.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/progress.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/textarea.tsx`

### Components to add if needed

- [x] `src/components/ui/alert.tsx`
- [x] `src/components/ui/checkbox.tsx`
- [x] `src/components/ui/select.tsx`
- [x] `src/components/ui/toggle-group.tsx`
- [x] `src/components/ui/skeleton.tsx`

### Foundation requirements

- [x] Add only dependencies required by the selected primitives.
- [x] Review generated diffs before overwriting customized local primitives.
- [x] Continue using the configured `new-york` style.
- [x] Keep the existing path aliases from `components.json`.
- [x] Keep Tailwind CSS 4 and CSS-variable theming.
- [x] Prefer native horizontal scrolling for analytics cards instead of adding
      a carousel dependency.
- [x] Do not add a chart dependency; keep the existing real-data SVG chart.

### Theme requirements

Keep the current product palette:

| Token       | Value     | Use                                   |
| ----------- | --------- | ------------------------------------- |
| Canvas      | `#f5f7fa` | App background                        |
| Surface     | `#ffffff` | Cards, panels, sheets                 |
| Foreground  | `#18212f` | Main text                             |
| Muted       | `#6d7a8c` | Supporting text                       |
| Primary     | `#1976f3` | Primary actions and active navigation |
| Positive    | `#108a62` | Spending amounts and positive balance |
| Destructive | `#c8414b` | Errors and destructive actions        |
| Border      | `#e8edf3` | Sparse separators and controls        |

- [x] Normalize these values into shadcn semantic variables.
- [x] Add success variables only if needed by the final components.
- [x] Do not introduce gradients, glassmorphism, heavy shadows, or thick
      borders.

## Phase 2: Daily Spending Calculations

### Files

- `src/lib/statistics.ts`
- `tests/statistics.test.ts`

### Implementation

- [x] Extend `TransactionDayGroup` with `total: number`.
- [x] Update `groupTransactionsByDay` to sum each day's transaction amounts.
- [x] Preserve newest-day and newest-transaction ordering.
- [x] Add a pure helper:

```ts
export function totalForLocalDay(transactions: Transaction[], date: Date): number;
```

- [x] Compare local year, month, and date values rather than UTC date-string
      slices.
- [x] Return `0` when there are no matching transactions.

### Tests

- [x] Same-day transactions produce the correct group total.
- [x] Different days have independent totals.
- [x] `totalForLocalDay` returns the correct local-calendar sum.
- [x] Empty transactions return zero.
- [x] Existing ordering assertions continue to pass.
- [x] Tests do not depend on the machine's current date.

## Phase 3: Application Shell

### Files

- `src/App.tsx`
- `src/pages/Main.tsx`
- `src/components/DateBar.tsx`
- `src/index.css`

### `App.tsx`

- [x] Replace bespoke loading presentation with a shadcn-based loading state or
      `Skeleton`.
- [x] Replace the global auth error presentation with shadcn `Alert`.
- [x] Keep `role="alert"` and an accessible dismiss button.
- [x] Preserve route resolution, pending setup behavior, invite parameter
      handling, and auth error state.

### `Main.tsx`

- [x] Rebuild the signed-in shell with shadcn components and Tailwind classes.
- [x] Replace inline custom navigation SVGs with Lucide icons.
- [x] Keep five navigation items: Insights, Plan, Add, Statistics, More.
- [x] Keep `aria-current="page"` on the active navigation item.
- [x] Keep minimum 44px touch targets.
- [x] Keep fixed mobile navigation and safe-area bottom padding.
- [x] Keep enough main-content bottom padding to prevent navigation overlap.
- [x] Preserve all current sheet, dialog, delete, edit, sign-out, and view state
      behavior.

### `DateBar.tsx`

- [x] Keep the existing Popover month-picker behavior.
- [x] Keep previous and next month controls.
- [x] Keep previous and next year controls.
- [x] Keep month selection and `aria-pressed` behavior.
- [x] Rebuild the visual container with shadcn/Tailwind conventions.
- [x] Keep the readable selected date range and live announcement.

## Phase 4: Insights and Timeline Subtotals

### Files

- `src/components/InsightsDashboard.tsx`
- `src/components/ActivityTransactionList.tsx`
- `src/lib/statistics.ts`
- `src/index.css`

### Today card

- [x] Detect whether the selected month matches the current local calendar
      month.
- [x] Calculate today's subtotal with `totalForLocalDay`.
- [x] Show a `Today` analytics card only for the current month.
- [x] Put the Today card before the monthly cards.
- [x] Show `formatCurrency(todayTotal)` as the value.
- [x] Show `No spending logged today` when today's total is zero.
- [x] Show today's transaction count when today's total is nonzero.
- [x] Do not show Today for past or future selected months.
- [x] Keep all existing monthly cards and their real-data values.
- [x] Refresh date-sensitive Today values at local midnight and when the app
      becomes visible again.

Current-month card order:

1. Today
2. Spent
3. Remaining
4. Daily average
5. Last 7 days

Past/future-month card order:

1. Spent
2. Remaining
3. Daily average
4. Last 7 days

### Timeline daily subtotal

- [x] Display each group's `total` beside its date heading.
- [x] Format each subtotal with `formatCurrency`.
- [x] Keep the subtotal compact and visually secondary.
- [x] Keep the subtotal outside individual transaction rows.
- [x] Preserve newest groups and newest rows first.
- [x] Preserve payer and time metadata.
- [x] Keep each transaction row as one accessible button.

Example layout:

```text
Today, 8 Aug                                      RM 42.50
```

### Card and chart requirements

- [x] Use shadcn `Card` composition for analytics cards.
- [x] Use shadcn `Card` composition for the recent-transactions panel.
- [x] Keep the existing real-data microchart SVG.
- [x] Keep the chart's accessible summary label.
- [x] Keep decorative SVG contents hidden from screen readers.
- [x] Keep horizontal snap scrolling on mobile.
- [x] Do not introduce fake analytics data.

## Phase 5: Statistics Screen

### File

- `src/pages/Statistics.tsx`

### Requirements

- [x] Convert four summary articles to consistent shadcn metric cards.
- [x] Use `Card`, `CardHeader`, `CardContent`, and `CardTitle` where suitable.
- [x] Keep `Badge` for counts.
- [x] Keep `Progress` for category share.
- [x] Use `Separator` for separated list rows.
- [x] Preserve `calculateStatistics` values and ordering.
- [x] Preserve highest-day formatting.
- [x] Preserve category progress semantics and accessible labels.
- [x] Preserve top-five purchase payer names and timestamps.
- [x] Preserve empty states.
- [x] Ensure currency values do not overflow.
- [x] Use two summary columns where comfortable and one column around narrow
      widths.

## Phase 6: Plan Screen

### File

- `src/pages/Plan.tsx`

### Requirements

- [x] Use `Card` for form and list sections.
- [x] Replace raw checkboxes with shadcn `Checkbox`.
- [x] Use `Badge` for item counts.
- [x] Use `Separator` or equivalent row separation.
- [x] Use consistent shadcn `Button` variants for edit and remove actions.
- [x] Use shadcn `Input` for text and date controls.
- [x] Use `Alert` or equivalent accessible status presentation for success/error
      states.
- [x] Preserve add, edit, complete, and remove behavior.
- [x] Preserve completion payer selection.
- [x] Preserve active and completed lists.
- [x] Preserve busy states and confirmation dialogs.
- [x] Preserve item-specific accessible checkbox labels.
- [x] Preserve completed-item visual treatment and history.
- [x] Do not alter planned-item persistence or transaction creation behavior.

## Phase 7: Transaction and Budget Forms

### Files

- `src/pages/AddTransaction.tsx`
- `src/pages/BudgetSettings.tsx`
- `src/components/PayerSelect.tsx`

### `PayerSelect.tsx`

- [x] Replace native select with shadcn `Select`.
- [x] Preserve controlled value, disabled state, and placeholder.
- [x] Preserve current-user-first ordering.
- [x] Preserve fallback IDs and additional historical users.
- [x] Preserve visible `Paid by` label.
- [x] Preserve `(you)` label for the current user.

### `AddTransaction.tsx`

- [x] Use consistent shadcn form-card composition.
- [x] Keep `Field`, `InputGroup`, `Textarea`, and `Button` behavior.
- [x] Replace quick-tag buttons with single-selection `ToggleGroup`.
- [x] Preserve deselect-on-second-click behavior for tags.
- [x] Keep tags: eat, shop, petrol, bills, fun.
- [x] Keep native `datetime-local` behavior, styled consistently.
- [x] Preserve amount validation and error messages.
- [x] Preserve create and edit modes.
- [x] Preserve autofocus behavior.
- [x] Preserve local-save success behavior.
- [x] Preserve payer logic and submit loading state.

### `BudgetSettings.tsx`

- [x] Use the shared form-card composition.
- [x] Preserve dirty-input protection during hydration/realtime updates.
- [x] Preserve zero-value budget support.
- [x] Preserve validation and local-save behavior.
- [x] Use accessible success and error status presentation.

## Phase 8: Authentication and Household Setup

### Files

- `src/pages/Login.tsx`
- `src/pages/Signup.tsx`
- `src/pages/Join.tsx`

### Shared structure

- [x] Use a consistent centered authentication shell.
- [x] Use a restrained product label or icon.
- [x] Keep serif display title and muted supporting text.
- [x] Place each form inside a white shadcn `Card`.
- [x] Keep full-width primary action.
- [x] Keep link-style secondary action.
- [x] Keep maximum form width around 400px.
- [x] Keep safe-area-aware vertical padding.
- [ ] Verify comfortable rendering at 320px.

### Behavior to preserve

- [x] Preserve all Supabase calls.
- [x] Preserve invite-code normalization and persistence.
- [x] Preserve pending setup state.
- [x] Preserve signup with and without email confirmation.
- [x] Preserve join/create household modes.
- [x] Preserve autocomplete attributes.
- [x] Preserve required fields.
- [x] Preserve disabled and submitting states.

## Phase 9: More, Sharing, and Account Interfaces

### Files

- `src/pages/Main.tsx`
- `src/pages/Invite.tsx`
- `src/pages/LinkPartner.tsx`
- `src/pages/ChangePassword.tsx`

### More sheet

- [x] Use `Sheet`, `Card`, `Badge`, `Separator`, `Button`, and Lucide icons.
- [x] Organize sections as sync status, presence, recent activity, household
      actions, and account actions.
- [x] Keep online/offline text labels, not only colored indicators.
- [x] Keep pending and failed sync counts.
- [x] Keep recent activity ordering and timestamps.
- [x] Preserve invite toggle behavior.
- [x] Preserve partner-link toggle behavior.
- [x] Preserve budget and password sheet opening.
- [x] Preserve sign-out behavior.
- [x] Preserve right-side sheet width and internal scrolling.

### Invite

- [x] Use a consistent Card-like panel.
- [x] Keep prominent invite code treatment.
- [x] Use shadcn `Input` for the read-only share link.
- [x] Use accessible copy buttons.
- [x] Announce copied state with `role="status"` or `Alert`.
- [x] Show a shadcn loading state while the code loads.
- [x] Preserve clipboard behavior and fallback handling.

### Link partner and password

- [x] Use the shared form-card composition.
- [x] Use accessible Alerts for success and error states.
- [x] Preserve all validation and Supabase/household calls.

## Phase 10: Dialogs and Sheets

### Files

- `src/pages/Main.tsx`
- `src/pages/Plan.tsx`
- Existing UI primitives only when necessary.

### Requirements

- [x] Keep safe-area bottom padding in every bottom sheet.
- [x] Keep bounded sheet height and internal scrolling.
- [x] Keep accessible titles and descriptions.
- [x] Preserve Radix focus trapping, Escape handling, outside dismissal, and
      focus return.
- [x] Use consistent `DialogHeader`, `DialogTitle`, and `DialogDescription`.
- [x] Keep transaction detail definition-list semantics.
- [x] Add separators between detail rows.
- [x] Keep outline Edit and destructive Delete actions.
- [x] Preserve opening the edit sheet from transaction details.
- [x] Do not manually reimplement modal focus or dismissal logic.

## Phase 11: CSS and Markup Cleanup

### File

- `src/index.css`

### Requirements

- [x] Move active presentation toward Tailwind utilities and shadcn classes.
- [ ] Keep global CSS only for theme variables, base document styles,
      safe-area variables, main width, fixed navigation geometry, analytics
      scrolling, microcharts, native date controls, and reduced motion.
- [x] Remove obsolete selectors only after confirming no active component uses
      them.
- [x] Avoid two competing style systems for the same UI element.
- [x] Check all active TSX class names before deleting CSS selectors.
- [x] Keep `src/App.css` unchanged unless a concrete active use is discovered.

## Responsive Acceptance Criteria

Verify at 320px, 375px, 390px, 420px, 640px, and desktop width.

- [ ] No horizontal page overflow.
- [ ] Analytics cards scroll horizontally instead of becoming cramped.
- [ ] Currency values remain readable.
- [ ] Bottom navigation never covers content.
- [ ] Sheets fit within the viewport and scroll internally.
- [ ] Safe-area padding remains present.
- [ ] Invite links and long notes do not break layout.
- [ ] Forms remain usable with the mobile keyboard.
- [ ] Touch targets are approximately 44px or larger.
- [ ] Signed-in content remains centered with a maximum width near 620px.

## Accessibility Acceptance Criteria

- [ ] All controls are keyboard accessible.
- [ ] Every icon-only button has an accessible name.
- [ ] Active navigation uses `aria-current="page"`.
- [ ] Quick tags expose selected state.
- [ ] Transaction rows remain semantic buttons.
- [ ] Errors use `role="alert"` or equivalent.
- [ ] Success and copied messages use `role="status"` or `aria-live`.
- [ ] Dialogs and sheets retain titles and descriptions.
- [ ] Inputs remain connected to labels.
- [ ] Focus indicators are visible on buttons, inputs, selects, textareas, and
      links.
- [ ] Statuses include text and do not rely only on color.
- [ ] Reduced-motion preferences are respected.
- [ ] Microcharts retain accessible labels.
- [ ] Progress bars retain meaningful labels and values.

## Verification Commands

Run in this order after implementation:

```bash
npm test
npm run lint
npm run build
```

- [x] Baseline commands recorded before implementation.
- [x] `npm test` passes after implementation.
- [x] `npm run lint` passes after implementation.
- [x] `npm run build` passes after implementation.
- [x] Formatting was limited to intentionally modified files.

## Manual Verification

- [ ] Login, signup, join, and create-household forms render correctly.
- [ ] Current-month Insights shows the Today card.
- [ ] Past and future months do not show the Today card.
- [ ] Every populated timeline date shows the correct subtotal.
- [ ] Adding a transaction updates the subtotal immediately.
- [ ] Editing a transaction updates the old and new day totals immediately.
- [ ] Deleting a transaction updates the subtotal immediately.
- [ ] Offline/local Dexie updates appear without waiting for Supabase.
- [ ] Budget changes update Remaining.
- [ ] Plan add/edit/complete/remove flows work.
- [ ] Statistics values and category progress remain correct.
- [ ] More sheet actions work.
- [ ] Sync status and counts remain visible.
- [ ] Invite copying works.
- [ ] Partner linking works.
- [ ] Password change works.
- [ ] Sign-out works.
- [ ] Dialogs and sheets close through controls, Escape, and backdrop
      interaction.
- [ ] Keyboard focus returns to the opening control after modal closure.

## Definition of Done

- [x] All active screens use one consistent shadcn-based visual system.
- [x] Today card follows the selected-month rule.
- [x] Every transaction day displays an accurate subtotal.
- [ ] Existing functionality remains intact.
- [x] Obsolete active-screen CSS is removed.
- [x] Automated tests pass.
- [ ] Responsive checks are complete.
- [ ] Accessibility checks are complete.
- [x] Builder final report lists files changed, components added, behavior
      changes, tests added, commands run, results, and known limitations.

## Current Handoff

Files changed:

- Added `src/components/ui/alert.tsx`, `checkbox.tsx`, `select.tsx`,
  `skeleton.tsx`, and `toggle-group.tsx`.
- Updated the shadcn Card primitive, theme CSS, application shell, auth screens,
  More sheet, Insights, timeline, Statistics, Plan, transaction/budget forms,
  sharing screens, and account screens.
- Updated `src/lib/statistics.ts`, `tests/statistics.test.ts`, `package.json`,
  and `package-lock.json`.

UI primitives added or changed:

- Added Alert, Checkbox, Select, Skeleton, and ToggleGroup.
- Added polymorphic semantic rendering to Card for section and article cards.
- Migrated payer selection, quick tags, plan completion, statuses, cards, and
  loading states to shadcn/Radix primitives.

Behavior changes:

- Current-month Insights shows a Today card with the local-calendar subtotal.
- Today values refresh at local midnight and when the document becomes visible.
- Every grouped transaction date shows its daily subtotal.
- Historical and future months do not show the Today card.
- Invite copying has a legacy textarea fallback when the Clipboard API is
  unavailable.
- Statistics use CardHeader/CardContent/CardTitle and Separator primitives;
  plan counts use Badge primitives.
- Existing transaction, budget, plan, auth, sharing, and sync behavior remains
  implemented through the existing data paths.

Tests and verification:

- Added daily group-total and local-day subtotal tests.
- `npm test`: 18 tests passed in the default timezone.
- `TZ=America/Los_Angeles npm test`: 18 tests passed.
- `TZ=Pacific/Auckland npm test`: 18 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed; Vite reports the existing large-chunk warning.
- `npx prettier --check SHADCN-REDESIGN-PLAN.md`: passed.

Manual checks:

- Browser viewport, keyboard-only, screen-reader, Supabase, and installed-PWA
  checks still need to be performed manually.

Known limitations:

- No browser automation or axe test setup exists in this repository.
- The production bundle remains above Vite's 500 kB warning threshold.
- Global CSS still contains active screen-specific layout rules; full utility
  extraction is a separate cleanup task.

## Builder Final Report Template

At completion, add the following information to the handoff message. Do not
mark the Definition of Done complete until all applicable items are verified.

```text
Files changed:
-

UI primitives added or changed:
-

Behavior changes:
-

Tests added or changed:
-

Verification:
- npm test:
- npm run lint:
- npm run build:

Manual checks:
-

Known limitations:
-
```
