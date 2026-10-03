"use client";
import { useState } from "react";
import areas from "../../../../src/data/provinces.json";
import { BUILDINGS, CIVS, DISASTERS, TERRAIN } from "@/game/content";
import type { CivId, GameState, Tile } from "@/game/types";

// The original specification's simulation IDs map to the repository's visual regions.
const owners: Record<string, CivId> = {
  highland: "heartland",
  verdant: "enclave",
  forge: "petrostate",
  tidehaven: "archipelago",
};
function districts(state: GameState, area: (typeof areas.provinces)[number]) {
  const provinces = areas.provinces.filter((p) => p.civ === area.civ);
  const index = provinces.findIndex((p) => p.id === area.id);
  return state.tiles
    .filter((t) => t.owner === owners[area.civ])
    .filter((_, i) => i % provinces.length === index);
}
export default function WorldMap({
  state,
  selected,
  onSelect,
  flowIndex = 0,
}: {
  state: GameState;
  selected?: string;
  onSelect: (tile: Tile) => void;
  flowIndex?: number;
}) {
  const [areaId, setAreaId] = useState<string>();
  const [zoom, setZoom] = useState(1);
  const [networks, setNetworks] = useState(true);
  const area = areas.provinces.find((p) => p.id === areaId);
  const center = (civ: CivId) => {
    const p = areas.provinces.find((p) => owners[p.civ] === civ && p.capital)!;
    return [p.castleTile[0] * 4, p.castleTile[1] * 4];
  };
  return (
    <div className="map-shell pixel-map">
      <div className="map-viewport">
        <svg
          className="world-map"
          viewBox="0 0 1280 800"
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
          role="group"
          aria-label="Shared world: select a castle to inspect its districts"
        >
          <image
            href="/assets/world-map.png"
            width="1280"
            height="800"
            style={{ imageRendering: "pixelated" }}
          />
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
          {networks &&
            state.phase === "flows" &&
            state.flows.slice(0, flowIndex + 1).map((flow, i) => {
              const [x, y] = center(flow.from),
                [tx, ty] = center(flow.to);
              return (
                <g key={flow.id}>
                  <path
                    className="province-flow"
                    d={`M${x} ${y} Q${(x + tx) / 2 + i * 16} ${(y + ty) / 2 - 45} ${tx} ${ty}`}
                    fill="none"
                    stroke={DISASTERS[flow.type].color}
                    strokeWidth="6"
                    strokeDasharray="12 8"
                    markerEnd="url(#flow-tip)"
                  />
                  <title>{flow.caption}</title>
                </g>
              );
            })}
          {areas.provinces.map((p) => {
            const tiles = districts(state, p);
            const damaged = tiles.filter((t) => t.disruption > 0);
            const built = tiles.filter((t) => t.building);
            const x = p.castleTile[0] * 4,
              y = p.castleTile[1] * 4;
            const chosen = tiles.some((t) => t.id === selected);
            return (
              <g
                key={p.id}
                tabIndex={0}
                role="button"
                aria-label={`${p.name}, ${CIVS[owners[p.civ]].name}, ${damaged.length} damaged districts`}
                onClick={() => {
                  setAreaId(p.id);
                  onSelect(tiles[0]);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setAreaId(p.id);
                    onSelect(tiles[0]);
                  }
                }}
                className="castle-hotspot"
              >
                <rect
                  x={x - 40}
                  y={y - 34}
                  width="80"
                  height="80"
                  fill="transparent"
                  stroke={chosen ? "#ffe379" : "transparent"}
                  strokeWidth="4"
                />
                {damaged.length > 0 && (
                  <g className="damage-bubble">
                    <rect
                      x={x + 18}
                      y={y - 38}
                      width="28"
                      height="28"
                      fill="#8c2929"
                      stroke="#fff0bf"
                      strokeWidth="3"
                    />
                    <text
                      x={x + 32}
                      y={y - 17}
                      textAnchor="middle"
                      fill="#fff0bf"
                      fontSize="24"
                    >
                      !
                    </text>
                    <title>
                      {damaged
                        .map(
                          (t) => `${t.id}: ${t.effect}, ${t.disruption} turns`,
                        )
                        .join("; ")}
                    </title>
                  </g>
                )}
                {built.length > 0 && (
                  <text x={x - 22} y={y - 25} fontSize="22" fill="#fff0bf">
                    ⚒{built.length}
                  </text>
                )}
                <rect
                  x={x - 57}
                  y={y + 30}
                  width="114"
                  height="24"
                  fill={p.capital ? "#d9ae52" : "#f1deb0"}
                  stroke="#382516"
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={y + 47}
                  textAnchor="middle"
                  fontSize="19"
                  fill="#23170e"
                >
                  {p.name}
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
        <button onClick={() => setZoom(1)}>Reset</button>
        <button aria-pressed={networks} onClick={() => setNetworks(!networks)}>
          Flow arrows
        </button>
      </div>
      {area && (
        <div
          className="province-districts"
          aria-label={`${area.name} districts`}
        >
          <b>{area.name} · select a district</b>
          <div>
            {districts(state, area).map((tile) => (
              <button
                key={tile.id}
                className={selected === tile.id ? "active" : ""}
                onClick={() => onSelect(tile)}
              >
                {TERRAIN[tile.terrain].name}{" "}
                {tile.building ? BUILDINGS[tile.building].icon : ""}{" "}
                {tile.disruption ? "!" : ""}
                <small>{tile.id}</small>
              </button>
            ))}
          </div>
          <button
            aria-label="Close districts"
            onClick={() => setAreaId(undefined)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
