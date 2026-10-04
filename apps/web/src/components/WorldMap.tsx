"use client";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { HazardFrames } from "@/game/hazardVisuals";
import { CIVS, EVENTS } from "@/game/content";
import { spillTarget } from "@/game/engine";
import { OWNERS, TOWNS, townOf } from "@/game/towns";
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
}: {
  state: GameState;
  svg: RefObject<SVGSVGElement | null>;
  previewFrame?: number;
}) {
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
      const scale = Math.min(map.width / 320, map.height / 200);
      if (!Number.isFinite(scale) || scale <= 0) return false;
      const width = Math.max(1, Math.ceil(shell.width / scale));
      const height = Math.max(1, Math.ceil(shell.height / scale));
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
        originX: Math.round(
          (map.left - shell.left + (map.width - 320 * scale) / 2) / scale,
        ),
        originY: Math.round(
          (map.top - shell.top + (map.height - 200 * scale) / 2) / scale,
        ),
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
  const [zoom, setZoom] = useState(initialZoom);
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
    const el = viewport.current!;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [zoom]);

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
            width: `calc((100% - var(--camera-side)) * ${zoom})`,
            height: `calc((100% - var(--camera-reserve)) * ${zoom})`,
            marginBottom: "var(--camera-reserve)",
            marginRight: "var(--camera-side)",
          }}
          role="group"
          aria-label="The valley: select a town to inspect it"
        >
          <defs>
            <marker
              id="flow-tip"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8Z" fill="#fff1b0" />
            </marker>
          </defs>
          {spills.map(({ from, to, e }, i) => {
            const [x, y] = keep(from),
              [tx, ty] = keep(to);
            return (
              <g key={from}>
                <path
                  className="province-flow"
                  d={`M${x} ${y} Q${(x + tx) / 2 + 40 + i * 20} ${(y + ty) / 2 - 60} ${tx} ${ty}`}
                  fill="none"
                  stroke={e.color}
                  strokeWidth="7"
                  strokeDasharray="14 9"
                  markerEnd="url(#flow-tip)"
                />
                <title>
                  {`${CIVS[from].name} chose "${e.cheap.label}": ${CIVS[to].name} takes the damage.`}
                </title>
              </g>
            );
          })}
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
        </svg>
      </div>
      <div className="map-controls">
        <button
          aria-label="Zoom out"
          onClick={() => setZoom(Math.max(0.8, zoom - 0.2))}
        >
          −
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => setZoom(Math.min(2, zoom + 0.2))}
        >
          +
        </button>
        <button onClick={() => setZoom(initialZoom)}>Reset</button>
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
