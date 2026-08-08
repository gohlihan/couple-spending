import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../lib/currency';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';

export interface CategoryChartPoint {
  category: string;
  amount: number;
  count: number;
}

export default function CategorySpendingChart({ data }: { data: CategoryChartPoint[] }) {
  const categoryMax = data[0]?.amount ?? 1;

  return (
    <ChartContainer
      config={{ amount: { label: 'Spent', color: 'var(--accent)' } }}
      className="category-chart"
      style={{ height: `${Math.max(168, data.length * 44)}px` }}
      role="group"
      aria-label="Spending totals by category"
    >
      <BarChart
        data={data}
        layout="vertical"
        accessibilityLayer
        margin={{ top: 6, right: 8, left: 0, bottom: 6 }}
      >
        <XAxis type="number" hide domain={[0, categoryMax]} />
        <YAxis
          type="category"
          dataKey="category"
          axisLine={false}
          tickLine={false}
          width={76}
          tick={{ fill: 'var(--muted)', fontSize: 11 }}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              showCount
              valueFormatter={(value) => formatCurrency(Number(value))}
            />
          }
        />
        <Bar
          dataKey="amount"
          fill="var(--color-amount)"
          radius={6}
          barSize={22}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}
