import data from "../../../../src/data/towns.json";
import type { CivId } from "./types";

/** One town per civilization. `civ` here is the map's visual region name. */
export type Town = (typeof data.towns)[number];
export const TOWNS: Town[] = data.towns;

// The simulation IDs map to the map's visual regions.
export const OWNERS: Record<string, CivId> = {
  highland: "heartland",
  verdant: "enclave",
  forge: "petrostate",
  tidehaven: "archipelago",
};
/** Kingdom name for each civilization (the reverse of OWNERS); used for arrow sprites. */
export const KINGDOM: Record<CivId, string> = Object.fromEntries(
  Object.entries(OWNERS).map(([kingdom, civ]) => [civ, kingdom]),
) as Record<CivId, string>;
/** Arrow fill per kingdom: [light top half, dark bottom half]. */
export const ARROW_COLORS: Record<CivId, [string, string]> = {
  heartland: ["#a07ad6", "#6e4fa0"],
  enclave: ["#7fd65a", "#4f9a34"],
  petrostate: ["#f08a3c", "#b85a1e"],
  archipelago: ["#46d6d0", "#1e8a86"],
};
export const townOf = (civ: CivId) => TOWNS.find((t) => OWNERS[t.civ] === civ)!;
/** Index of a civilization's town (also its area index in the map layers). */
export const townIndex = (civ: CivId) =>
  TOWNS.findIndex((t) => OWNERS[t.civ] === civ);
