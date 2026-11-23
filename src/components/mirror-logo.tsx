// Webb's primary mirror: 18 flat-top hexagonal segments in two rings around
// the (missing) centre — exactly the real layout, folding wings and all.
const SEGMENTS: [number, number][] = [];
for (let q = -2; q <= 2; q++) {
  for (let r = -2; r <= 2; r++) {
    const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    if (ring === 1 || ring === 2) SEGMENTS.push([q, r]);
  }
}

function hexPoints(cx: number, cy: number, s: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + s * Math.cos(a)).toFixed(2)},${(cy + s * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

export function MirrorLogo({ className, glow = false }: { className?: string; glow?: boolean }) {
  const size = 10;
  const gap = 0.92;
  return (
    <svg viewBox="-42 -46 84 92" className={className} aria-hidden>
      <defs>
        <linearGradient id="mirror-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff1cf" />
          <stop offset="45%" stopColor="#f2c46d" />
          <stop offset="100%" stopColor="#a8762c" />
        </linearGradient>
        {glow && (
          <filter id="mirror-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <g filter={glow ? "url(#mirror-glow)" : undefined}>
        {SEGMENTS.map(([q, r]) => {
          const x = size * 1.5 * q;
          const y = size * Math.sqrt(3) * (r + q / 2);
          return <polygon key={`${q}${r}`} points={hexPoints(x, y, size * gap)} fill="url(#mirror-gold)" />;
        })}
      </g>
    </svg>
  );
}
