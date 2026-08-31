import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../lib/currency';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';

export interface MemberChartPoint {
  memberId: string;
  member: string;
  amount: number;
  count: number;
}

const MEMBER_COLORS = ['var(--accent)', 'var(--positive)', 'var(--medal-gold)'];

export default function MemberSpendingChart({ data }: { data: MemberChartPoint[] }) {
  const memberMax = data[0]?.amount ?? 0;

  return (
    <ChartContainer
      config={{ amount: { label: 'Spent', color: 'var(--accent)' } }}
      className="member-spending-chart"
      style={{ height: `${Math.max(144, data.length * 56)}px` }}
      role="group"
      aria-label="Monthly spending totals by household member"
    >
      <BarChart
        data={data}
        layout="vertical"
        accessibilityLayer
        margin={{ top: 8, right: 96, left: 0, bottom: 8 }}
      >
        <XAxis type="number" hide domain={[0, Math.max(memberMax * 1.35, 1)]} />
        <YAxis
          type="category"
          dataKey="member"
          axisLine={false}
          tickLine={false}
          width={88}
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
        <Bar dataKey="amount" radius={6} barSize={24} isAnimationActive={false}>
          {data.map((point, index) => (
            <Cell key={point.memberId} fill={MEMBER_COLORS[index % MEMBER_COLORS.length]} />
          ))}
          <LabelList
            dataKey="amount"
            position="right"
            formatter={(value: unknown) => formatCurrency(Number(value))}
            fill="var(--ink)"
            fontSize={11}
            fontWeight={700}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
