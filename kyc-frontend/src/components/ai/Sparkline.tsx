type Props = {
  points: number[];
  width?: number;
  height?: number;
  /** Stroke colour — defaults to surface-deep. */
  stroke?: string;
  /** Optional filled area below the line, with reduced opacity. */
  filled?: boolean;
  className?: string;
};

/**
 * Compact inline sparkline. Renders as an SVG path normalized over the
 * given points so any value range scales to the box. Used inside KPI
 * cards to communicate trend without a full chart.
 */
export function Sparkline({
  points,
  width = 72,
  height = 24,
  stroke = "var(--accent-green-deep)",
  filled = false,
  className,
}: Props) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p - min) / range) * height;
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
    >
      {filled && <path d={areaPath} fill={stroke} fillOpacity="0.12" />}
      <path d={linePath} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <circle
        cx={coords[coords.length - 1][0]}
        cy={coords[coords.length - 1][1]}
        r="2"
        fill={stroke}
      />
    </svg>
  );
}
