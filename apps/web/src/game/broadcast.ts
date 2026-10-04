import { EVENTS } from "./content";
import type { BroadcastFacts, Speaker } from "./radioScript";
import type { CivId, GameState } from "./types";

export const LEADER: Record<CivId, Speaker> = {
  heartland: "ostra",
  enclave: "moss",
  petrostate: "brask",
  archipelago: "pell",
};

/**
 * The decade debrief as plain facts for the radio writer: this decade's dispatches plus the
 * lesson of the event that hit `civ`'s town. Use once choices have resolved (the `build` phase).
 */
export function broadcastFacts(state: GameState, civ: CivId): BroadcastFacts {
  return {
    round: state.round,
    leader: LEADER[civ],
    // The player's own town first, so the writer's size cap drops the least relevant lines.
    news: state.news
      .filter((n) => n.round === state.round)
      .sort((a, b) => Number(b.civ === civ) - Number(a.civ === civ))
      .map((n) => n.text),
    lesson: EVENTS[state.events[civ].type].lesson,
  };
}
