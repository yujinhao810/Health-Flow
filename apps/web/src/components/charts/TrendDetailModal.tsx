import { useEffect, useMemo, useState } from 'react';
import { Empty, Modal, Segmented, Space, Typography } from 'antd';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HealthRecord } from '../../api/health';
import type { ChartKind, TimeRange } from '../../lib/chart-data';
import { aggregateTrendData, formatChartDate, formatTooltipDate, summarizeChartData } from '../../lib/chart-data';
import { CHART_COLORS, CHART_META, TIME_RANGE_LABELS } from '../../lib/chart-theme';

type TrendDetailModalProps = {
  open: boolean;
  type: ChartKind | null;
  records: HealthRecord[];
  onClose: () => void;
};

export function TrendDetailModal({ open, type, records, onClose }: TrendDetailModalProps) {
  const [range, setRange] = useState<TimeRange>('week');

  useEffect(() => {
    if (open) setRange('week');
  }, [open, type]);

  const data = useMemo(() => (type ? aggregateTrendData(records, type, range) : []), [records, range, type]);
  const stats = useMemo(() => summarizeChartData(data), [data]);

  if (!type) return null;

  const meta = CHART_META[type];
  const colors = CHART_COLORS[type];
  const hasValues = data.some((point) => point.value !== null);

  return (
    <Modal
      className="trend-detail-modal"
      open={open}
      onCancel={onClose}
      footer={null}
      width="80vw"
      style={{ maxWidth: 1200 }}
      title={
        <div className="trend-detail-title">
          <Typography.Title level={4}>{meta.label}</Typography.Title>
          <Segmented
            value={range}
            onChange={(value) => setRange(value as TimeRange)}
            options={[
              { label: TIME_RANGE_LABELS.week, value: 'week' },
              { label: TIME_RANGE_LABELS.month, value: 'month' },
              { label: TIME_RANGE_LABELS.year, value: 'year' },
            ]}
          />
        </div>
      }
    >
      {!hasValues ? (
        <div className="trend-detail-empty">
          <Empty description={`所选时间范围内${meta.emptyText}`} />
        </div>
      ) : (
        <>
          <div className="trend-detail-chart">
            <ResponsiveContainer width="100%" height="100%">
              {meta.chart === 'bar' ? (
                <BarChart data={data} margin={{ top: 24, right: 24, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 6" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(value: string) => formatChartDate(value, range)} tickLine={false} stroke={CHART_COLORS.text} />
                  <YAxis tickLine={false} axisLine={false} stroke={CHART_COLORS.text} unit={meta.unit} />
                  <RechartsTooltip content={<DetailTooltip unit={meta.unit} range={range} />} cursor={{ fill: 'rgba(109, 93, 252, 0.06)' }} />
                  <Bar dataKey="value" name={meta.label} fill="url(#exerciseDetailGradient)" radius={[8, 8, 4, 4]} maxBarSize={28} />
                  <defs>
                    <linearGradient id="exerciseDetailGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.gradient[0]} stopOpacity={0.92} />
                      <stop offset="100%" stopColor={colors.gradient[1]} stopOpacity={0.58} />
                    </linearGradient>
                  </defs>
                  {range !== 'week' ? <Brush dataKey="date" height={24} stroke={colors.line} tickFormatter={(value: string) => formatChartDate(value, range)} /> : null}
                </BarChart>
              ) : (
                <AreaChart data={data} margin={{ top: 24, right: 24, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 6" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(value: string) => formatChartDate(value, range)} tickLine={false} stroke={CHART_COLORS.text} />
                  <YAxis tickLine={false} axisLine={false} stroke={CHART_COLORS.text} unit={meta.unit} />
                  <RechartsTooltip content={<DetailTooltip unit={meta.unit} range={range} />} cursor={{ stroke: colors.line, strokeOpacity: 0.2 }} />
                  {meta.referenceValue !== undefined ? (
                    <ReferenceLine
                      y={meta.referenceValue}
                      stroke={CHART_COLORS.referenceLine}
                      strokeDasharray="5 5"
                      label={{ value: meta.referenceLabel, fill: CHART_COLORS.text, fontSize: 12 }}
                    />
                  ) : null}
                  <Area
                    type="monotone"
                    dataKey="value"
                    name={meta.label}
                    stroke={colors.line}
                    strokeWidth={2.6}
                    fill={`url(#${type}DetailGradient)`}
                    connectNulls
                    dot={{ r: 2.4 }}
                    activeDot={{ r: 4.4 }}
                  />
                  <defs>
                    <linearGradient id={`${type}DetailGradient`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.line} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={colors.line} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  {range !== 'week' ? <Brush dataKey="date" height={24} stroke={colors.line} tickFormatter={(value: string) => formatChartDate(value, range)} /> : null}
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="trend-stats-bar">
            <StatItem label="平均值" value={formatStat(stats.average, meta.unit)} />
            <StatItem label="峰值" value={formatStat(stats.max, meta.unit)} />
            <StatItem label="低值" value={formatStat(stats.min, meta.unit)} />
            <StatItem label="记录点" value={`${stats.recordedDays} / ${stats.totalDays}`} />
          </div>
        </>
      )}
    </Modal>
  );
}

function DetailTooltip({
  active,
  payload,
  label,
  unit,
  range,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string | null }>;
  label?: string;
  unit: string;
  range: TimeRange;
}) {
  if (!active || !payload?.length || !label) return null;
  const value = payload[0]?.value;

  return (
    <div className="chart-tooltip chart-tooltip-detail">
      <div className="chart-tooltip-label">{formatTooltipDate(label, range)}</div>
      <div className="chart-tooltip-value">{typeof value === 'number' ? `${value} ${unit}` : '暂无记录'}</div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <Space direction="vertical" size={2} className="stat-item">
      <Typography.Text className="stat-label">{label}</Typography.Text>
      <Typography.Text className="stat-value">{value}</Typography.Text>
    </Space>
  );
}

function formatStat(value: number | undefined, unit: string) {
  return value === undefined ? '-' : `${value} ${unit}`;
}
