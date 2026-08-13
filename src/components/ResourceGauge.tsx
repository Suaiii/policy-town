import { GaugeChart } from 'echarts/charts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';

use([GaugeChart, CanvasRenderer]);

export function ResourceGauge({ value, primary = false }: { value: number; primary?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container, undefined, { renderer: 'canvas' });
    const color = primary ? '#d5a663' : '#87aa99';
    chart.setOption({
      animationDuration: 550,
      series: [{
        type: 'gauge',
        min: 0,
        max: 100,
        radius: '92%',
        startAngle: 220,
        endAngle: -40,
        pointer: { show: false },
        progress: { show: true, roundCap: true, width: 5, itemStyle: { color } },
        axisLine: { roundCap: true, lineStyle: { width: 5, color: [[1, 'rgba(216, 223, 213, .12)']] } },
        axisTick: { show: true, splitNumber: 2, distance: -8, length: 2, lineStyle: { color: 'rgba(229, 221, 205, .22)', width: 1 } },
        splitLine: { show: true, distance: -9, length: 4, lineStyle: { color: 'rgba(229, 221, 205, .3)', width: 1 } },
        axisLabel: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: { show: false },
        data: [{ value }],
      }],
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [primary, value]);

  return <div className="resource-gauge" ref={containerRef} aria-hidden="true" />;
}
