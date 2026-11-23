"use client";

import clsx from "clsx";
import { Pause, Play, Search, X, Crosshair, Layers } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { INSTRUMENTS, instrumentOf } from "@/lib/instruments";
import { mastFile } from "@/lib/images";
import { bvToRgb, decToDms, galacticToRaDec, raDecToVec, raToHms, SKY_PRESETS, vecToRaDec } from "@/lib/sky-math";

/* ───────────────────────── types ───────────────────────── */

type Payload = { cells: number[][]; targets: string[] };
type Cell = {
  idx: number; id: number; ra: number; dec: number; n: number; nImg: number; nSpec: number; nCube: number; nTs: number;
  mask: number; first: number; last: number; nProg: number; target: string;
};
type Detail = {
  id: number; ra: number; dec: number;
  targets: { name: string; n: number; instruments: string[] }[];
  programs: { id: number; title: string | null; pi: string | null; type: string | null; n: number }[];
  images: { obsid: string; obs_id: string; target_name: string | null; instrument: string | null; filters: string | null; t_min: number | null; jpeg_url: string | null }[];
  byType: { type: string; n: number }[];
  first: number | null; last: number | null;
};
export type MonthCount = { month: string; image: number; spectrum: number; cube: number; timeseries: number };

const GOLD = new THREE.Color("#f2c46d");
const ICE = new THREE.Color("#7fd4ff");
const VIOLET = new THREE.Color("#b79cff");
const mjdToDate = (m: number) => new Date((m - 40587) * 86400000);
const fmtDate = (m: number) =>
  mjdToDate(m).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtInt = (n: number) => n.toLocaleString("en-US");

/* ───────────────────────── shaders ───────────────────────── */

const glowFrag = /* glsl */ `
  varying vec3 vColor; varying float vAlpha; varying float vRing;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.42, 0.0, d);
    float halo = exp(-d * d * 4.0) * 0.55;
    float ring = vRing * smoothstep(0.09, 0.0, abs(d - 0.82));
    float a = (core + halo) * vAlpha + ring;
    // AdditiveBlending is (SRC_ALPHA, ONE): output straight colour, alpha once.
    gl_FragColor = vec4(vColor, min(a, 1.0));
  }`;

const cellVert = /* glsl */ `
  attribute float aSize; attribute vec3 aColor; attribute float aFirst; attribute float aVisible; attribute float aIndex;
  uniform float uTime; uniform float uScale; uniform float uPR; uniform float uHover; uniform float uSelected; uniform float uCellPx;
  varying vec3 vColor; varying float vAlpha; varying float vRing;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    float born = step(aFirst, uTime) * aVisible;
    float age = uTime - aFirst;
    float flash = born * (1.0 - smoothstep(0.0, 40.0, age));
    float hov = (abs(aIndex - uHover) < 0.5 || abs(aIndex - uSelected) < 0.5) ? 1.0 : 0.0;
    float base = min(aSize * uScale, max(uCellPx * 1.2, 14.0));
    gl_PointSize = born * (base * (1.0 + flash * 1.8) + hov * 14.0) * uPR;
    vColor = mix(aColor, vec3(1.0), flash * 0.7 + hov * 0.35);
    vAlpha = born * (0.9 + flash * 0.4);
    vRing = hov * born;
  }`;

const starVert = /* glsl */ `
  attribute float aSize; attribute vec3 aColor; attribute float aPhase;
  uniform float uScale; uniform float uPR; uniform float uClock; uniform float uOpacity;
  varying vec3 vColor; varying float vAlpha; varying float vRing;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    float tw = 0.82 + 0.18 * sin(uClock * (0.6 + aPhase) + aPhase * 40.0);
    gl_PointSize = aSize * uScale * uPR;
    vColor = aColor;
    vAlpha = tw * uOpacity;
    vRing = 0.0;
  }`;

const mwVert = /* glsl */ `
  attribute float aSize; attribute vec3 aColor; attribute float aAlpha;
  uniform float uScale; uniform float uPR; uniform float uOpacity;
  varying vec3 vColor; varying float vAlpha; varying float vRing;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale * uPR;
    vColor = aColor;
    vAlpha = aAlpha * uOpacity;
    vRing = 0.0;
  }`;

/* ───────────────────────── geometry builders ───────────────────────── */

function buildMilkyWay(): THREE.Points {
  // Procedural, but geometrically faithful: points distributed in galactic
  // coordinates (thin disc + central bulge), converted to equatorial J2000.
  const N = 70000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const alpha = new Float32Array(N);
  const size = new Float32Array(N);
  const warm = new THREE.Color("#ffe2b8");
  const cool = new THREE.Color("#c9d4ff");
  const tmp = new THREE.Color();
  let i = 0;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  while (i < N) {
    const l = rnd() * 360;
    const lw = l > 180 ? l - 360 : l;
    const centre = Math.exp(-((lw / 38) ** 2));
    const w = 0.28 + 0.72 * Math.exp(-((lw / 75) ** 2));
    if (rnd() > w) continue;
    const sigma = 5.5 + 9 * Math.exp(-((lw / 18) ** 2));
    const b = gauss() * sigma;
    const [ra, dec] = galacticToRaDec(l, b);
    raDecToVec(ra, dec, pos, i * 3);
    tmp.copy(cool).lerp(warm, centre);
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
    alpha[i] = (0.03 + 0.06 * centre) * Math.exp(-((b / (sigma * 1.4)) ** 2));
    size[i] = 8 + rnd() * 12;
    i++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: mwVert,
    fragmentShader: glowFrag,
    uniforms: { uScale: { value: 1 }, uPR: { value: 1 }, uOpacity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(g, m);
}

function buildStars(rows: number[][]): THREE.Points {
  const n = rows.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  rows.forEach(([ra, dec, mag, bv], i) => {
    raDecToVec(ra, dec, pos, i * 3);
    const [r, g, b] = bvToRgb(bv);
    // keep stars close to white so Webb's coloured points stay legible on top
    col.set([0.55 + r * 0.45, 0.55 + g * 0.45, 0.55 + b * 0.45], i * 3);
    size[i] = Math.max(1.2, Math.min(6, 5.6 - mag * 0.85));
    phase[i] = Math.random();
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: starVert,
    fragmentShader: glowFrag,
    uniforms: { uScale: { value: 1 }, uPR: { value: 1 }, uClock: { value: 0 }, uOpacity: { value: 0.55 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(g, m);
}

function polylineSegments(lines: number[][], color: string, opacity: number) {
  const verts: number[] = [];
  const v = [0, 0, 0];
  for (const line of lines) {
    for (let k = 0; k + 3 < line.length; k += 2) {
      raDecToVec(line[k], line[k + 1], v);
      verts.push(v[0], v[1], v[2]);
      raDecToVec(line[k + 2], line[k + 3], v);
      verts.push(v[0], v[1], v[2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  return new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
}

function buildGrid() {
  const group = new THREE.Group();
  const meridians: number[][] = [];
  for (let h = 0; h < 24; h++) {
    const line: number[] = [];
    for (let d = -80; d <= 80; d += 4) line.push(h * 15, d);
    meridians.push(line);
  }
  const parallels: number[][] = [];
  for (const d of [-75, -60, -45, -30, -15, 15, 30, 45, 60, 75]) {
    const line: number[] = [];
    for (let r = 0; r <= 360; r += 3) line.push(r, d);
    parallels.push(line);
  }
  const equator: number[][] = [[...Array.from({ length: 121 }, (_, i) => [i * 3, 0]).flat()]];
  const galactic: number[][] = [
    Array.from({ length: 181 }, (_, i) => galacticToRaDec(i * 2, 0)).flat(),
  ];
  group.add(polylineSegments(meridians, "#9fb3d9", 0.07));
  group.add(polylineSegments(parallels, "#9fb3d9", 0.07));
  group.add(polylineSegments(equator, "#9fb3d9", 0.22));
  group.add(polylineSegments(galactic, "#f2c46d", 0.22));
  return group;
}

/* ───────────────────────── component ───────────────────────── */

export function SkyExplorer({ monthly }: { monthly: MonthCount[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [cells, setCells] = useState<Cell[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [detailEntry, setDetailEntry] = useState<{ id: number; data: Detail } | null>(null);
  const [instMask, setInstMask] = useState(31);
  const [layers, setLayers] = useState({ milkyway: true, stars: true, constellations: true, grid: true });
  const [showLayers, setShowLayers] = useState(false);
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(false);
  const [timeMjd, setTimeMjd] = useState<number | null>(null);

  // Mutable scene state shared with the render loop (no re-renders per frame).
  const view = useRef({ ra: 159.2, dec: -40, fov: 75 });
  const flight = useRef<null | { from: THREE.Vector3; to: THREE.Vector3; fov0: number; fov1: number; fovMid: number; t0: number; dur: number }>(null);
  const engine = useRef<{
    cellsPts?: THREE.Points;
    stars?: THREE.Points;
    mw?: THREE.Points;
    grid?: THREE.Group;
    constellations?: THREE.LineSegments;
    labels: { ra: number; dec: number; el: HTMLDivElement }[];
    camera?: THREE.PerspectiveCamera;
    renderer?: THREE.WebGLRenderer;
    positions?: Float32Array;
  }>({ labels: [] });
  const timeRef = useRef<number>(0);
  const range = useRef<[number, number]>([59600, 61400]);
  const [rangeState, setRangeState] = useState<[number, number]>([59600, 61400]);
  const cleanupRef = useRef<() => void>(() => {});
  const hoverIdx = useRef(-1);
  const selectedIdx = useRef(-1);
  const playingRef = useRef(false);
  const cellsRef = useRef<Cell[]>([]);
  const maskRef = useRef(31);

  /* ─── scene ─── */
  const initScene = useCallback(
    (list: Cell[], stars: number[][], cons: { lines: number[][]; labels: [number, number, string, number][] }) => {
      const mount = mountRef.current!;
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      } catch {
        setError("WebGL is not available in this browser.");
        return;
      }
      const pr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pr);
      renderer.setClearColor(0x020306, 1);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(view.current.fov, 1, 0.01, 10);
      camera.position.set(0, 0, 0);
      camera.up.set(0, 1, 0);

      const mw = buildMilkyWay();
      const starPts = buildStars(stars);
      const grid = buildGrid();
      const constellations = polylineSegments(cons.lines, "#8ea6d8", 0.2);
      scene.add(mw, grid, constellations, starPts);

      // JWST cells
      const n = list.length;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const size = new Float32Array(n);
      const first = new Float32Array(n);
      const vis = new Float32Array(n).fill(1);
      const index = new Float32Array(n);
      const c = new THREE.Color();
      list.forEach((cell, i) => {
        raDecToVec(cell.ra, cell.dec, pos, i * 3);
        const spec = cell.nSpec + cell.nCube;
        const tot = cell.nImg + spec + cell.nTs || 1;
        c.setRGB(0, 0, 0)
          .add(GOLD.clone().multiplyScalar(cell.nImg / tot))
          .add(ICE.clone().multiplyScalar(spec / tot))
          .add(VIOLET.clone().multiplyScalar(cell.nTs / tot));
        col.set([c.r, c.g, c.b], i * 3);
        size[i] = 7 + Math.log10(cell.n + 1) * 4.2;
        first[i] = cell.first;
        index[i] = i;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
      g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      g.setAttribute("aFirst", new THREE.BufferAttribute(first, 1));
      g.setAttribute("aVisible", new THREE.BufferAttribute(vis, 1));
      g.setAttribute("aIndex", new THREE.BufferAttribute(index, 1));
      const cellsPts = new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          vertexShader: cellVert,
          fragmentShader: glowFrag,
          uniforms: {
            uTime: { value: timeRef.current },
            uScale: { value: 1 },
            uPR: { value: pr },
            uHover: { value: -1 },
            uSelected: { value: -1 },
            uCellPx: { value: 2 },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      cellsPts.renderOrder = 10;
      scene.add(cellsPts);

      // Constellation labels (DOM overlay, positioned each frame)
      const layer = labelLayerRef.current!;
      layer.innerHTML = "";
      const labels = cons.labels
        .filter((l) => l[3] <= 2)
        .map(([ra, dec, name]) => {
          const el = document.createElement("div");
          el.textContent = name.toUpperCase();
          el.className =
            "absolute left-0 top-0 whitespace-nowrap font-mono text-[9px] tracking-[0.3em] text-[#8ea6d8]/60 pointer-events-none will-change-transform";
          layer.appendChild(el);
          return { ra, dec, el };
        });

      engine.current = { cellsPts, stars: starPts, mw, grid, constellations, labels, camera, renderer, positions: pos };

      const resize = () => {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = `${w}px`;
        renderer.domElement.style.height = `${h}px`;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(mount);

      const tmpV = new THREE.Vector3();
      const tmpA = [0, 0, 0];
      const dirV = new THREE.Vector3();
      let last = performance.now();
      let lastUi = 0;
      const clock0 = performance.now();

      const loop = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;

        // fly-to animation
        const f = flight.current;
        if (f) {
          const t = Math.min(1, (now - f.t0) / f.dur);
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          dirV.copy(f.from).lerp(f.to, e).normalize();
          const [ra, dec] = vecToRaDec(dirV.x, dirV.y, dirV.z);
          view.current.ra = ra;
          view.current.dec = dec;
          const arc = Math.sin(Math.PI * e);
          view.current.fov = f.fov0 + (f.fov1 - f.fov0) * e + arc * Math.max(0, f.fovMid - Math.max(f.fov0, f.fov1));
          if (t >= 1) flight.current = null;
        }

        // time-lapse
        if (playingRef.current) {
          const [a, b] = range.current;
          timeRef.current += ((b - a) / 28) * dt;
          if (timeRef.current >= b) {
            timeRef.current = b;
            playingRef.current = false;
            setPlaying(false);
          }
        }

        const { ra, dec, fov } = view.current;
        camera.fov = fov;
        camera.updateProjectionMatrix();
        raDecToVec(ra, Math.max(-89.5, Math.min(89.5, dec)), tmpA);
        camera.lookAt(tmpA[0], tmpA[1], tmpA[2]);

        const zoom = Math.max(1, 60 / fov);
        const mat = cellsPts.material as THREE.ShaderMaterial;
        mat.uniforms.uTime.value = timeRef.current;
        mat.uniforms.uHover.value = hoverIdx.current;
        mat.uniforms.uSelected.value = selectedIdx.current;
        mat.uniforms.uScale.value = Math.pow(zoom, 0.3);
        mat.uniforms.uCellPx.value = (0.2 / fov) * mount.clientHeight;
        const sm = starPts.material as THREE.ShaderMaterial;
        sm.uniforms.uScale.value = Math.pow(zoom, 0.35);
        sm.uniforms.uPR.value = pr;
        sm.uniforms.uClock.value = (now - clock0) / 1000;
        const mm = mw.material as THREE.ShaderMaterial;
        mm.uniforms.uScale.value = Math.pow(zoom, 0.9);
        mm.uniforms.uPR.value = pr;

        renderer.render(scene, camera);

        // labels
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        const showLabels = constellations.visible && fov < 110;
        for (const l of engine.current.labels) {
          if (!showLabels) {
            l.el.style.opacity = "0";
            continue;
          }
          raDecToVec(l.ra, l.dec, tmpA);
          tmpV.set(tmpA[0], tmpA[1], tmpA[2]).project(camera);
          if (tmpV.z > 1 || tmpV.x < -1.1 || tmpV.x > 1.1 || tmpV.y < -1.1 || tmpV.y > 1.1) {
            l.el.style.opacity = "0";
            continue;
          }
          l.el.style.opacity = "1";
          l.el.style.transform = `translate(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * h}px) translate(-50%, -50%)`;
        }

        // HUD readout (throttled)
        if (now - lastUi > 80) {
          lastUi = now;
          const hud = hudRef.current;
          if (hud) {
            hud.querySelector("[data-ra]")!.textContent = raToHms(ra);
            hud.querySelector("[data-dec]")!.textContent = decToDms(dec);
            hud.querySelector("[data-fov]")!.textContent = `${fov.toFixed(1)}°`;
          }
          if (playingRef.current) setTimeMjd(timeRef.current);
        }
        raf = requestAnimationFrame(loop);
      };
      let raf = requestAnimationFrame(loop);

      // cleanup on unmount
      cleanupRef.current = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.dispose();
        renderer.domElement.remove();
      };
    },
    [],
  );
  useEffect(() => () => cleanupRef.current(), []);

  /* ─── data ─── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, stars, cons] = await Promise.all([
          fetch("/api/sky").then((r) => r.json() as Promise<Payload>),
          fetch("/sky/stars.json").then((r) => r.json() as Promise<number[][]>),
          fetch("/sky/constellations.json").then((r) => r.json() as Promise<{ lines: number[][]; labels: [number, number, string, number][] }>),
        ]);
        if (cancelled) return;
        const list: Cell[] = p.cells.map((c, idx) => ({
          idx, id: c[0], ra: c[1], dec: c[2], n: c[3], nImg: c[4], nSpec: c[5], nCube: c[6], nTs: c[7], mask: c[8],
          first: c[9] || 59600, last: c[10], nProg: c[11], target: p.targets[idx],
        }));
        cellsRef.current = list;
        const firsts = list.map((c) => c.first).filter((f) => f > 59500);
        const now = Date.now() / 86400000 + 40587;
        range.current = [Math.min(...firsts) - 5, now];
        setRangeState(range.current);
        timeRef.current = now;
        setTimeMjd(now);
        initScene(list, stars, cons);
        setCells(list);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /* ─── visibility filters ─── */
  useEffect(() => {
    maskRef.current = instMask;
    const e = engine.current;
    if (!e.cellsPts) return;
    const attr = e.cellsPts.geometry.getAttribute("aVisible") as THREE.BufferAttribute;
    cellsRef.current.forEach((c, i) => (attr.array[i] = c.mask & instMask ? 1 : 0));
    attr.needsUpdate = true;
  }, [instMask, cells]);

  useEffect(() => {
    const e = engine.current;
    if (!e.mw) return;
    e.mw.visible = layers.milkyway;
    e.stars!.visible = layers.stars;
    e.constellations!.visible = layers.constellations;
    e.grid!.visible = layers.grid;
  }, [layers, cells]);

  useEffect(() => {
    hoverIdx.current = hover ? hover.idx : -1;
  }, [hover]);

  useEffect(() => {
    selectedIdx.current = selected ? selected.idx : -1;
    if (!selected) return;
    const ctrl = new AbortController();
    fetch(`/api/sky/cell?id=${selected.id}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<Detail>)
      .then((data) => setDetailEntry({ id: selected.id, data }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [selected]);
  const detail = selected && detailEntry?.id === selected.id ? detailEntry.data : null;

  /* ─── interaction ─── */
  const flyTo = useCallback((ra: number, dec: number, fov: number) => {
    const from = new THREE.Vector3(...(raDecToVec(view.current.ra, view.current.dec) as number[]));
    const to = new THREE.Vector3(...(raDecToVec(ra, dec) as number[]));
    const ang = (from.angleTo(to) * 180) / Math.PI;
    flight.current = {
      from,
      to,
      fov0: view.current.fov,
      fov1: fov,
      fovMid: Math.min(100, Math.max(view.current.fov, ang * 0.9)),
      t0: performance.now(),
      dur: 1400 + Math.min(1600, ang * 14),
    };
  }, []);

  const pick = useCallback((clientX: number, clientY: number): Cell | null => {
    const e = engine.current;
    const mount = mountRef.current;
    if (!e.camera || !e.positions || !mount) return null;
    const rect = mount.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const v = new THREE.Vector3();
    let best: Cell | null = null;
    let bestD = 14 * 14;
    const t = timeRef.current;
    for (const c of cellsRef.current) {
      if (c.first > t || !(c.mask & maskRef.current)) continue;
      v.set(e.positions[c.idx * 3], e.positions[c.idx * 3 + 1], e.positions[c.idx * 3 + 2]).project(e.camera);
      if (v.z > 1) continue;
      const sx = ((v.x + 1) / 2) * w;
      const sy = ((1 - v.y) / 2) * h;
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !cells) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragDist = 0;
    let pinch0 = 0;
    let fov0 = 0;

    const down = (e: PointerEvent) => {
      mount.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragDist = 0;
      flight.current = null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        fov0 = view.current.fov;
      }
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) {
        const c = pick(e.clientX, e.clientY);
        setHover((prev) => (prev?.idx === c?.idx ? prev : c));
        const tt = tooltipRef.current;
        if (tt) {
          const r = mount.getBoundingClientRect();
          tt.style.transform = `translate(${e.clientX - r.left + 16}px, ${e.clientY - r.top + 16}px)`;
        }
        mount.style.cursor = c ? "pointer" : "grab";
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) view.current.fov = Math.max(1.5, Math.min(110, (fov0 * pinch0) / d));
        return;
      }
      dragDist += Math.abs(dx) + Math.abs(dy);
      const degPerPx = view.current.fov / mount.clientHeight;
      const cosd = Math.max(0.15, Math.cos((view.current.dec * Math.PI) / 180));
      view.current.ra = (view.current.ra + (dx * degPerPx) / cosd + 360) % 360;
      view.current.dec = Math.max(-89.5, Math.min(89.5, view.current.dec + dy * degPerPx));
      mount.style.cursor = "grabbing";
      setHover(null);
    };
    const up = (e: PointerEvent) => {
      const wasTap = pointers.size === 1 && dragDist < 5;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch0 = 0;
      mount.style.cursor = "grab";
      if (wasTap) {
        const c = pick(e.clientX, e.clientY);
        setSelected(c);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      flight.current = null;
      view.current.fov = Math.max(1.5, Math.min(110, view.current.fov * Math.exp(e.deltaY * 0.0012)));
    };
    const leave = () => setHover(null);
    mount.addEventListener("pointerdown", down);
    mount.addEventListener("pointermove", move);
    mount.addEventListener("pointerup", up);
    mount.addEventListener("pointercancel", up);
    mount.addEventListener("pointerleave", leave);
    mount.addEventListener("wheel", wheel, { passive: false });
    return () => {
      mount.removeEventListener("pointerdown", down);
      mount.removeEventListener("pointermove", move);
      mount.removeEventListener("pointerup", up);
      mount.removeEventListener("pointercancel", up);
      mount.removeEventListener("pointerleave", leave);
      mount.removeEventListener("wheel", wheel);
    };
  }, [cells, pick]);

  // Opening move: honour ?ra=&dec=&fov= deep links, otherwise glide onto the southern Milky Way.
  useEffect(() => {
    if (!cells) return;
    const focus = (ra: number, dec: number, fov: number) => {
      flyTo(ra, dec, fov);
      let best: Cell | null = null;
      let bestD = Infinity;
      for (const c of cells) {
        const d = (c.dec - dec) ** 2 + ((c.ra - ra) * Math.cos((dec * Math.PI) / 180)) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best && bestD < 0.3 * 0.3) setSelected(best);
    };
    const q = new URLSearchParams(window.location.search);
    const ra = Number(q.get("ra"));
    const dec = Number(q.get("dec"));
    const t = setTimeout(() => {
      if (q.has("ra") && Number.isFinite(ra) && Number.isFinite(dec)) focus(ra, dec, Number(q.get("fov")) || 4);
      else flyTo(140, -45, 95);
    }, 300);
    const onFocus = (e: Event) => {
      const d = (e as CustomEvent<{ ra: number; dec: number; fov: number }>).detail;
      focus(d.ra, d.dec, d.fov);
    };
    window.addEventListener("sky:focus", onFocus);
    return () => {
      clearTimeout(t);
      window.removeEventListener("sky:focus", onFocus);
    };
  }, [cells, flyTo]);

  /* ─── time-lapse ─── */
  const togglePlay = () => {
    if (!playingRef.current) {
      const [a, b] = range.current;
      if (timeRef.current >= b - 1) timeRef.current = a;
      playingRef.current = true;
      setPlaying(true);
    } else {
      playingRef.current = false;
      setPlaying(false);
      setTimeMjd(timeRef.current);
    }
  };
  const scrub = (v: number) => {
    playingRef.current = false;
    setPlaying(false);
    timeRef.current = v;
    setTimeMjd(v);
  };

  /* ─── derived ─── */
  const sortedFirsts = useMemo(() => (cells ? cells.map((c) => c.first).sort((a, b) => a - b) : []), [cells]);
  const cellsSoFar = useMemo(() => {
    if (timeMjd == null) return 0;
    let lo = 0;
    let hi = sortedFirsts.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sortedFirsts[m] <= timeMjd) lo = m + 1;
      else hi = m;
    }
    return lo;
  }, [sortedFirsts, timeMjd]);
  const productsSoFar = useMemo(() => {
    if (timeMjd == null) return 0;
    const month = mjdToDate(timeMjd).toISOString().slice(0, 7);
    return monthly.filter((m) => m.month <= month).reduce((s, m) => s + m.image + m.spectrum + m.cube + m.timeseries, 0);
  }, [monthly, timeMjd]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !cells) return [];
    const presets = SKY_PRESETS.filter((p) => (p.name + " " + p.sub).toLowerCase().includes(q)).map((p) => ({
      key: "p" + p.name, label: p.name, sub: p.sub, ra: p.ra, dec: p.dec, fov: p.fov, cell: null as Cell | null,
    }));
    const seen = new Set<string>();
    const fromCells = cells
      .filter((c) => c.target.toLowerCase().includes(q))
      .sort((a, b) => b.n - a.n)
      .filter((c) => {
        const k = c.target.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 8)
      .map((c) => ({ key: "c" + c.id, label: c.target, sub: `${fmtInt(c.n)} products`, ra: c.ra, dec: c.dec, fov: 3, cell: c }));
    return [...presets, ...fromCells].slice(0, 9);
  }, [query, cells]);

  const [a, b] = rangeState;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#020306]">
      <div ref={mountRef} className="absolute inset-0 touch-none" style={{ cursor: "grab" }} />
      <div ref={labelLayerRef} className="pointer-events-none absolute inset-0 overflow-hidden" />

      {/* loading / error */}
      {!cells && !error && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border border-line-2 border-t-gold" />
            <p className="eyebrow mt-5">Loading every public Webb pointing…</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center">
          <p className="max-w-md text-fg-2">The sky map could not start: {error}</p>
        </div>
      )}

      {/* title block */}
      <div className="pointer-events-none absolute left-5 top-6 hidden max-w-md md:left-8 md:block">
        <p className="eyebrow">Interactive sky · J2000 equatorial</p>
        <h1 className="display mt-3 text-4xl md:text-5xl">Where Webb has looked</h1>
        <p className="mt-3 hidden text-sm leading-relaxed text-fg-2 md:block">
          Every glowing point is a 0.2° patch of sky containing public, calibrated Webb data. Gold means mostly
          imaging, blue mostly spectroscopy, violet time-series. Size scales with the number of data products. Drag to
          look around, scroll to zoom, click a point to open it.
        </p>
      </div>

      {/* search + presets */}
      <div className="absolute right-5 top-6 w-[min(360px,calc(100%-2.5rem))] md:right-8">
        <div className="glass flex items-center gap-2 rounded-full px-4 py-2.5">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a target: Carina, JADES, M16…"
            className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-dim"
            aria-label="Search targets"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search">
              <X className="h-4 w-4 text-muted" />
            </button>
          )}
        </div>
        {results.length > 0 && (
          <ul className="glass mt-2 overflow-hidden rounded-xl">
            {results.map((r) => (
              <li key={r.key}>
                <button
                  className="flex w-full items-baseline justify-between gap-4 px-4 py-2.5 text-left text-sm hover:bg-white/5"
                  onClick={() => {
                    flyTo(r.ra, r.dec, r.fov);
                    if (r.cell) setSelected(r.cell);
                    setQuery("");
                  }}
                >
                  <span className="truncate">{r.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{r.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 hidden flex-wrap justify-end gap-1.5 md:flex">
          {SKY_PRESETS.slice(0, 8).map((p) => (
            <button
              key={p.name}
              onClick={() => flyTo(p.ra, p.dec, p.fov)}
              className="rounded-full border border-line bg-ink/50 px-3 py-1 text-[11px] text-fg-2 backdrop-blur transition hover:border-gold hover:text-fg"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* hover tooltip */}
      <div
        ref={tooltipRef}
        className={clsx(
          "pointer-events-none absolute left-0 top-0 z-10 w-64 transition-opacity duration-150",
          hover ? "opacity-100" : "opacity-0",
        )}
      >
        {hover && (
          <div className="glass rounded-lg p-3.5">
            <p className="truncate text-sm">{hover.target || "Unnamed field"}</p>
            <p className="mt-1 font-mono text-[10px] text-muted">
              {raToHms(hover.ra)} · {decToDms(hover.dec)}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {INSTRUMENTS.filter((i) => hover.mask & i.bit).map((i) => (
                <span key={i.key} className="rounded-full px-1.5 py-px font-mono text-[9px] text-ink" style={{ background: i.color }}>
                  {i.label}
                </span>
              ))}
            </div>
            <p className="mt-2.5 text-xs text-fg-2">
              {fmtInt(hover.n)} products · {hover.nProg} programme{hover.nProg > 1 ? "s" : ""}
            </p>
            <p className="font-mono text-[10px] text-muted">first observed {fmtDate(hover.first)}</p>
          </div>
        )}
      </div>

      {/* HUD bottom-left: coordinates */}
      <div ref={hudRef} className="pointer-events-none absolute bottom-[104px] left-5 font-mono text-[10.5px] leading-5 tracking-[0.12em] text-muted md:left-8">
        <p>
          RA <span data-ra className="text-fg">—</span>
        </p>
        <p>
          DEC <span data-dec className="text-fg">—</span>
        </p>
        <p>
          FOV <span data-fov className="text-fg">—</span>
        </p>
      </div>

      {/* layers + instrument filters */}
      <div className="absolute bottom-[104px] right-5 flex flex-col items-end gap-2 md:right-8">
        {showLayers && (
          <div className="glass w-60 rounded-xl p-4">
            <p className="eyebrow mb-3">Layers</p>
            {(
              [
                ["milkyway", "Milky Way (galactic disc model)"],
                ["stars", "Naked-eye stars (Hipparcos)"],
                ["constellations", "Constellations"],
                ["grid", "RA/Dec grid · galactic plane"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center justify-between gap-3 py-1 text-xs text-fg-2">
                {label}
                <input
                  type="checkbox"
                  checked={layers[k]}
                  onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))}
                  className="accent-[#f2c46d]"
                />
              </label>
            ))}
            <p className="eyebrow mb-2 mt-4">Instruments</p>
            <div className="flex flex-wrap gap-1.5">
              {INSTRUMENTS.map((i) => {
                const on = (instMask & i.bit) !== 0;
                return (
                  <button
                    key={i.key}
                    onClick={() => setInstMask((m) => (m & i.bit ? m & ~i.bit : m | i.bit) || 31)}
                    className={clsx("rounded-full border px-2.5 py-1 font-mono text-[10px] transition", on ? "text-ink" : "border-line text-muted")}
                    style={on ? { background: i.color, borderColor: i.color } : undefined}
                  >
                    {i.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <button
          onClick={() => setShowLayers((v) => !v)}
          className="glass flex items-center gap-2 rounded-full px-4 py-2 text-xs text-fg-2 hover:text-fg"
        >
          <Layers className="h-3.5 w-3.5" /> Layers & filters
        </button>
      </div>

      {/* timeline */}
      <div className="absolute inset-x-0 bottom-0 border-t border-line bg-ink/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-5 px-5 py-4 md:px-8">
          <button
            onClick={togglePlay}
            disabled={!cells}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fg text-ink transition hover:bg-gold disabled:opacity-40"
            aria-label={playing ? "Pause time-lapse" : "Play Webb's mission as a time-lapse"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-4 font-mono text-[10.5px] tracking-[0.12em] text-muted">
              <span>
                {timeMjd ? (
                  <>
                    <span className="text-fg">{fmtDate(timeMjd)}</span>
                    <span className="hidden sm:inline"> · mission time-lapse</span>
                  </>
                ) : (
                  "—"
                )}
              </span>
              <span className="tabular-nums">
                <span className="text-fg">{fmtInt(cellsSoFar)}</span> cells ·{" "}
                <span className="text-gold">{fmtInt(productsSoFar)}</span> products
              </span>
            </div>
            <input
              type="range"
              className="slider mt-3"
              min={a}
              max={b}
              step={1}
              value={timeMjd ?? b}
              onChange={(e) => scrub(Number(e.target.value))}
              style={{ ["--pct" as string]: `${(((timeMjd ?? b) - a) / (b - a || 1)) * 100}%` }}
              aria-label="Observation date"
            />
          </div>
        </div>
      </div>

      {/* selected cell panel */}
      <aside
        className={clsx(
          "absolute bottom-[88px] right-0 top-0 z-20 w-full max-w-[420px] overflow-y-auto border-l border-line bg-ink/85 backdrop-blur-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          selected ? "translate-x-0" : "translate-x-full",
        )}
      >
        {selected && (
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Sky cell #{selected.id}</p>
                <h2 className="mt-2 text-2xl font-light tracking-tight">{selected.target || "Unnamed field"}</h2>
                <p className="mt-1 font-mono text-[10.5px] text-muted">
                  {raToHms(selected.ra)} · {decToDms(selected.dec)}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => flyTo(selected.ra, selected.dec, 2.5)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-line hover:border-fg"
                  aria-label="Centre on this cell"
                >
                  <Crosshair className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-line hover:border-fg"
                  aria-label="Close panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-line bg-line text-center">
              {[
                ["Products", fmtInt(selected.n)],
                ["Programmes", String(selected.nProg)],
                ["First light", mjdToDate(selected.first).getUTCFullYear().toString()],
              ].map(([k, v]) => (
                <div key={k} className="bg-ink px-2 py-3">
                  <p className="font-mono text-lg">{v}</p>
                  <p className="eyebrow !text-[9px]">{k}</p>
                </div>
              ))}
            </div>

            {!detail ? (
              <div className="mt-8 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded bg-white/5" />
                ))}
              </div>
            ) : (
              <>
                {detail.images.length > 0 && (
                  <div className="mt-8">
                    <p className="eyebrow mb-3">Raw frames in this cell</p>
                    <div className="grid grid-cols-2 gap-2">
                      {detail.images.slice(0, 6).map((im) => {
                        const inst = instrumentOf(im.instrument);
                        return (
                          <a
                            key={im.obsid}
                            href={`https://mast.stsci.edu/search/ui/#/jwst/results?obs_id=${encodeURIComponent(im.obs_id)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative aspect-square overflow-hidden rounded-sm border border-line bg-ink-2"
                          >
                            <Image
                              src={mastFile(im.jpeg_url!)}
                              alt={`${inst.label} ${im.filters} frame`}
                              fill
                              sizes="200px"
                              quality={60}
                              className="object-cover grayscale transition duration-500 group-hover:scale-105"
                            />
                            <span
                              className="absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-px font-mono text-[9px] text-ink"
                              style={{ background: inst.color }}
                            >
                              {inst.label} {im.filters}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-8">
                  <p className="eyebrow mb-3">Targets</p>
                  <ul className="divide-y divide-line border-y border-line">
                    {detail.targets.map((t) => (
                      <li key={t.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="truncate">{t.name}</span>
                        <span className="shrink-0 font-mono text-[10.5px] text-muted">{fmtInt(t.n)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8">
                  <p className="eyebrow mb-3">Programmes</p>
                  <ul className="space-y-3">
                    {detail.programs.map((p) => (
                      <li key={p.id}>
                        <a
                          href={`https://www.stsci.edu/jwst/science-execution/program-information?id=${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="group block rounded-sm border border-line p-3 transition hover:border-line-2"
                        >
                          <p className="font-mono text-[10px] text-gold">
                            PID {p.id} · {p.type} · {fmtInt(p.n)} products
                          </p>
                          <p className="mt-1 text-sm leading-snug text-fg-2 group-hover:text-fg">{p.title}</p>
                          {p.pi && <p className="mt-1 text-xs text-muted">PI {p.pi}</p>}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8">
                  <p className="eyebrow mb-3">Data types</p>
                  <div className="flex h-2 overflow-hidden rounded-full">
                    {detail.byType.map((t) => (
                      <div
                        key={t.type}
                        style={{
                          flex: t.n,
                          background: t.type === "image" ? "#f2c46d" : t.type === "timeseries" ? "#b79cff" : "#7fd4ff",
                          opacity: t.type === "cube" ? 0.6 : 1,
                        }}
                      />
                    ))}
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-muted">
                    {detail.byType.map((t) => `${t.type} ${fmtInt(t.n)}`).join(" · ")}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
