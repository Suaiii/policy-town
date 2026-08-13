import { BarChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';

use([BarChart, GridComponent, CanvasRenderer]);

type ResourceBarTone = 'primary' | 'committed' | 'city';

const toneColors: Record<ResourceBarTone, { fill: string; shadow: string }> = {
  primary: { fill: '#d5a663', shadow: 'rgba(213, 166, 99, .38)' },
  committed: { fill: '#708986', shadow: 'rgba(112, 137, 134, .26)' },
  city: { fill: '#8fb7a6', shadow: 'rgba(143, 183, 166, .3)' },
};

export function ResourceBar({ value, tone = 'city' }: { value: number; tone?: ResourceBarTone }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container, undefined, { renderer: 'canvas' });
    const palette = toneColors[tone];
    chart.setOption({
      animationDuration: 520,
      animationDurationUpdate: 420,
      grid: { left: 0, right: 0, top: 3, bottom: 3, containLabel: false },
      xAxis: { type: 'value', min: 0, max: 100, show: false },
      yAxis: { type: 'category', data: [''], show: false },
      series: [{
        type: 'bar',
        data: [Math.max(0, Math.min(100, value))],
        barWidth: 6,
        showBackground: true,
        backgroundStyle: {
          color: 'rgba(218, 224, 213, .105)',
          borderRadius: 6,
        },
        itemStyle: {
          color: palette.fill,
          borderRadius: 6,
          shadowBlur: 7,
          shadowColor: palette.shadow,
        },
        emphasis: { disabled: true },
        silent: true,
      }],
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [tone, value]);

  return <div className="resource-bar-chart" ref={containerRef} aria-hidden="true" />;
}
