import type { GalleryFilter } from "@/lib/data";
import { bandColor, parseWavelengthUm } from "./utils";

const MIN_UM = 0.2;
const MAX_UM = 30;
const x = (um: number) => ((Math.log10(um) - Math.log10(MIN_UM)) / (Math.log10(MAX_UM) - Math.log10(MIN_UM))) * 100;

const TICKS = [0.2, 0.5, 1, 2, 5, 10, 20];

function fmtUm(um: number) {
  return um < 1 ? `${Math.round(um * 1000)} nm` : `${+um.toFixed(2)} μm`;
}

/**
 * Every filter used in the composite, placed on a log wavelength axis and drawn
 * in the colour the imaging team assigned to it.
 */
export function WavelengthBar({ filters }: { filters: GalleryFilter[] }) {
  const items = filters
    .map((f) => ({ ...f, um: parseWavelengthUm(f.wavelength) }))
    .filter((f): f is GalleryFilter & { um: number } => f.um !== null)
    .sort((a, b) => a.um - b.um);

  return (
    <div className="relative select-none pb-2 pt-14">
      {/* ranges */}
      <div className="relative h-10 rounded-sm border border-line bg-ink-2">
        {/* human vision */}
        <div
          className="absolute inset-y-0 opacity-70"
          style={{
            left: `${x(0.38)}%`,
            width: `${x(0.75) - x(0.38)}%`,
            background: "linear-gradient(90deg,#7b3cff,#2f6bff,#1ec8ff,#2ee86b,#f2e84a,#ff9c2a,#ff3b3b)",
          }}
        />
        {/* Webb */}
        <div
          className="absolute inset-y-0 border-x border-gold/60 bg-gold/[0.06]"
          style={{ left: `${x(0.6)}%`, width: `${x(28.5) - x(0.6)}%` }}
        />
        <span className="absolute -top-5 font-mono text-[9.5px] tracking-[0.18em] text-gold uppercase" style={{ left: `${x(0.6)}%` }}>
          Webb · 0.6–28.5 μm
        </span>
        <span
          className="absolute -top-5 -translate-x-full pr-2 font-mono text-[9.5px] tracking-[0.18em] text-fg-2 uppercase"
          style={{ left: `${x(0.6)}%` }}
        >
          Eye
        </span>

        {items.map((f, i) => (
          <div
            key={`${f.instrument}-${f.wavelength}-${i}`}
            className="group absolute inset-y-0 w-0"
            style={{ left: `${x(f.um)}%` }}
          >
            <span
              className="absolute inset-y-[-6px] left-[-1.5px] w-[3px] rounded-full"
              style={{ background: bandColor(f.color), boxShadow: `0 0 12px ${bandColor(f.color)}` }}
            />
            <span
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap font-mono text-[9.5px] text-fg-2"
              style={{ top: i % 2 ? "calc(100% + 10px)" : "calc(100% + 24px)" }}
            >
              {fmtUm(f.um)}
            </span>
          </div>
        ))}
      </div>

      {/* axis */}
      <div className="relative mt-12 h-4">
        {TICKS.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 font-mono text-[9px] text-dim" style={{ left: `${x(t)}%` }}>
            {t < 1 ? `${t * 1000} nm` : `${t} μm`}
          </span>
        ))}
      </div>
    </div>
  );
}

export function sortedFilters(filters: GalleryFilter[]) {
  return filters
    .map((f) => ({ ...f, um: parseWavelengthUm(f.wavelength) }))
    .sort((a, b) => (a.um ?? 0) - (b.um ?? 0));
}
