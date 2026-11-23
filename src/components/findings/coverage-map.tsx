import { galacticToRaDec } from "@/lib/sky-math";

/**
 * Equal-area Mollweide map of the sky (RA increasing to the left, as on the sky),
 * with every Webb sky cell and the loneliest point ringed. Server-rendered SVG.
 */
const D = Math.PI / 180;
const W = 1000;
const H = 500;

function project(ra: number, dec: number): [number, number] {
  const lam = -(((ra - 180 + 540) % 360) - 180) * D; // RA 180° at centre, increasing leftwards
  const phi = dec * D;
  let th = phi;
  if (Math.abs(phi) < Math.PI / 2 - 1e-9) {
    for (let i = 0; i < 12; i++) {
      const f = 2 * th + Math.sin(2 * th) - Math.PI * Math.sin(phi);
      th -= f / (2 + 2 * Math.cos(2 * th));
    }
  }
  const x = ((2 * Math.SQRT2) / Math.PI) * lam * Math.cos(th);
  const y = Math.SQRT2 * Math.sin(th);
  return [Math.round((W / 2 + (x / (2 * Math.SQRT2)) * (W / 2)) * 10) / 10, Math.round((H / 2 - (y / Math.SQRT2) * (H / 2)) * 10) / 10];
}

/** Points at angular distance `r` (deg) around (ra, dec). */
function smallCircle(ra: number, dec: number, r: number) {
  const pts: [number, number][] = [];
  const a = ra * D;
  const d = dec * D;
  const rr = r * D;
  for (let k = 0; k <= 72; k++) {
    const b = (k / 72) * 2 * Math.PI;
    const dec2 = Math.asin(Math.sin(d) * Math.cos(rr) + Math.cos(d) * Math.sin(rr) * Math.cos(b));
    const ra2 = a + Math.atan2(Math.sin(b) * Math.sin(rr) * Math.cos(d), Math.cos(rr) - Math.sin(d) * Math.sin(dec2));
    pts.push(project(((ra2 / D) % 360 + 360) % 360, dec2 / D));
  }
  return pts;
}

export function CoverageMap({ dots, lonely }: { dots: number[][]; lonely: { ra: number; dec: number; distance: number } }) {
  const outline = Array.from({ length: 181 }, (_, i) => project(180.0001, -90 + i)).concat(
    Array.from({ length: 181 }, (_, i) => project(179.9999, 90 - i)),
  );
  const galactic = Array.from({ length: 361 }, (_, i) => project(...galacticToRaDec(i, 0)));
  // break the galactic line where it wraps across the map edge
  const galPath = galactic
    .map(([x, y], i) => (i && Math.abs(x - galactic[i - 1][0]) > W / 3 ? `M${x},${y}` : `${i ? "L" : "M"}${x},${y}`))
    .join(" ");
  const ring = smallCircle(lonely.ra, lonely.dec, lonely.distance);
  const ringPath = ring.map(([x, y], i) => (i && Math.abs(x - ring[i - 1][0]) > W / 3 ? `M${x},${y}` : `${i ? "L" : "M"}${x},${y}`)).join(" ");
  const [lx, ly] = project(lonely.ra, lonely.dec);
  const sorted = [...dots].sort((a, b) => a[2] - b[2]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Equal-area map of the sky showing every patch Webb has observed and the point farthest from any observation.">
      <defs>
        <radialGradient id="lonely-glow">
          <stop offset="0%" stopColor="#ff6b4a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ff6b4a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={outline.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ") + "Z"} fill="#05070c" stroke="rgba(255,255,255,0.12)" />
      {[-60, -30, 0, 30, 60].map((dec) => (
        <path
          key={dec}
          d={Array.from({ length: 73 }, (_, i) => project(i * 5 + 0.0001, dec)).map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
        />
      ))}
      <path d={galPath} fill="none" stroke="rgba(242,196,109,0.35)" strokeDasharray="4 4" />
      {[
        { max: 100, w: 2.6 },
        { max: 3000, w: 4.6 },
        { max: Infinity, w: 7.5 },
      ].map((bucket, bi, arr) => {
        const min = bi ? arr[bi - 1].max : 0;
        const d = sorted
          .filter(([, , n]) => n >= min && n < bucket.max)
          .map(([ra, dec]) => {
            const [x, y] = project(ra, dec);
            return `M${x} ${y}h0`;
          })
          .join("");
        return <path key={bi} d={d} stroke="#7fd4ff" strokeOpacity={0.55} strokeWidth={bucket.w} strokeLinecap="round" fill="none" />;
      })}
      <circle cx={lx} cy={ly} r={60} fill="url(#lonely-glow)" />
      <path d={ringPath} fill="none" stroke="#ff6b4a" strokeWidth={1.5} />
      <circle cx={lx} cy={ly} r={3.5} fill="#ff6b4a" />
      <text x={lx + 10} y={ly - 10} className="fill-[#ff6b4a] font-mono text-[12px]">
        loneliest point
      </text>
      <text x={W / 2} y={H - 6} textAnchor="middle" className="fill-[#5b5e69] font-mono text-[10px]">
        RA increases to the left · dashed line: galactic plane · equal-area projection
      </text>
    </svg>
  );
}
