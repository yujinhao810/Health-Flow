import { useId } from 'react';
import { ExpandOutlined } from '@ant-design/icons';
import { Button, Empty, Tooltip as AntTooltip } from 'antd';
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import type { ChartKind, ChartPoint, TimeRange } from '../../lib/chart-data';
import { formatChartDate, formatTooltipDate } from '../../lib/chart-data';
import { CHART_COLORS, CHART_META } from '../../lib/chart-theme';

type CompactTrendChartProps = {
  type: ChartKind;
  data: ChartPoint[];
  range?: TimeRange;
  onExpand?: (type: ChartKind) => void;
  height?: number;
  className?: string;
};

export function CompactTrendChart({ type, data, range = 'week', onExpand, height = 88, className }: CompactTrendChartProps) {
  const rawId = useId();
  const gradientId = `compact-${type}-${rawId.replace(/:/g, '')}`;
  const meta = CHART_META[type];
  const colors = CHART_COLORS[type];
  const hasValues = data.some((point) => point.value !== null);
  const classes = ['compact-chart-wrapper', className].filter(Boolean).join(' ');

  return (
    <div className={classes} style={{ height }}>
      {onExpand ? (
        <AntTooltip title="展开趋势详情">
          <Button
            className="compact-chart-expand"
            type="text"
            shape="circle"
            size="small"
            icon={<ExpandOutlined />}
            aria-label={`展开${meta.label}`}
            onClick={(event) => {
              event.stopPropagation();
              onExpand(type);
            }}
          />
        </AntTooltip>
      ) : null}

      {!hasValues ? (
        <div className="compact-chart-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={meta.emptyText} />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          {meta.chart === 'bar' ? (
            <BarChart data={data} margin={{ top: 12, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.gradient[0]} stopOpacity={0.88} />
                  <stop offset="100%" stopColor={colors.gradient[1]} stopOpacity={0.52} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide tickFormatter={(value: string) => formatChartDate(value, range)} />
              <YAxis hide />
              <RechartsTooltip content={<CompactTooltip unit={meta.unit} range={range} />} cursor={{ fill: 'rgba(109, 93, 252, 0.06)' }} />
              <Bar dataKey="value" fill={`url(#${gradientId})`} radius={[4, 4, 4, 4]} maxBarSize={18} />
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 12, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.line} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={colors.line} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide tickFormatter={(value: string) => formatChartDate(value, range)} />
              <YAxis hide />
              <RechartsTooltip content={<CompactTooltip unit={meta.unit} range={range} />} cursor={{ stroke: colors.line, strokeOpacity: 0.18 }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={colors.line}
                strokeWidth={2.2}
                fill={`url(#${gradientId})`}
                connectNulls
                dot={false}
                activeDot={{ r: 3.5 }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}

type TooltipPayload = { value?: number | string | null };

function CompactTooltip({
  active,
  payload,
  label,
  unit,
  range,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  unit: string;
  range: TimeRange;
}) {
  if (!active || !payload?.length || !label) return null;
  const value = payload[0]?.value;
  const formattedValue = typeof value === 'number' ? `${value} ${unit}` : '暂无记录';

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{formatTooltipDate(label, range)}</div>
      <div className="chart-tooltip-value">{formattedValue}</div>
    </div>
  );
}
