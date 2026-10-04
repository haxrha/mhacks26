/** Seeded pixel art hazards. Animation time never changes the simulation or saves. */
import config from "../../../../src/data/disaster-visuals.json";
import world from "../../../../src/data/worldmap.json";
import ocean from "../../../../src/data/ocean.json";
import { OWNERS, TOWNS } from "./towns";
import {
  portRoute,
  fishingTraffic,
  type AreaStatus,
  type WorldLayers,
} from "./worldRender";

export type HazardFrames = Partial<
  Record<number, Partial<Record<string, number>>>
>;

const W = world.w,
  H = world.h;
type Color = readonly number[];
const color = (hex: string) =>
  [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16));
const P = Object.fromEntries(
  Object.entries(config.palette).map(([k, v]) => [k, color(v)]),
);

/** Wide, seeded looping tracks; translation is separate from cloud rotation. */
function stormAnchor(
  L: WorldLayers,
  area: number,
  frame: number,
  seed: number,
  hurricane: boolean,
) {
  const [cx, cy] = TOWNS[area].keepTile;
  const phase = visualNoise(area, 19, seed) * Math.PI * 2;
  const t = (frame / config.storm.period) * Math.PI * 2;
  const radius = 0.82 + Math.sin(t * 3 + phase) * 0.18;
  let x = cx + Math.cos(t + phase) * config.storm.trackWidth * radius;
  let y =
    cy +
    Math.sin(t * 2 + phase) * config.storm.trackHeight * (hurricane ? 0.8 : 1);
  // Stay in this region or its adjacent sea rather than crossing unrelated towns.
  const allowed = (px: number, py: number) => {
    const i = Math.round(py) * W + Math.round(px);
    return (
      px >= 0 &&
      py >= 0 &&
      px < W &&
      py < H &&
      (L.area[i] === area || (L.kind[i] <= 2 && L.near[i] === area))
    );
  };
  for (let n = 0; n < 12 && !allowed(x, y); n++) {
    x = (x + cx) / 2;
    y = (y + cy) / 2;
  }
  return [x, y] as const;
}
const tracks = new Map<string, readonly (readonly [number, number])[]>();
export function stormPosition(
  L: WorldLayers,
  area: number,
  frame: number,
  seed: number,
  hurricane: boolean,
) {
  const key = `${area}:${seed}:${hurricane}`;
  let points = tracks.get(key);
  const count = 48;
  if (!points) {
    points = Array.from({ length: count }, (_, n) =>
      stormAnchor(L, area, (n * config.storm.period) / count, seed, hurricane),
    );
    // Blend constrained anchors before interpolation; a boundary correction
    // must not become a sudden sprint back toward the capital.
    for (let pass = 0; pass < 8; pass++) {
      const previous: readonly (readonly [number, number])[] = points!;
      points = previous.map(
        (p, n) =>
          [0, 1].map(
            (c) =>
              p[c] * 0.5 +
              previous[(n + count - 1) % count][c] * 0.25 +
              previous[(n + 1) % count][c] * 0.25,
          ) as [number, number],
      );
    }
    tracks.set(key, points!);
    if (tracks.size > 32) tracks.delete(tracks.keys().next().value!);
  }
  const pos = (frame / config.storm.period) * count,
    base = Math.floor(pos),
    t = pos - base;
  const at = (n: number) => points![((n % count) + count) % count];
  const p0 = at(base - 1),
    p1 = at(base),
    p2 = at(base + 1),
    p3 = at(base + 2);
  return [0, 1].map(
    (c) =>
      0.5 *
      (2 * p1[c] +
        (-p0[c] + p2[c]) * t +
        (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t +
        (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t),
  ) as [number, number];
}

export interface StormPickup {
  id: string;
  kind: "boat" | "roof" | "tree";
  x: number;
  y: number;
  caught: number;
}
const pickupCache = new Map<string, StormPickup[]>();
const windTracks = new Map<string, Float32Array>();
/** Earliest contact across the entire track, cached independently of camera and frame. */
function windArrival(
  L: WorldLayers,
  area: number,
  seed: number,
  hurricane: boolean,
) {
  const key = `${area}:${seed}:${hurricane}`;
  const cached = windTracks.get(key);
  if (cached) return cached;
  const field = new Float32Array(W * H).fill(Infinity);
  const radius = hurricane
    ? config.storm.hurricanePickupRadius
    : config.storm.pickupRadius;
  for (let t = 0; t < config.storm.period; t += 2) {
    const [cx, cy] = stormPosition(L, area, t, seed, hurricane);
    for (
      let y = Math.max(0, Math.floor(cy - radius));
      y < Math.min(H, cy + radius);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(cx - radius));
        x < Math.min(W, cx + radius);
        x++
      ) {
        const i = y * W + x;
        if (
          L.area[i] === area &&
          L.kind[i] > 3 &&
          Math.hypot(x - cx, (y - cy) * 1.3) < radius * 0.8
        )
          field[i] = Math.min(field[i], t);
      }
  }
  windTracks.set(key, field);
  if (windTracks.size > 16) windTracks.delete(windTracks.keys().next().value!);
  return field;
}
const scarFields = new Map<string, Float32Array>();
function scarField(seed: number, area: number) {
  const key = `${seed}:${area}`;
  const cached = scarFields.get(key);
  if (cached) return cached;
  const field = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      field[y * W + x] =
        (Math.sin(x / 11 + (seed % 31)) +
          Math.cos(y / 9 + area) +
          Math.sin((x + y) / 17) +
          3) /
        6;
  scarFields.set(key, field);
  if (scarFields.size > 16) scarFields.delete(scarFields.keys().next().value!);
  return field;
}
/** Objects are collected when the moving track reaches their actual map position. */
export function stormPickups(
  L: WorldLayers,
  area: number,
  status: AreaStatus,
  frame: number,
  seed: number,
  hurricane: boolean,
): StormPickup[] {
  const key = `${area}:${seed}:${hurricane}:${status.buildings.join(",")}`;
  const cached = pickupCache.get(key);
  if (cached) return cached.filter((p) => p.caught <= frame);
  const candidates: Omit<StormPickup, "caught">[] = [];
  const berth = portRoute(OWNERS[TOWNS[area].civ])[0];
  candidates.push({
    id: `port:${area}`,
    kind: "boat",
    x: berth[0],
    y: berth[1] + 2,
  });
  world.sprites.forEach((sp, n) => {
    if (sp.kind === "boat")
      candidates.push({ id: `sprite:${n}`, kind: "boat", x: sp.x, y: sp.y });
  });
  world.castles[area].slots.forEach(([x, y], n) => {
    if (n < status.buildings.length)
      candidates.push({
        id: `building:${area}:${n}`,
        kind: "roof",
        x: x + 3,
        y: y + 4,
      });
  });
  for (let y = 4; y < H; y += 9)
    for (let x = 4; x < W; x += 9)
      if (L.area[y * W + x] === area && L.kind[y * W + x] === 5)
        candidates.push({ id: `tree:${x}:${y}`, kind: "tree", x, y });
  const picked: StormPickup[] = [];
  const radius = hurricane
    ? config.storm.hurricanePickupRadius
    : config.storm.pickupRadius;
  const caughtFishing = new Set<string>();
  for (let t = 0; t <= config.storm.period * 2; t += 2) {
    const [x, y] = stormPosition(L, area, t, seed, hurricane);
    for (const boat of fishingTraffic(t)) {
      if (
        !caughtFishing.has(boat.id) &&
        Math.hypot(boat.x - x, boat.y - y) < radius
      ) {
        picked.push({ ...boat, kind: "boat", caught: t });
        caughtFishing.add(boat.id);
      }
    }
    for (let n = candidates.length - 1; n >= 0; n--)
      if (Math.hypot(candidates[n].x - x, candidates[n].y - y) < radius) {
        picked.push({ ...candidates[n], caught: t });
        candidates.splice(n, 1);
      }
  }
  pickupCache.set(key, picked);
  if (pickupCache.size > 48)
    pickupCache.delete(pickupCache.keys().next().value!);
  return picked.filter((p) => p.caught <= frame);
}
export const visualNoise = (x: number, y: number, seed = 0) => {
  let n = Math.imul(x ^ Math.imul(y, 374761393) ^ seed, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const low = (k: number) => [3, 4, 5, 6, 7, 10, 11, 12].includes(k);
const pixel = (
  out: Uint8ClampedArray,
  x: number,
  y: number,
  c: Color,
  opacity = 1,
) => {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4;
  out[o] = c[0];
  out[o + 1] = c[1];
  out[o + 2] = c[2];
  out[o + 3] = Math.round(opacity * 255);
};
const line = (
  out: Uint8ClampedArray,
  x: number,
  y: number,
  tx: number,
  ty: number,
  c: Color,
  mask?: (x: number, y: number) => boolean,
) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y)));
  for (let n = 0; n <= steps; n++) {
    const px = Math.round(x + ((tx - x) * n) / steps),
      py = Math.round(y + ((ty - y) * n) / steps);
    if (!mask || mask(px, py)) pixel(out, px, py, c);
  }
};
const sprite = (
  out: Uint8ClampedArray,
  rows: string[],
  x: number,
  y: number,
  palette: Record<string, Color>,
) => {
  rows.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (palette[ch]) pixel(out, x + i, y + j, palette[ch]);
    }),
  );
};

const riverFields = new WeakMap<WorldLayers, Uint16Array>();
/** Water reaches connected low ground; hills and ocean cannot seed a river flood. */
export function riverFloodDistance(L: WorldLayers) {
  const prior = riverFields.get(L);
  if (prior) return prior;
  const d = new Uint16Array(W * H).fill(65535),
    queue: number[] = [];
  L.kind.forEach((k, i) => {
    if (k === 3) {
      d[i] = 0;
      queue.push(i);
    }
  });
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head],
      x = i % W;
    for (const j of [
      i - W,
      i + W,
      x > 0 ? i - 1 : -1,
      x < W - 1 ? i + 1 : -1,
    ]) {
      if (j < 0 || j >= d.length || !low(L.kind[j])) continue;
      const next = d[i] + ([4, 5].includes(L.kind[j]) ? 2 : 1);
      if (next < d[j] && next <= config.flood.damReach + 4) {
        d[j] = next;
        queue.push(j);
      }
    }
  }
  riverFields.set(L, d);
  return d;
}

const fireCache = new Map<string, Int16Array>();
/** Tree groups ignite irregularly. Each five-second step can ignite 30% of adjacent groups. */
export function fireArrivals(
  L: WorldLayers,
  area: number,
  seed: number,
  step: number,
) {
  step = Math.min(config.fire.maxSteps, step);
  const key = `${area}:${seed}:${step}`,
    prior = fireCache.get(key);
  if (prior) return prior;
  const spacing = config.fire.treeSpacing,
    gw = Math.ceil(W / spacing),
    gh = Math.ceil(H / spacing);
  const fuel = new Uint8Array(gw * gh),
    arrival = new Int16Array(gw * gh).fill(-1);
  const [cx, cy] = TOWNS[area].keepTile;
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const x = gx * spacing,
        y = gy * spacing,
        i = y * W + x,
        n = gy * gw + gx;
      if (
        L.kind[i] === 5 ||
        ([6, 7].includes(L.kind[i]) && visualNoise(gx, gy, seed) < 0.38)
      )
        fuel[n] = 1;
      const patches = [
        [cx - 11, cy + 3, 9],
        [cx + 9, cy - 9, 6],
        [cx - 2, cy + 14, 7],
      ];
      if (
        fuel[n] &&
        L.area[i] === area &&
        patches.some(([px, py, r]) => Math.hypot(x - px, y - py) < r) &&
        visualNoise(gx, gy, seed + 17) < 0.55
      )
        arrival[n] = 0;
    }
  for (let t = 1; t <= step; t++) {
    const newly: number[] = [];
    for (let n = 0; n < fuel.length; n++) {
      if (!fuel[n] || arrival[n] >= 0) continue;
      const gx = n % gw,
        gy = Math.floor(n / gw);
      const neighbors = [-1, 0, 1].flatMap((dy) =>
        [-1, 0, 1].map((dx) => [gx + dx, gy + dy]),
      );
      if (
        neighbors.some(
          ([x, y]) =>
            x >= 0 && y >= 0 && x < gw && y < gh && arrival[y * gw + x] >= 0,
        ) &&
        visualNoise(gx, gy, seed + t * 7919) < config.fire.spreadChance
      )
        newly.push(n);
    }
    for (const n of newly) arrival[n] = t;
  }
  fireCache.set(key, arrival);
  if (fireCache.size > 48) fireCache.delete(fireCache.keys().next().value!);
  return arrival;
}

export function hazardPaint(
  L: WorldLayers,
  status: AreaStatus[],
  frame: number,
  seed: number,
  clocks?: HazardFrames,
) {
  const under = new Uint8ClampedArray(W * H * 4),
    over = new Uint8ClampedArray(under.length);
  const river = riverFloodDistance(L),
    dam = status.some((s) => s.effects.has("dam_failure"));
  const damSprite = world.sprites.find((s) => s.kind === "dam");
  const damY = damSprite?.y ?? 50;
  const damArea = status.findIndex((s) => s.effects.has("dam_failure"));
  const damFrame = clocks?.[damArea]?.dam_failure ?? frame;
  const phase = damFrame % config.flood.period;
  for (let i = 0; i < W * H; i++) {
    const x = i % W,
      y = Math.floor(i / W),
      k = L.kind[i],
      a = L.area[i];
    const fx = status[a]?.effects;
    if (!fx && !dam) continue;
    const n = visualNoise(Math.floor(x / 5), Math.floor(y / 4), seed);
    const isDam = dam && y > damY && y < damY + phase * 1.1;
    if (low(k) && (fx?.has("flood") || isDam)) {
      const reach =
        (isDam ? config.flood.damReach : config.flood.bankReach) *
          (0.7 + 0.3 * Math.sin(frame / 22 + y / 16)) +
        n * 3;
      if (river[i] < reach) {
        const edge = river[i] > reach - 1.8;
        pixel(
          over,
          x,
          y,
          edge && (x + y + Math.floor(frame / 3)) % 3 === 0
            ? P.foam
            : (x + y * 2 - Math.floor(frame / 2)) % 13 < 2
              ? P.water
              : P.muddyWater,
        );
      }
    }
    if ((fx?.has("sea_rise") || fx?.has("hurricane")) && low(k)) {
      const reach =
        4 +
        config.flood.surgeReach *
          (fx?.has("hurricane") ? 0.65 : 1) *
          Math.min(
            1,
            ((clocks?.[a]?.sea_rise ?? clocks?.[a]?.hurricane ?? frame) % 144) /
              60,
          ) +
        n * 2;
      if (L.distSea[i] < reach)
        pixel(
          over,
          x,
          y,
          L.distSea[i] > reach - 2 && (x + y - Math.floor(frame / 2)) % 3 === 0
            ? P.foam
            : P.water,
        );
    }
    if (fx?.has("drought") && [3, 6, 7, 11].includes(k)) {
      const [cx, cy] = TOWNS[a].keepTile;
      let intensity = 0.2;
      for (const [dx, dy, rx, ry] of [
        [-18, 9, 26, 14],
        [15, -15, 18, 12],
        [12, 23, 24, 10],
      ]) {
        const d = ((x - cx - dx) / rx) ** 2 + ((y - cy - dy) / ry) ** 2;
        intensity = Math.max(intensity, Math.max(0, 1 - d) * (0.85 + n * 0.2));
      }
      if (k !== 3 || (intensity > 0.7 && L.hash[i] > 140)) {
        const base = L.palette[L.base[i]],
          dry = intensity > 0.65 ? P.soil : P.dry;
        pixel(
          under,
          x,
          y,
          base.map((v, c) => v * (1 - intensity) + dry[c] * intensity),
        );
        if (
          intensity > 0.75 &&
          ((x + Math.floor(y / 6)) % 11 === 0 ||
            (y + Math.floor(x / 8)) % 9 === 0)
        )
          pixel(under, x, y, P.crack);
      }
    }
  }

  status.forEach((s, area) => {
    const fx = s.effects,
      [cx, cy] = TOWNS[area].keepTile;
    const age = (id: string) => clocks?.[area]?.[id] ?? frame;
    const inArea = (x: number, y: number) =>
      x >= 0 &&
      y >= 0 &&
      x < W &&
      y < H &&
      L.area[y * W + x] === area &&
      L.kind[y * W + x] > 3;
    // Flood-borne logs and roof fragments make the current and damage legible.
    if (
      fx.has("flood") ||
      fx.has("dam_failure") ||
      fx.has("sea_rise") ||
      fx.has("hurricane")
    ) {
      const wet: number[] = [];
      for (let i = 0; i < W * H; i++) {
        const owner = L.area[i] === 255 ? L.near[i] : L.area[i];
        if (
          owner === area &&
          (L.kind[i] === 3 || over[i * 4 + 3]) &&
          low(L.kind[i])
        )
          wet.push(i);
      }
      if (wet.length)
        for (let n = 0; n < 7; n++) {
          const i = wet[Math.floor(visualNoise(n, area, seed) * wet.length)];
          const x = i % W,
            y = Math.floor(i / W);
          if (dam && y > damY + phase * 1.1) continue;
          const bob = Math.floor(frame / 5 + n) % 2;
          const rows = n % 3 ? ["bbbbb", ".b.b."] : [".rrr.", "r.r.r", ".w.w."];
          rows.forEach((row, dy) =>
            [...row].forEach((ch, dx) => {
              const px = x + dx - 2,
                py = y + dy + bob,
                j = py * W + px;
              if (
                px < 0 ||
                py < 0 ||
                px >= W ||
                py >= H ||
                (L.area[j] === 255 ? L.near[j] : L.area[j]) !== area
              )
                return;
              const colors: Record<string, Color> = {
                b: [137, 103, 62],
                r: [157, 74, 47],
                w: [187, 150, 98],
              };
              if (colors[ch]) pixel(over, px, py, colors[ch]);
            }),
          );
        }
    }
    if (fx.has("earthquake") || fx.has("small_quake")) {
      const major = fx.has("earthquake"),
        branches = major ? 4 : 2;
      for (let b = 0; b < branches; b++) {
        let x = cx - 22 + b * 10,
          y = cy - 17;
        for (let t = 0; t < 7; t++) {
          const nx = x + Math.round(visualNoise(b, t, seed + area) * 12 - 6),
            ny = y + 5;
          line(under, x, y, nx, ny, P.crack, inArea);
          if (major) line(under, x + 1, y, nx + 1, ny, P.soil, inArea);
          if (t % 2 === 0)
            line(under, x, y, x + (b % 2 ? 7 : -7), y + 3, P.crack, inArea);
          x = nx;
          y = ny;
        }
      }
      for (let p = 0; p < 7; p++) {
        const x = cx - 20 + p * 6,
          y = cy + 5 - ((frame + p * 3) % 14);
        if (
          age(fx.has("earthquake") ? "earthquake" : "small_quake") %
            config.quake.period <
          config.quake.shakeFrames
        )
          sprite(over, [".dd.", "dddd", ".dd."], x, y, { d: P.cloudDark });
      }
    }
    if (fx.has("landslide")) {
      const localFrame = age("landslide");
      const t =
        (localFrame % config.landslide.period) / config.landslide.period;
      const sx = cx - 15,
        sy = cy - 17;
      for (let dy = 0; dy < config.landslide.length; dy++) {
        const head = Math.min(
          config.landslide.length,
          8 + t * config.landslide.length * 1.5,
        );
        if (dy > head) continue;
        const width =
          2 + (dy / config.landslide.length) * config.landslide.width;
        for (let dx = -Math.ceil(width); dx <= width; dx++) {
          const x = Math.round(sx + dy * 0.45 + dx),
            y = sy + dy;
          if (
            inArea(x, y) &&
            Math.abs(dx) < width * (0.65 + visualNoise(x, y, seed) * 0.35)
          )
            pixel(
              over,
              x,
              y,
              visualNoise(x, y) > 0.6 ? [181, 137, 82] : [130, 91, 53],
            );
        }
      }
      for (let n = 0; n < 7; n++) {
        const d = (localFrame / 3 + n * 5) % config.landslide.length,
          x = sx + d * 0.45 + (((n % 3) - 1) * d) / 5,
          y = sy + d;
        sprite(over, [".rr.", "rRRr", ".rr."], x, y, {
          r: [87, 76, 63],
          R: [162, 146, 121],
        });
        const dustX = Math.round(x - 3),
          dustY = Math.round(y - 4);
        if (inArea(dustX, dustY))
          sprite(over, ["..dd..", ".dddd.", "ddd.dd"], dustX, dustY, {
            d: [198, 174, 130],
          });
      }
    }
    for (const scar of s.scars ?? []) {
      const incidentAge =
        scar.type === "mega_tsunami"
          ? (Object.values(clocks ?? {}).find(
              (c) => c?.mega_tsunami !== undefined,
            )?.mega_tsunami ?? frame)
          : age(scar.type);
      if (
        scar.type.includes("tsunami") &&
        incidentAge <
          (scar.type === "mega_tsunami"
            ? ocean.tsunami.largeFrames
            : ocean.tsunami.frames)
      )
        continue;
      const strength =
        Math.min(1, scar.severity / 3) * Math.min(1, scar.remaining / 2);
      const patches = scarField(seed, area);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (L.area[i] !== area || !low(L.kind[i])) continue;
          const patch = patches[i];
          const affected = scar.type === "mega_tsunami" || patch > 0.45;
          if (!affected) continue;
          if (
            L.kind[i] === 5 &&
            patch <
              strength *
                (scar.type === "mega_tsunami"
                  ? ocean.tsunami.largeForestDestruction
                  : 0.8)
          ) {
            const cluster = visualNoise(
              Math.floor(x / 9),
              Math.floor(y / 7),
              seed,
            );
            const trunk =
              cluster > 0.55 &&
              x % 9 > 1 &&
              x % 9 < 7 &&
              y % 7 === Math.round(2 + (x % 9) * 0.3);
            pixel(
              over,
              x,
              y,
              trunk
                ? P.soil
                : visualNoise(x, y, seed) > 0.8
                  ? [109, 98, 59]
                  : [83, 87, 46],
            );
          } else if (L.distSea[i] < 18 && scar.type.includes("tsunami")) {
            pixel(under, x, y, patch < 0.4 ? P.muddyWater : [133, 119, 73]);
          } else if (patch < strength * 0.65)
            pixel(
              under,
              x,
              y,
              scar.type === "volcano" ? P.char : [153, 129, 78],
            );
        }
    }
    if (fx.has("volcano")) {
      const vf = age("volcano"),
        [vx, vy] = [cx - 12, cy - 18];
      // Cone, crater and incandescent lava are separate from wildfire effects.
      for (let y = 0; y < 20; y++)
        for (let x = -y * 0.8; x <= y * 0.8; x++)
          pixel(
            over,
            vx + x,
            vy + y,
            Math.round(x + y) % 4 ? [75, 59, 48] : P.char,
          );
      sprite(
        over,
        ["..rrrrrr..", ".roooooor.", "rryyyyyyrr", ".rrrrrrrr."],
        vx - 5,
        vy,
        { r: [144, 44, 21], o: P.fire, y: P.ember },
      );
      for (let branch = 0; branch < 3; branch++)
        for (
          let d = 0;
          d < Math.min(config.volcano.flowLength, 8 + vf * 0.5);
          d++
        ) {
          const x =
              vx +
              Math.sin(d / 9 + branch) * d * 0.18 +
              (branch - 1) * d * 0.35,
            y = vy + 4 + d;
          if (!inArea(Math.round(x), Math.round(y))) continue;
          for (let w = -3; w <= 3; w++)
            pixel(
              over,
              x + w,
              y,
              Math.abs(w) > 1
                ? P.char
                : Math.sin(d / 3 - vf * 1.7) > 0
                  ? P.fire
                  : P.ember,
            );
        }
      for (let n = 0; n < 18; n++) {
        const h = (vf * 1.3 + n * 3) % config.volcano.plumeHeight;
        const x = vx + Math.sin(n * 2 + vf / 8) * (3 + h * 0.24),
          y = vy - h;
        sprite(over, [".aaaa.", "aaaaaa", ".aaaa."], x, y, {
          a: n % 3 ? P.cloudDark : P.char,
        });
      }
      for (let n = 0; n < 12; n++) {
        const t =
          ((vf + n * 2) % config.volcano.eruptionFrames) /
          config.volcano.eruptionFrames;
        const x = vx + (n - 5.5) * t * 5,
          y = vy - 30 * Math.sin(t * Math.PI) + t * 12;
        pixel(over, x, y, P.ember);
        pixel(over, x, y + 1, P.fire);
      }
      for (let y = Math.max(0, cy - 35); y < Math.min(H, cy + 40); y++)
        for (let x = Math.max(0, cx - 40); x < Math.min(W, cx + 40); x++)
          if (
            inArea(x, y) &&
            Math.hypot(x - vx, y - vy) < config.volcano.ashRadius &&
            visualNoise(x, y, seed) < 0.3
          )
            pixel(under, x, y, [122, 112, 96]);
    }
    if (fx.has("wildfire")) {
      const step = Math.floor(
        age(fx.has("wildfire") ? "wildfire" : "volcano") /
          (6 * config.fire.spreadSeconds),
      );
      const arrivals = fireArrivals(L, area, seed, step),
        spacing = config.fire.treeSpacing,
        gw = Math.ceil(W / spacing);
      for (let n = 0; n < arrivals.length; n++) {
        if (arrivals[n] < 0) continue;
        const x = (n % gw) * spacing,
          y = Math.floor(n / gw) * spacing;
        for (let dy = -1; dy <= 2; dy++)
          for (let dx = -1; dx <= 2; dx++)
            if (visualNoise(x + dx, y + dy, seed) > 0.18)
              pixel(under, x + dx, y + dy, P.char);
        if (
          step - arrivals[n] <= config.fire.flameSteps &&
          visualNoise(x, y, seed) < 0.62
        ) {
          const poses = [
            ["..y..", ".yoy.", ".oro.", "..r.."],
            [".y...", ".oy..", "roor.", ".rr.."],
            ["...y.", "..yo.", ".roor", "..rr."],
          ];
          sprite(over, poses[Math.floor(frame / 4 + n) % 3], x - 2, y - 3, {
            r: [177, 53, 23],
            o: P.fire,
            y: P.ember,
          });
        }
      }
    }
    if (fx.has("spill")) {
      let source = -1,
        best = Infinity;
      L.kind.forEach((k, i) => {
        if (k > 3) return;
        const d = Math.hypot((i % W) - cx, Math.floor(i / W) - cy);
        if (d < best) {
          best = d;
          source = i;
        }
      });
      const sx = source % W,
        sy = Math.floor(source / W);
      for (let y = Math.max(0, sy - 12); y < Math.min(H, sy + 38); y++)
        for (let x = Math.max(0, sx - 30); x < Math.min(W, sx + 31); x++) {
          if (L.kind[y * W + x] > 3) continue;
          const d =
            ((x - sx - Math.sin(y / 7 + frame / 36) * 4) / 22) ** 2 +
            ((y - sy - 9) / 26) ** 2;
          if (
            d <
            0.65 +
              visualNoise(Math.floor(x / 3), Math.floor(y / 3), seed) * 0.35
          )
            pixel(
              over,
              x,
              y,
              (x + y + Math.floor(frame / 8)) % 9 < 2
                ? [87, 73, 96]
                : (x + y) % 7 === 0
                  ? [107, 104, 54]
                  : [37, 34, 28],
            );
        }
      sprite(over, ["bbb", "bdb", "bbb", ".b."], sx, sy, {
        b: [112, 78, 40],
        d: P.crack,
      });
    }
    if (fx.has("hurricane") || fx.has("tornado")) {
      const hurricane = fx.has("hurricane"),
        fiery = fx.has("wildfire") || fx.has("volcano");
      const stormFrame = age(hurricane ? "hurricane" : "tornado");
      const t = (stormFrame / config.storm.period) * Math.PI * 2;
      const [x0, y0] = stormPosition(L, area, stormFrame, seed, hurricane);
      const pickups = stormPickups(L, area, s, stormFrame, seed, hurricane);
      const contact = windArrival(L, area, seed, hurricane);
      // Wind strips vegetation and scatters debris; burning debris ignites the wake.
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x,
            since = stormFrame - contact[i];
          if (since < 0 || !Number.isFinite(since)) continue;
          const patch = visualNoise(x, y, seed);
          if (patch > 0.3)
            pixel(
              over,
              x,
              y,
              fiery ? P.char : patch > 0.75 ? P.soil : [97, 104, 57],
              fiery ? 0.85 : 0.6,
            );
          if (x % 7 === 0 && y % 5 === 0 && patch > 0.58) {
            sprite(over, ["bb.b", ".bb.", "b..."], x, y, {
              b: fiery ? P.char : P.soil,
            });
            if (fiery && since < config.storm.carryFrames * 2) {
              const flicker = Math.sin(frame * 1.7 + x + y) > 0;
              sprite(
                over,
                flicker
                  ? ["..e..", ".efe.", "fffff", ".rrr."]
                  : [".e...", "effe.", ".fff.", ".rrr."],
                x + Math.floor(visualNoise(x, y, seed + 3) * 5) - 2,
                y - 4 + Math.floor(visualNoise(x, y, seed + 7) * 3),
                { e: P.ember, f: P.fire, r: [158, 47, 22] },
              );
            }
          }
        }
      const light = fiery ? P.ember : P.cloud,
        dark = fiery ? P.fire : P.cloudDark;
      if (hurricane) {
        for (let arm = 0; arm < 3; arm++)
          for (let n = 0; n < 100; n++) {
            const r = 5 + (n / 100) * config.storm.hurricaneRadius,
              theta = t * 2 + (arm * Math.PI * 2) / 3 + n / 13;
            const x = x0 + Math.cos(theta) * r,
              y = y0 + Math.sin(theta) * r * 0.58;
            for (let d = -2; d <= 2; d++)
              for (let j = -1; j <= 1; j++)
                pixel(
                  over,
                  x + Math.cos(theta) * d,
                  y + Math.sin(theta) * d * 0.58 + j,
                  n % 7 ? light : dark,
                );
          }
        sprite(
          over,
          ["..ddd..", ".d...d.", "d.....d", ".d...d.", "..ddd.."],
          x0 - 3,
          y0 - 2,
          { d: dark },
        );
      } else {
        for (let y = 0; y < config.storm.tornadoHeight; y++) {
          const radius = 2 + (config.storm.tornadoHeight - y) * 0.34;
          const bend = Math.sin(y / 4 - t * 3) * 2;
          for (let x = -Math.ceil(radius); x <= radius; x++)
            if (Math.abs(x) <= radius)
              pixel(
                over,
                x0 + x + bend,
                y0 - config.storm.tornadoHeight + y,
                (x + y + Math.floor(frame / 3)) % 5 < 2 ? dark : light,
              );
        }
      }
      const carried = pickups
        .filter((p) => stormFrame - p.caught < config.storm.carryFrames)
        .slice(-config.storm.debrisCount);
      carried.forEach((p, n) => {
        const angle = t * 4 + (n * Math.PI * 2) / config.storm.debrisCount,
          radius = 14 + n * 2;
        const lift = Math.min(1, (stormFrame - p.caught) / 12);
        const x = p.x * (1 - lift) + (x0 + Math.cos(angle) * radius) * lift,
          y =
            p.y * (1 - lift) + (y0 + Math.sin(angle) * radius * 0.6 - 5) * lift;
        const rows =
          p.kind === "tree"
            ? [".gg.", "gggg", ".bb.", "..b."]
            : p.kind === "roof"
              ? ["..r..", ".rrr.", "wwwww", ".w.w."]
              : ["..s..", "..ss.", "bbbbb", ".bbb."];
        sprite(over, rows, x, y, {
          r: fiery ? P.fire : [164, 68, 37],
          w: [210, 174, 112],
          s: fiery ? P.ember : P.cloud,
          b: [111, 72, 38],
          g: fiery ? P.fire : [64, 109, 45],
        });
        if (fiery)
          sprite(over, [".y.", "yor", ".r."], x - 2, y - 3, {
            y: P.ember,
            o: P.fire,
            r: [170, 51, 22],
          });
      });
      // The visible damage follows collected objects, not a fixed row at the capital.
      for (const p of pickups) {
        sprite(
          over,
          p.kind === "boat"
            ? ["b...b", ".bb..", "...bb"]
            : ["bb.bb", ".bb..", "b...b"],
          p.x - 2,
          p.y,
          {
            b: fiery ? P.char : P.soil,
          },
        );
        sprite(over, ["r.r.r", ".ww..", "r..rr"], p.x, p.y + 2, {
          r: [133, 57, 34],
          w: P.soil,
        });
      }
    }
  });
  return { under, over };
}

/** Brief aftershock bursts displace only the affected region, not the ocean or neighbors. */
export function shakeHazardRegions(
  out: Uint8ClampedArray,
  L: WorldLayers,
  status: AreaStatus[],
  frame: number,
  clocks?: HazardFrames,
) {
  const affected = status.map((s) =>
    s.effects.has("earthquake")
      ? config.quake.majorAmplitude
      : s.effects.has("small_quake")
        ? config.quake.minorAmplitude
        : 0,
  );
  if (!affected.some(Boolean)) return;
  const copy = out.slice();
  for (let i = 0; i < W * H; i++) {
    const area = L.area[i],
      amount = affected[area];
    if (!amount) continue;
    const localFrame =
      clocks?.[area]?.earthquake ?? clocks?.[area]?.small_quake ?? frame;
    if (localFrame % config.quake.period >= config.quake.shakeFrames) continue;
    const dx = Math.round(Math.sin(localFrame * 2.3 + area) * amount),
      dy = Math.round(Math.cos(localFrame * 1.9) * amount);
    const x = (i % W) + dx,
      y = Math.floor(i / W) + dy,
      j = y * W + x;
    if (x >= 0 && y >= 0 && x < W && y < H && L.area[j] === area)
      out.set(copy.subarray(j * 4, j * 4 + 4), i * 4);
  }
}
