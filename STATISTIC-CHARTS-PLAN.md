# Statistic Card Chart Rebuild

Branch: `feat/shadcn-statistic-charts`

## Decisions

- [x] Rebuild both Insights and Statistics metric cards.
- [x] Use shadcn Card composition for every metric card.
- [x] Replace vertical-stem SVG charts with area sparklines.
- [x] Keep metric cards horizontally swipeable on mobile.
- [x] Use a horizontal bar chart for category comparison.
- [x] Keep top purchases as a ranked list.
- [x] Use only real local transaction data.
- [x] Keep local-calendar and timezone-safe calculations.

## Implementation

- [x] Add Recharts and the shadcn `ChartContainer` primitive.
- [x] Add shared `StatisticCard` composition.
- [x] Share the local-midnight date refresh across Insights and Statistics.
- [x] Lazy-load area and category chart renderers.
- [x] Centralize daily, cumulative, remaining, average, count, rolling, and
      hourly series helpers in `src/lib/statistics.ts`.
- [x] Replace Insights cards with area charts.
- [x] Replace Statistics summary cards with area charts.
- [x] Replace category progress rows with a horizontal bar chart.
- [x] Remove old vertical-stem chart styles and markup.
- [x] Add chart accessibility labels and Recharts accessibility layers.
- [x] Preserve reduced-motion behavior by disabling chart animation.

## Verification

- [x] Default timezone tests pass.
- [x] `TZ=America/Los_Angeles npm test` passes.
- [x] `TZ=Pacific/Auckland npm test` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [x] Chart code is split from the main JavaScript bundle.
- [ ] Manually verify mobile swipe behavior at 320px and 390px.
- [ ] Manually verify chart tooltips with mouse, touch, and keyboard.
- [ ] Manually verify empty, historical, current, and overspent months.

## Notes

- Recharts creates a separate chart chunk; the existing main bundle warning is
  retained, but chart code no longer inflates the initial application chunk.
- Browser, screen-reader, and installed-PWA checks require manual validation.

Automated results:

- `npm test`: 20 passed.
- `TZ=America/Los_Angeles npm test`: 20 passed.
- `TZ=Pacific/Auckland npm test`: 20 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
