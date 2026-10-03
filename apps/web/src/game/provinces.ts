import areas from "../../../../src/data/provinces.json";
import type { CivId, GameState, Tile } from "./types";

export type Province = (typeof areas.provinces)[number];
export const PROVINCES: Province[] = areas.provinces;

// The original specification's simulation IDs map to the repository's visual regions.
export const OWNERS: Record<string, CivId> = {
  highland: "heartland",
  verdant: "enclave",
  forge: "petrostate",
  tidehaven: "archipelago",
};

/** Simulation districts grouped under one castle province (round-robin within its civ). */
export function districts(state: GameState, area: Province): Tile[] {
  const provinces = PROVINCES.filter((p) => p.civ === area.civ);
  const index = provinces.findIndex((p) => p.id === area.id);
  return state.tiles
    .filter((t) => t.owner === OWNERS[area.civ])
    .filter((_, i) => i % provinces.length === index);
}
