import type { ChartKind, TimeRange } from './chart-data';

export const CHART_COLORS = {
  sleep: {
    line: '#6d5dfc',
    areaStart: 'rgba(109, 93, 252, 0.16)',
    areaEnd: 'rgba(109, 93, 252, 0.02)',
    gradient: ['#6d5dfc', '#818cf8'],
  },
  mood: {
    line: '#a78bfa',
    areaStart: 'rgba(167, 139, 250, 0.16)',
    areaEnd: 'rgba(167, 139, 250, 0.02)',
    gradient: ['#a78bfa', '#c4b5fd'],
  },
  exercise: {
    line: '#38bdf8',
    areaStart: 'rgba(56, 189, 248, 0.16)',
    areaEnd: 'rgba(56, 189, 248, 0.02)',
    gradient: ['#38bdf8', '#6d5dfc'],
  },
  grid: 'rgba(129, 140, 248, 0.18)',
  text: '#64748b',
  referenceLine: 'rgba(109, 93, 252, 0.38)',
} as const;

export const CHART_META: Record<
  ChartKind,
  {
    label: string;
    unit: string;
    chart: 'area' | 'bar';
    emptyText: string;
    referenceValue?: number;
    referenceLabel?: string;
  }
> = {
  sleep: {
    label: '睡眠趋势',
    unit: '小时',
    chart: 'area',
    emptyText: '暂无睡眠趋势数据',
    referenceValue: 8,
    referenceLabel: '推荐睡眠',
  },
  mood: {
    label: '心情趋势',
    unit: '分',
    chart: 'area',
    emptyText: '暂无心情趋势数据',
    referenceValue: 5,
    referenceLabel: '中线',
  },
  exercise: {
    label: '运动趋势',
    unit: '分钟',
    chart: 'bar',
    emptyText: '暂无运动趋势数据',
  },
};

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  week: '周',
  month: '月',
  year: '年',
};
