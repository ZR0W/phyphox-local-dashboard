import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface LiveChartProps {
  t: number[];
  v: number[];
  label: string;
}

export function LiveChart({ t, v, label }: LiveChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const plot = new uPlot(
      {
        width: 420,
        height: 220,
        scales: { x: { time: false } },
        series: [{ label: 'Experiment time (s)' }, { label, stroke: '#2563eb' }],
      },
      [t, v],
      containerRef.current,
    );
    plotRef.current = plot;

    return () => plot.destroy();
  }, []);

  useEffect(() => {
    plotRef.current?.setData([t, v]);
  }, [t, v]);

  return <div ref={containerRef} />;
}
