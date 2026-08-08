import { Area, AreaChart, ReferenceDot, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../lib/currency';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';
import type { StatisticChartPoint } from './StatisticCard';

interface AreaStatisticChartProps {
  label: string;
  points: StatisticChartPoint[];
  tone: 'default' | 'positive' | 'danger';
  valueFormat: 'currency' | 'number';
  chartLabel: string;
  highlight?: { label: string; value: number };
}

const TONE_COLORS = {
  default: 'var(--accent)',
  positive: 'var(--positive)',
  danger: 'var(--danger)',
} as const;

export default function AreaStatisticChart({
  label,
  points,
  tone,
  valueFormat,
  chartLabel,
  highlight,
}: AreaStatisticChartProps) {
  const formatPointValue = (pointValue: unknown): string => {
    const numericValue = typeof pointValue === 'number' ? pointValue : Number(pointValue);
    return valueFormat === 'currency' ? formatCurrency(numericValue) : String(numericValue);
  };

  return (
    <ChartContainer
      config={{ value: { label, color: TONE_COLORS[tone] } }}
      className="statistic-card-chart"
      role="group"
      aria-label={chartLabel}
    >
      <AreaChart data={points} accessibilityLayer margin={{ top: 8, right: 6, left: 6, bottom: 4 }}>
        <XAxis dataKey="label" hide />
        <YAxis hide domain={['auto', 'auto']} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent valueFormatter={formatPointValue} />}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          fill="var(--color-value)"
          fillOpacity={0.14}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: 'var(--color-value)' }}
          isAnimationActive={false}
        />
        {highlight && (
          <ReferenceDot
            x={highlight.label}
            y={highlight.value}
            r={4}
            fill="var(--color-value)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        )}
      </AreaChart>
    </ChartContainer>
  );
}
