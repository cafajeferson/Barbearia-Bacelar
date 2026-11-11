/**
 * Gráficos leves em SVG puro (renderizados no servidor, sem biblioteca):
 * área com gradiente, rosca e barras verticais — no estilo dos dashboards
 * escuros, com o dourado da marca (cor primária do tema).
 */

// Dourado da marca (o mesmo #F5B301 do logo); literal porque o SVG não lê a variável do tema.
const GOLD = "#F5B301";
// Tons para a rosca: do dourado ao bronze, depois cinzas.
const PALETTE = ["#F5B301", "#E09A00", "#C98400", "#A86E00", "#7A5200", "#5B5B5B"];

export function AreaChart({
  points,
  height = 220,
  valueLabel = (v: number) => String(v),
}: {
  points: { label: string; value: number }[];
  height?: number;
  valueLabel?: (v: number) => string;
}) {
  const W = 720;
  const H = height;
  const pad = { l: 34, r: 12, t: 28, b: 26 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const niceMax = Math.ceil(max / 5) * 5 || 5;
  const n = Math.max(points.length - 1, 1);
  const x = (i: number) => pad.l + (i / n) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b);
  const coords = points.map((p, i) => [x(i), y(p.value)] as const);

  // Curva suave (Catmull-Rom -> Bézier).
  let line = "";
  coords.forEach(([cx, cy], i) => {
    if (i === 0) {
      line = `M${cx},${cy}`;
      return;
    }
    const [x0, y0] = coords[Math.max(i - 2, 0)];
    const [x1, y1] = coords[i - 1];
    const [x3, y3] = coords[Math.min(i + 1, coords.length - 1)];
    const c1x = x1 + (cx - x0) / 6;
    const c1y = y1 + (cy - y0) / 6;
    const c2x = cx - (x3 - x1) / 6;
    const c2y = cy - (y3 - y1) / 6;
    line += ` C${c1x},${c1y} ${c2x},${c2y} ${cx},${cy}`;
  });
  const area = coords.length ? `${line} L${x(points.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z` : "";
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const every = Math.ceil(points.length / 12);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Evolução no período">
      <defs>
        <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={GOLD} stopOpacity="0.45" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity="0.08" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.45">
            {t}
          </text>
        </g>
      ))}
      {area && <path d={area} fill="url(#areaFill)" />}
      {line && <path d={line} fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" />}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="9" fill="transparent">
            <title>{`${p.label}: ${valueLabel(p.value)}`}</title>
          </circle>
          {i % every === 0 && (
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.5">
              {p.label}
            </text>
          )}
        </g>
      ))}
      {points.length > 0 && points[peak].value > 0 && (
        <g>
          <line x1={x(peak)} x2={x(peak)} y1={y(points[peak].value)} y2={H - pad.b} stroke={GOLD} strokeOpacity="0.4" strokeDasharray="3 3" />
          <circle cx={x(peak)} cy={y(points[peak].value)} r="5" fill={GOLD} stroke="#111" strokeWidth="2" />
          <rect x={x(peak) - 24} y={y(points[peak].value) - 26} width="48" height="18" rx="5" fill="#1f1f1f" stroke={GOLD} strokeOpacity="0.5" />
          <text x={x(peak)} y={y(points[peak].value) - 13} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">
            {valueLabel(points[peak].value)}
          </text>
        </g>
      )}
    </svg>
  );
}

export function DonutChart({
  slices,
  centerLabel,
  centerSub,
}: {
  slices: { label: string; value: number }[];
  centerLabel: string;
  centerSub: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 200 200" className="h-44 w-44" role="img" aria-label="Distribuição dos serviços">
        <circle cx="100" cy="100" r={R} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="26" />
        {slices.map((s, i) => {
          const len = (s.value / total) * C;
          const el = (
            <circle
              key={s.label}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth="26"
              strokeDasharray={`${Math.max(len - 2, 0)} ${C}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 100 100)"
            >
              <title>{`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        <text x="100" y="98" textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor">
          {centerLabel}
        </text>
        <text x="100" y="120" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.55">
          {centerSub}
        </text>
      </svg>
      <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {slices.map((s, i) => (
          <li key={s.label} className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="truncate text-muted-foreground" title={s.label}>
              {s.label}
            </span>
            <span className="ml-auto font-semibold tabular-nums">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VerticalBars({ bars, height = 200 }: { bars: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex items-end gap-2 sm:gap-3" style={{ height }}>
      {bars.map((b) => (
        <div key={b.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-xs font-semibold tabular-nums">{b.value}</span>
          <div
            className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-primary/30 to-primary"
            style={{ height: `${Math.max(3, (b.value / max) * (height - 44))}px` }}
            title={`${b.label}: ${b.value}`}
          />
          <span className="w-full truncate text-center text-[11px] text-muted-foreground" title={b.label}>
            {b.label}
          </span>
        </div>
      ))}
    </div>
  );
}
