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
export const townOf = (civ: CivId) => TOWNS.find((t) => OWNERS[t.civ] === civ)!;
/** Index of a civilization's town (also its area index in the map layers). */
export const townIndex = (civ: CivId) =>
  TOWNS.findIndex((t) => OWNERS[t.civ] === civ);
