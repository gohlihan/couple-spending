import { lazy, Suspense } from 'react';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

const AreaStatisticChart = lazy(() => import('./AreaStatisticChart'));

export interface StatisticChartPoint {
  label: string;
  value: number;
  count?: number;
}

interface StatisticCardProps {
  label: string;
  value: string;
  detail: string;
  points: StatisticChartPoint[];
  tone?: 'default' | 'positive' | 'danger';
  valueFormat?: 'currency' | 'number';
  chartLabel?: string;
  badge?: string;
  highlight?: { label: string; value: number };
  className?: string;
}

export default function StatisticCard({
  label,
  value,
  detail,
  points,
  tone = 'default',
  valueFormat = 'currency',
  chartLabel = `${label} over the selected period`,
  badge,
  highlight,
  className,
}: StatisticCardProps) {
  return (
    <Card as="article" className={`statistic-card statistic-card-${tone} ${className ?? ''}`}>
      <CardHeader className="statistic-card-header">
        <div className="statistic-card-heading">
          <CardTitle className="statistic-card-label">{label}</CardTitle>
          {badge && <Badge variant="outline">{badge}</Badge>}
        </div>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent className="statistic-card-content">
        <p className="statistic-card-value">{value}</p>
        <Suspense
          fallback={<div className="statistic-card-chart chart-loading" aria-hidden="true" />}
        >
          <AreaStatisticChart
            label={label}
            points={points}
            tone={tone}
            valueFormat={valueFormat}
            chartLabel={chartLabel}
            highlight={highlight}
          />
        </Suspense>
      </CardContent>
    </Card>
  );
}
