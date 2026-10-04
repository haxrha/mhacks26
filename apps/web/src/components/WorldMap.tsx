"use client";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { HazardFrames } from "@/game/hazardVisuals";
import { CIVS, EVENTS } from "@/game/content";
import { spillTarget } from "@/game/engine";
import { OWNERS, TOWNS, townOf, ARROW_COLORS } from "@/game/towns";
import { CIV_IDS, type CivId, type GameState } from "@/game/types";
import {
  OCEAN,
  areaStatus,
  renderWorldView,
  tsunamiDirection,
  type WorldView,
  type PortTraffic,
} from "@/game/worldRender";

const FPS = OCEAN.fps;

/** The terrain is drawn live from map data, so events, towns and climate show on the land itself. */
function LiveTerrain({
  state,
  svg,
  previewFrame,
  scale: cssScale,
}: {
  state: GameState;
  scale: number;
  svg: RefObject<SVGSVGElement | null>;
  previewFrame?: number;
}) {
  const scaleRef = useRef(cssScale);
  scaleRef.current = cssScale;
  const canvas = useRef<HTMLCanvasElement>(null);
  const hazardCanvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(state);
  latest.current = state;
  const frameOverride = useRef(previewFrame);
  frameOverride.current = previewFrame;
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    const hazardCtx = hazardCanvas.current?.getContext("2d");
    if (!ctx || !hazardCtx) return;
    const el = canvas.current!;
    let image: ImageData;
    let hazardImage: ImageData;
    let view: WorldView;
    let frame = 0;
    const animationStart = performance.now();
    const still = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const trips = new Map<number, { civ: CivId; start: number }>();
    const hazardStarts = new Map<string, number>();
    const viewportEl = svg.current?.parentElement;
    let disposed = false;
    const measure = () => {
      const mapEl = svg.current;
      const shellEl = el.parentElement;
      if (disposed || !mapEl || !shellEl || !el.isConnected) return false;
      const shell = shellEl.getBoundingClientRect();
      const map = mapEl.getBoundingClientRect();
      // The SVG viewBox and canvas share the same native 4px art grid.
      const scale = scaleRef.current;
      if (!Number.isFinite(scale) || scale <= 0) return false;
      const originX = Math.ceil((map.left - shell.left) / scale);
      const originY = Math.ceil((map.top - shell.top) / scale);
      const offX = map.left - shell.left - originX * scale;
      const offY = map.top - shell.top - originY * scale;
      const width = Math.max(1, Math.ceil((shell.width - offX) / scale));
      const height = Math.max(1, Math.ceil((shell.height - offY) / scale));
      for (const layer of [el, hazardCanvas.current]) {
        if (!layer) continue;
        Object.assign(layer.style, {
          left: `${offX}px`,
          top: `${offY}px`,
          width: `${width * scale}px`,
          height: `${height * scale}px`,
        });
      }
      if (!image || image.width !== width || image.height !== height) {
        image = ctx.createImageData(width, height);
        hazardImage = hazardCtx.createImageData(width, height);
      }
      if (el.width !== width) el.width = width;
      if (el.height !== height) el.height = height;
      if (hazardCanvas.current) {
        hazardCanvas.current.width = width;
        hazardCanvas.current.height = height;
      }
      view = {
        width,
        height,
        originX,
        originY,
        clip: {
          left: 0,
          top: 0,
          right: width,
          bottom: height,
        },
      };
      return true;
    };
    const draw = () => {
      frame = ((performance.now() - animationStart) / 1000) * OCEAN.timelineFps;
      if (disposed || !svg.current || !el.isConnected) return;
      if (!view && !measure()) return;
      if (!view || !image) return;
      const s = latest.current;
      s.news.forEach((n, i) => {
        if (n.kind === "trade" && n.civ && n.round === s.round && !trips.has(i))
          trips.set(i, { civ: n.civ, start: frame });
      });
      const traffic: PortTraffic[] = [...trips.values()]
        .flatMap((t) => {
          const age = frame - t.start;
          return age < OCEAN.trade.frames ? [{ civ: t.civ, frame: age }] : [];
        })
        .slice(-OCEAN.trade.maxBoats);
      const clocks: HazardFrames = {},
        active = new Set<string>();
      areaStatus(s).forEach((status, area) => {
        const civ = OWNERS[TOWNS[area].civ];
        clocks[area] = {};
        for (const type of status.effects) {
          const began =
            s.civs[civ].hazards?.find((h) => h.type === type)?.started ??
            (s.events[civ].type === type
              ? s.events[civ].started
              : s.minorEvents?.[civ]?.started) ??
            s.round;
          const key = `${area}:${type}:${began}`;
          active.add(key);
          if (!hazardStarts.has(key)) hazardStarts.set(key, performance.now());
          clocks[area]![type] =
            frameOverride.current ??
            (still
              ? 24
              : ((performance.now() - hazardStarts.get(key)!) / 1000) *
                OCEAN.timelineFps);
        }
      });
      for (const key of hazardStarts.keys())
        if (!active.has(key)) hazardStarts.delete(key);
      renderWorldView(
        s,
        frameOverride.current ?? (still ? 24 : frame),
        image.data,
        view,
        traffic,
        clocks,
        hazardImage.data,
      );
      ctx.putImageData(image, 0, 0);
      hazardCtx.putImageData(hazardImage, 0, 0);
    };
    measure();
    draw();
    const refresh = () => {
      if (measure()) draw();
    };
    const resize = new ResizeObserver(refresh);
    resize.observe(el.parentElement!);
    if (svg.current) resize.observe(svg.current);
    if (viewportEl) resize.observe(viewportEl);
    const scroll = refresh;
    viewportEl?.addEventListener("scroll", scroll);
    let measuredFrames = 0,
      measuredAt = performance.now();
    let animation = 0,
      lastDraw = performance.now();
    const animate = (now: number) => {
      if (disposed) return;
      const interval = still ? 1000 : 1000 / FPS;
      if (now - lastDraw >= interval - 0.5) {
        draw();
        measuredFrames++;
        if (now - measuredAt >= 1000) {
          el.dataset.renderFps = String(
            Math.round((measuredFrames * 1000) / (now - measuredAt)),
          );
          measuredFrames = 0;
          measuredAt = now;
        }
        // Keep the cadence anchored across RAF jitter rather than throwing away
        // the fractional remainder and repeatedly skipping a refresh.
        lastDraw +=
          interval * Math.max(1, Math.floor((now - lastDraw + 0.5) / interval));
      }
      animation = window.requestAnimationFrame(animate);
    };
    animation = window.requestAnimationFrame(animate);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(animation);
      resize.disconnect();
      viewportEl?.removeEventListener("scroll", scroll);
    };
  }, [svg, previewFrame]);
  return (
    <>
      <canvas
        ref={canvas}
        className="world-canvas"
        width={320}
        height={200}
        aria-hidden="true"
      />
      <canvas
        ref={hazardCanvas}
        className="world-hazard-canvas"
        width={320}
        height={200}
        aria-hidden="true"
      />
    </>
  );
}

const keep = (civ: CivId) => {
  const t = townOf(civ);
  return [t.keepTile[0] * 4, t.keepTile[1] * 4] as const;
};

/** One map pixel in SVG units (the terrain is 320x200 pixels drawn at 4x). */
const CELL = 4;

/**
 * A pixel-art arrow between two towns, drawn on the map's own pixel grid so it matches the
 * terrain: a curve that bows to the left of travel (so A->B and B->A separate), a 3-pixel shaft
 * with a light top and dark bottom, a chunky 9-pixel-tall head and a 1-pixel black outline, like the
 * trade arrow sprites. Returns one SVG path per colour, plus the centre line for the march effect.
 */
function pixelArrow(
  x: number,
  y: number,
  tx: number,
  ty: number,
  lane: number,
) {
  const len = Math.hypot(tx - x, ty - y) || 1;
  const ux = (tx - x) / len,
    uy = (ty - y) / len;
  const nx = uy,
    ny = -ux;
  const sx = x + ux * 48,
    sy = y + uy * 48;
  const ex = tx - ux * 72,
    ey = ty - uy * 72;
  const bow = Math.min(150, len * 0.26) * (1 + lane * 0.35);
  const c1x = sx + (ex - sx) * 0.25 + nx * bow,
    c1y = sy + (ey - sy) * 0.25 + ny * bow;
  const c2x = sx + (ex - sx) * 0.75 + nx * bow,
    c2y = sy + (ey - sy) * 0.75 + ny * bow;
  const at = (t: number) => {
    const m = 1 - t;
    return [
      (m * m * m * sx +
        3 * m * m * t * c1x +
        3 * m * t * t * c2x +
        t * t * t * ex) /
        CELL,
      (m * m * m * sy +
        3 * m * m * t * c1y +
        3 * m * t * t * c2y +
        t * t * t * ey) /
        CELL,
    ];
  };
  const tangent = (t: number) => {
    const m = 1 - t;
    const dx =
      3 * m * m * (c1x - sx) + 6 * m * t * (c2x - c1x) + 3 * t * t * (ex - c2x);
    const dy =
      3 * m * m * (c1y - sy) + 6 * m * t * (c2y - c1y) + 3 * t * t * (ey - c2y);
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  // Normal pointing up the screen, so "top half" means the same thing as in the sprites.
  const upNormal = (tx_: number, ty_: number) =>
    -tx_ > 0 || (tx_ === 0 && ty_ > 0) ? [ty_, -tx_] : [-ty_, tx_];

  const cells = new Map<string, boolean>(); // "cx,cy" -> light?
  const centre: [number, number][] = [];
  const steps = Math.max(8, Math.ceil(len / 3));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [px, py] = at(t);
    const [tx_, ty_] = tangent(t);
    const [ux_, uy_] = upNormal(tx_, ty_);
    const mid = `${Math.floor(px)},${Math.floor(py)}`;
    if (!centre.length || centre[centre.length - 1].join(",") !== mid)
      centre.push([Math.floor(px), Math.floor(py)]);
    for (let cy = Math.floor(py) - 2; cy <= Math.floor(py) + 2; cy++)
      for (let cx = Math.floor(px) - 2; cx <= Math.floor(px) + 2; cx++) {
        const dx = cx + 0.5 - px,
          dy = cy + 0.5 - py;
        const across = dx * ux_ + dy * uy_,
          along = dx * tx_ + dy * ty_;
        if (Math.abs(across) <= 1.5 && Math.abs(along) <= 0.75) {
          const key = `${cx},${cy}`;
          if (!cells.has(key)) cells.set(key, across > -0.5);
        }
      }
  }
  // Head: about 6 pixels long and 9 pixels tall, pointing along the curve's end direction.
  const [hx, hy] = at(1);
  const [dx, dy] = tangent(1);
  const [ux_, uy_] = upNormal(dx, dy);
  const tip = [hx + dx * 4.5, hy + dy * 4.5];
  const base = [hx - dx * 2, hy - dy * 2];
  const corners = [
    tip,
    [base[0] + ux_ * 4.6, base[1] + uy_ * 4.6],
    [base[0] - ux_ * 4.6, base[1] - uy_ * 4.6],
  ];
  const side = (p: number[], a: number[], b: number[]) =>
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let cy = Math.floor(hy) - 8; cy <= Math.floor(hy) + 8; cy++)
    for (let cx = Math.floor(hx) - 8; cx <= Math.floor(hx) + 8; cx++) {
      const p = [cx + 0.5, cy + 0.5];
      const d1 = side(p, corners[0], corners[1]),
        d2 = side(p, corners[1], corners[2]),
        d3 = side(p, corners[2], corners[0]);
      const inside =
        (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
      if (inside) {
        const across = (p[0] - base[0]) * ux_ + (p[1] - base[1]) * uy_;
        cells.set(`${cx},${cy}`, across > -0.25);
      }
    }
  // 1-pixel black outline around everything.
  const outline = new Set<string>();
  for (const key of cells.keys()) {
    const [cx, cy] = key.split(",").map(Number);
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = `${cx + ox},${cy + oy}`;
      if (!cells.has(n)) outline.add(n);
    }
  }
  const rect = (key: string) => {
    const [cx, cy] = key.split(",").map(Number);
    return `M${cx * CELL} ${cy * CELL}h${CELL}v${CELL}h-${CELL}z`;
  };
  const pick = (light: boolean) =>
    [...cells]
      .filter(([, l]) => l === light)
      .map(([k]) => rect(k))
      .join("");
  // Every 4th centre-line pixel per phase, for a stepped "marching" glint toward the head.
  const march = [0, 1, 2, 3].map((phase) =>
    centre
      .filter((_, i) => i % 4 === phase && i < centre.length - 2)
      .map(([cx, cy]) => rect(`${cx},${cy}`))
      .join(""),
  );
  return {
    outline: [...outline].map(rect).join(""),
    light: pick(true),
    dark: pick(false),
    march,
  };
}

export default function WorldMap({
  state,
  selected,
  onSelect,
  initialZoom = 1.4,
  previewFrame,
  showEventMarkers = true,
}: {
  state: GameState;
  selected?: CivId;
  onSelect: (civ: CivId) => void;
  initialZoom?: number;
  /** Temporary visual test harness only; normal gameplay always uses live time. */
  previewFrame?: number;
  showEventMarkers?: boolean;
}) {
  const [zoomStep, setZoomStep] = useState(0);
  const [fit, setFit] = useState({ device: 3, dpr: 1, width: 0, height: 0 });
  const svg = useRef<SVGSVGElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const device = Math.max(
        1,
        Math.floor(Math.min((width * dpr) / 320, (height * dpr) / 200)),
      );
      setFit({ device, dpr, width, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  const baseDevice = Math.max(1, Math.round(fit.device * initialZoom));
  const scale = Math.max(1, baseDevice + zoomStep) / fit.dpr;
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
  }, [scale]);

  // Cheap choices push damage onto a neighbor: draw that as an arrow between towns.
  const spills =
    state.phase === "build"
      ? CIV_IDS.flatMap((from) => {
          const e = EVENTS[state.events[from].type];
          if (state.civs[from].choice !== 0 || !e.cheap.spillTo) return [];
          return [{ from, to: spillTarget(from, e.cheap.spillTo), e }];
        })
      : [];
  return (
    <div className="map-shell pixel-map">
      <LiveTerrain
        key={state.seed}
        state={state}
        svg={svg}
        scale={scale}
        previewFrame={previewFrame}
      />
      <div
        className="map-viewport"
        ref={viewport}
        tabIndex={0}
        aria-label="Map camera. Drag to pan, or use arrow keys."
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const el = e.currentTarget;
          suppressClick.current = false;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: el.scrollLeft,
            top: el.scrollTop,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) {
            d.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.classList.add("panning");
            e.currentTarget.scrollLeft = d.left - (e.clientX - d.x);
            e.currentTarget.scrollTop = d.top - (e.clientY - d.y);
          }
        }}
        onPointerUp={(e) => {
          suppressClick.current = drag.current?.moved ?? false;
          drag.current = null;
          e.currentTarget.classList.remove("panning");
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={(e) => {
          drag.current = null;
          e.currentTarget.classList.remove("panning");
        }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [-80, 0],
            ArrowRight: [80, 0],
            ArrowUp: [0, -80],
            ArrowDown: [0, 80],
          };
          if (delta[e.key]) {
            e.preventDefault();
            e.currentTarget.scrollBy(...delta[e.key]);
          }
        }}
      >
        <svg
          ref={svg}
          className="world-map"
          viewBox="0 0 1280 800"
          style={{
            width: 320 * scale,
            height: 200 * scale,
            marginLeft: Math.max(0, (fit.width - 320 * scale) / 2),
            marginTop: Math.max(0, (fit.height - 200 * scale) / 2),
            marginBottom: "var(--camera-reserve)",
            marginRight: "var(--camera-side)",
          }}
          role="group"
          aria-label="The valley: select a town to inspect it"
        >
          {TOWNS.map((town) => {
            const civ = OWNERS[town.civ];
            const [x, y] = keep(civ);
            const ev =
              showEventMarkers && state.phase !== "ended"
                ? state.events[civ]
                : undefined;
            const e = ev ? EVENTS[ev.type] : undefined;
            const open = () => onSelect(civ);
            return (
              <g
                key={town.id}
                tabIndex={0}
                role="button"
                aria-label={`${town.name}, ${CIVS[civ].name}${e ? `. Facing: ${e.name}` : ""}`}
                onClick={open}
                onKeyDown={(k) => {
                  if (k.key === "Enter" || k.key === " ") {
                    k.preventDefault();
                    open();
                  }
                }}
                className="castle-hotspot"
              >
                <rect
                  x={x - 50}
                  y={y - 44}
                  width="100"
                  height="84"
                  fill="transparent"
                  stroke={selected === civ ? "#ffe379" : "transparent"}
                  strokeWidth="4"
                />
                {e && (
                  <g className="damage-bubble">
                    <rect
                      x={x + 26}
                      y={y - 52}
                      width="34"
                      height="34"
                      fill="#8c2929"
                      stroke="#fff0bf"
                      strokeWidth="3"
                    />
                    <text
                      x={x + 43}
                      y={y - 27}
                      textAnchor="middle"
                      fill="#fff0bf"
                      fontSize="22"
                    >
                      {e.icon}
                    </text>
                    <title>{e.name}</title>
                  </g>
                )}
                <rect
                  x={x - 64}
                  y={y + 10}
                  width="128"
                  height="26"
                  fill="#d9ae52"
                  stroke="#382516"
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={y + 29}
                  textAnchor="middle"
                  fontSize="20"
                  fill="#23170e"
                >
                  {town.name}
                </text>
              </g>
            );
          })}
          {spills.map(({ from, to, e }) => {
            const [x, y] = keep(from),
              [tx, ty] = keep(to);
            // Arrows sharing a destination take separate lanes so they don't overlap.
            const lane = spills.filter(
              (o) => o.to === to && o.from < from,
            ).length;
            const px = pixelArrow(x, y, tx, ty, lane);
            const [light, dark] = ARROW_COLORS[to];
            return (
              <g key={from} className="spill-pixel" shapeRendering="crispEdges">
                <title>
                  {`${CIVS[from].name} chose "${e.cheap.label}": ${CIVS[to].name} takes the damage.`}
                </title>
                <path d={px.outline} fill="#000" />
                <path d={px.dark} fill={dark} />
                <path d={px.light} fill={light} />
                {px.march.map((d, phase) => (
                  <path
                    key={phase}
                    d={d}
                    className={`spill-march phase-${phase}`}
                    fill="#fff6d0"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="map-controls">
        <button
          aria-label="Zoom out"
          onClick={() => setZoomStep(Math.max(1 - baseDevice, zoomStep - 1))}
        >
          −
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => setZoomStep(Math.min(4, zoomStep + 1))}
        >
          +
        </button>
        <button onClick={() => setZoomStep(0)}>Reset</button>
      </div>
      {state.phase !== "ended" &&
        CIV_IDS.some((c) =>
          ["tsunami", "mega_tsunami"].includes(state.events[c].type),
        ) && (
          <div className="sea-warning" role="status">
            ≋ TSUNAMI FROM THE {tsunamiDirection(state).toUpperCase()} · GO
            INLAND / UPHILL
          </div>
        )}
    </div>
  );
}
