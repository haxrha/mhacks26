/**
 * Where a town's hazard may be drawn. Effects are visual, so they don't stop dead at the region
 * line: they reach the struck region plus a feathered band (up to BLEED px) into its neighbours,
 * with a noisy edge so the spill looks natural rather than a second hard border.
 */
import world from "../../../../src/data/worldmap.json";

const W = world.w,
  H = world.h;
/** Furthest an effect spills past its region's border, in map pixels. */
export const BLEED = 14;
const NONE = 255;
const SEA_MAX = 2; // kinds 0-2 are sea; rivers and land carry an effect, open sea does not

interface ReachLayers {
  kind: Uint8Array;
  area: Uint8Array;
}

const cache = new Map<number, Uint8Array>();
/** Distance (in px, capped at 255) from each tile to the land of `area`; 0 inside it. */
export function areaDistance(L: ReachLayers, area: number): Uint8Array {
  const hit = cache.get(area);
  if (hit && hit.length === L.area.length) return hit;
  const dist = new Uint8Array(L.area.length).fill(255);
  let frontier: number[] = [];
  for (let i = 0; i < L.area.length; i++)
    if (L.area[i] === area) {
      dist[i] = 0;
      frontier.push(i);
    }
  for (let d = 1; d <= BLEED + 1 && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % W;
      for (const j of [
        i - W,
        i + W,
        x > 0 ? i - 1 : -1,
        x < W - 1 ? i + 1 : -1,
      ])
        if (j >= 0 && j < W * H && dist[j] === 255 && L.kind[j] > SEA_MAX) {
          dist[j] = d;
          next.push(j);
        }
    }
    frontier = next;
  }
  cache.set(area, dist);
  return dist;
}

/** Smooth-ish 0..1 noise on a 4px grid, so the spill edge wanders instead of following a line. */
function edgeNoise(x: number, y: number, seed: number) {
  let h = Math.imul(
    Math.floor(x / 4) * 374761393 + Math.floor(y / 4) * 668265263 + seed,
    1274126177,
  );
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** True if `area`'s effects may paint tile `i`: inside the region, or in its feathered spill band. */
export function reaches(
  L: ReachLayers,
  area: number,
  i: number,
  seed = 0,
): boolean {
  if (area === NONE || area < 0) return false;
  const d = areaDistance(L, area)[i];
  if (d === 0) return true;
  if (d > BLEED) return false;
  const x = i % W,
    y = Math.floor(i / W);
  return d <= BLEED * (0.35 + 0.65 * edgeNoise(x, y, seed + area * 7919));
}

/** Every area whose effects reach tile `i` (its own area first). */
export function areasReaching(
  L: ReachLayers,
  i: number,
  areas: number,
  seed = 0,
): number[] {
  const own = L.area[i];
  const out = own !== NONE && own < areas ? [own] : [];
  for (let a = 0; a < areas; a++)
    if (a !== own && reaches(L, a, i, seed)) out.push(a);
  return out;
}
