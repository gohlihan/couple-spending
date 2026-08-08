import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/lib/utils';

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
    icon?: React.ComponentType;
  }
>;

interface ChartContextValue {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart(): ChartContextValue {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error('useChart must be used within a ChartContainer.');
  return context;
}

interface ChartContainerProps extends React.ComponentProps<'div'> {
  config: ChartConfig;
  children: React.ReactElement;
  id?: string;
}

function ChartContainer({ id, className, children, config, ...props }: ChartContainerProps) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          'flex min-h-0 w-full justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-layer]:outline-hidden [&_.recharts-surface]:outline-hidden [&_.recharts-tooltip-cursor]:stroke-border',
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorEntries = Object.entries(config).filter(([, item]) => item.color);
  if (colorEntries.length === 0) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart="${id}"] {${colorEntries
          .map(([key, item]) => `--color-${key}: ${item.color};`)
          .join('')}}`,
      }}
    />
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;
const ChartLegend = RechartsPrimitive.Legend;

interface ChartPayloadItem {
  dataKey?: string | number;
  name?: string | number;
  value?: unknown;
  color?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  payload?: ChartPayloadItem[];
  label?: React.ReactNode;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  showCount?: boolean;
  valueFormatter?: (value: unknown) => React.ReactNode;
}

function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel = false,
  hideIndicator = false,
  showCount = false,
  valueFormatter,
  ...props
}: ChartTooltipContentProps) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        'grid min-w-32 gap-2 rounded-[12px] border border-border bg-background px-3 py-2 text-xs',
        className,
      )}
      {...props}
    >
      {!hideLabel && label !== undefined && (
        <p className="m-0 font-semibold text-foreground">{label}</p>
      )}
      {payload.map((item, index) => {
        const key = String(item.dataKey ?? item.name ?? 'value');
        const itemConfig = config[key];
        const count =
          showCount && typeof item.payload?.count === 'number' ? item.payload.count : undefined;
        return (
          <div key={`${key}-${index}`} className="flex items-start gap-2">
            {!hideIndicator && (
              <span
                className="mt-0.5 size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color ?? itemConfig?.color }}
                aria-hidden="true"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {itemConfig?.label ?? item.name ?? key}
                </span>
                <strong className="font-mono font-semibold tabular-nums text-foreground">
                  {valueFormatter ? valueFormatter(item.value) : String(item.value ?? '')}
                </strong>
              </div>
              {count !== undefined && (
                <span className="mt-1 block text-[0.68rem] text-muted-foreground">
                  {count} transaction{count === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartLegend, ChartStyle, ChartTooltip, ChartTooltipContent };
