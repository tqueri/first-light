"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV } from "@/lib/nav";
import { MirrorLogo } from "./mirror-logo";

function MissionClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="w-[150px]" />;
  const mjd = now.getTime() / 86_400_000 + 40_587;
  return (
    <span className="tabular-nums">
      UTC {now.toISOString().slice(11, 19)} <span className="text-dim">·</span> MJD {mjd.toFixed(3)}
    </span>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  // The menu belongs to the page it was opened on, so navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const immersive = pathname === "/sky" || pathname === "/lab";

  return (
    <header
      className={clsx(
        "fixed inset-x-0 top-0 z-50 transition-[background,border-color,backdrop-filter] duration-500",
        scrolled || open || immersive
          ? "border-b border-line bg-ink/70 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-[1600px] items-center gap-8 px-5 md:px-8">
        <Link href="/" className="group flex items-center gap-3" aria-label="First Light — home">
          <MirrorLogo className="h-7 w-7 transition-transform duration-700 group-hover:rotate-[30deg]" />
          <span className="font-mono text-[12px] tracking-[0.32em] text-fg">FIRST&nbsp;LIGHT</span>
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {NAV.map((item, i) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    "group relative flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors",
                    active ? "text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  <span className="font-mono text-[9px] text-dim group-hover:text-gold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {item.label}
                  {active && <span className="absolute inset-x-3 -bottom-[17px] h-px bg-gold" />}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto hidden font-mono text-[10.5px] tracking-[0.14em] text-muted xl:block">
          <MissionClock />
        </div>

        <button
          type="button"
          onClick={() => setOpenOn(open ? null : pathname)}
          className="ml-auto flex h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-full border border-line lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          <span className={clsx("h-px w-4 bg-fg transition", open && "translate-y-[3.5px] rotate-45")} />
          <span className={clsx("h-px w-4 bg-fg transition", open && "-translate-y-[3.5px] -rotate-45")} />
        </button>
      </nav>

      {open && (
        <div className="border-t border-line bg-ink/95 px-5 pb-8 pt-4 backdrop-blur-xl lg:hidden">
          <ul className="flex flex-col">
            {NAV.map((item, i) => (
              <li key={item.href} className="border-b border-line">
                <Link href={item.href} className="flex items-baseline gap-4 py-4">
                  <span className="font-mono text-[10px] text-gold">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-2xl font-light tracking-tight">{item.label}</span>
                  <span className="ml-auto hidden text-xs text-muted sm:block">{item.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
