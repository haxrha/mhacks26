"use client";
import { type RefObject, useEffect, useRef, useState } from "react";
import { CIVS, EVENTS } from "@/game/content";
import { spillTarget } from "@/game/engine";
import { OWNERS, TOWNS, townOf, ARROW_COLORS } from "@/game/towns";
import { CIV_IDS, type CivId, type GameState } from "@/game/types";
import {
  OCEAN,
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
}: {
  state: GameState;
  svg: RefObject<SVGSVGElement | null>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const el = canvas.current!;
    let image: ImageData;
    let view: WorldView;
    let frame = 0;
    const still = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const trips = new Map<number, { civ: CivId; start: number }>();
    const measure = () => {
      const shell = el.parentElement!.getBoundingClientRect();
      const map = svg.current!.getBoundingClientRect();
      const viewport = svg.current!.parentElement!.getBoundingClientRect();
      // The SVG viewBox and canvas share the same native 4px art grid.
      const scale = Math.min(map.width / 310, map.height / 193.75);
      if (scale <= 0) return;
      const width = Math.max(1, Math.ceil(shell.width / scale));
      const height = Math.max(1, Math.ceil(shell.height / scale));
      el.width = width;
      el.height = height;
      image = ctx.createImageData(width, height);
      view = {
        width,
        height,
        originX: Math.round(
          (map.left - shell.left + (map.width - 310 * scale) / 2) / scale,
        ),
        originY: Math.round(
          (map.top - shell.top + (map.height - 193.75 * scale) / 2) / scale,
        ),
        clip: {
          left: (viewport.left - shell.left) / scale,
          top: (viewport.top - shell.top) / scale,
          right: (viewport.right - shell.left) / scale,
          bottom: (viewport.bottom - shell.top) / scale,
        },
      };
    };
    const draw = () => {
      if (!view) measure();
      if (!view) return;
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
      renderWorldView(s, still ? 24 : frame, image.data, view, traffic);
      ctx.putImageData(image, 0, 0);
      frame++;
    };
    measure();
    draw();
    const resize = new ResizeObserver(measure);
    resize.observe(el.parentElement!);
    resize.observe(svg.current!);
    resize.observe(svg.current!.parentElement!);
    const scroll = () => measure();
    svg.current!.parentElement!.addEventListener("scroll", scroll);
    const timer = window.setInterval(draw, still ? 1000 : 1000 / FPS);
    return () => {
      window.clearInterval(timer);
      resize.disconnect();
      svg.current?.parentElement?.removeEventListener("scroll", scroll);
    };
  }, [svg]);
  return (
    <canvas
      ref={canvas}
      className="world-canvas"
      width={320}
      height={200}
      aria-hidden="true"
    />
  );
}

const keep = (civ: CivId) => {
  const t = townOf(civ);
  return [t.keepTile[0] * 4, t.keepTile[1] * 4] as const;
};

/**
 * A smooth arrow between two towns: a cubic curve that bows to one side by a fixed share of its
 * length, trimmed so it starts and ends outside the town icons, plus an arrowhead that follows
 * the curve's final direction.
 */
function spillArc(x: number, y: number, tx: number, ty: number, lane: number) {
  const len = Math.hypot(tx - x, ty - y) || 1;
  const ux = (tx - x) / len,
    uy = (ty - y) / len;
  // Perpendicular to the left of travel: A->B and B->A bow to opposite sides.
  const nx = uy,
    ny = -ux;
  const start = 48,
    end = 66;
  const sx = x + ux * start,
    sy = y + uy * start;
  const ex = tx - ux * end,
    ey = ty - uy * end;
  const bow = Math.min(150, len * 0.26) * (1 + lane * 0.35);
  const c1x = sx + (ex - sx) * 0.25 + nx * bow,
    c1y = sy + (ey - sy) * 0.25 + ny * bow;
  const c2x = sx + (ex - sx) * 0.75 + nx * bow,
    c2y = sy + (ey - sy) * 0.75 + ny * bow;
  const d = `M${sx} ${sy} C${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`;
  // Arrowhead along the curve's end tangent (from the second control point to the end).
  const tl = Math.hypot(ex - c2x, ey - c2y) || 1;
  const hx = (ex - c2x) / tl,
    hy = (ey - c2y) / tl;
  const size = 26,
    half = 13;
  const tipX = ex + hx * size * 0.55,
    tipY = ey + hy * size * 0.55;
  const baseX = ex - hx * size * 0.45,
    baseY = ey - hy * size * 0.45;
  const b1 = [baseX - hy * half, baseY + hx * half],
    b2 = [baseX + hy * half, baseY - hx * half];
  const head = `M${tipX} ${tipY} L${b1[0]} ${b1[1]} L${b2[0]} ${b2[1]}Z`;
  // The upper half of the head (screen-up) gets the light tone, like the sprites.
  const up = b1[1] <= b2[1] ? b1 : b2;
  const headLight = `M${tipX} ${tipY} L${up[0]} ${up[1]} L${baseX} ${baseY}Z`;
  return { d, head, headLight };
}

export default function WorldMap({
  state,
  selected,
  onSelect,
}: {
  state: GameState;
  selected?: CivId;
  onSelect: (civ: CivId) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const svg = useRef<SVGSVGElement>(null);
  const [arrows, setArrows] = useState(true);
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
        key={`${state.seed}:${state.round}`}
        state={state}
        svg={svg}
      />
      <div className="map-viewport">
        <svg
          ref={svg}
          className="world-map"
          viewBox="0 0 1240 775"
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
          role="group"
          aria-label="The valley: select a town to inspect it"
        >
          {TOWNS.map((town) => {
            const civ = OWNERS[town.civ];
            const [x, y] = keep(civ);
            const ev = state.phase !== "ended" ? state.events[civ] : undefined;
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
          {arrows &&
            spills.map(({ from, to, e }) => {
              const [x, y] = keep(from),
                [tx, ty] = keep(to);
              // Arrows sharing a destination take separate lanes so they don't overlap.
              const lane = spills.filter(
                (o) => o.to === to && o.from < from,
              ).length;
              const { d, head, headLight } = spillArc(x, y, tx, ty, lane);
              const [light, dark] = ARROW_COLORS[to];
              return (
                <g key={from} className="spill-arrow">
                  <title>
                    {`${CIVS[from].name} chose "${e.cheap.label}": ${CIVS[to].name} takes the damage.`}
                  </title>
                  <path
                    className="spill-outline spill-draw"
                    d={d}
                    pathLength={1}
                  />
                  <path
                    className="spill-line spill-draw"
                    d={d}
                    style={{ stroke: dark }}
                    pathLength={1}
                  />
                  <path
                    className="spill-light spill-draw"
                    d={d}
                    style={{ stroke: light }}
                    pathLength={1}
                  />
                  <path className="spill-flow" d={d} />
                  <g className="spill-tip">
                    <path
                      className="spill-head"
                      d={head}
                      style={{ fill: dark }}
                    />
                    <path
                      className="spill-head-light"
                      d={headLight}
                      style={{ fill: light }}
                    />
                  </g>
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
        <button onClick={() => setZoom(1)}>Reset</button>
        <button aria-pressed={arrows} onClick={() => setArrows(!arrows)}>
          Spill arrows
        </button>
      </div>
      {state.phase !== "ended" &&
        CIV_IDS.some((c) => state.events[c].type === "tsunami") && (
          <div className="sea-warning" role="status">
            ≋ TSUNAMI FROM THE {tsunamiDirection(state).toUpperCase()} · GO
            INLAND / UPHILL
          </div>
        )}
    </div>
  );
}
