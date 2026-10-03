import { CIVS } from "./content";
import type { CivId } from "./types";

/** Each civilization's advisor, who narrates the game to that player (AGENTS.md §8 cast). */
export interface Leader {
  id: "ostra" | "moss" | "brask" | "pell";
  name: string;
  role: string;
  greeting: string;
  color: string;
}

export const LEADERS: Record<CivId, Leader> = {
  heartland: {
    id: "ostra",
    name: "Warden Ostra",
    role: "Dam keeper",
    greeting:
      "I keep the Highland Dam. Every drop that reaches the valley passes our gate first.",
    color: "#a07ad6",
  },
  enclave: {
    id: "moss",
    name: "Elder Moss",
    role: "Grove elder",
    greeting:
      "I tend the old groves. Our forests drink the rain and breathe out the air everyone shares.",
    color: "#7fd65a",
  },
  petrostate: {
    id: "brask",
    name: "Foreman Brask",
    role: "Foreman",
    greeting:
      "I run the works. Our factories power the valley, and their smoke drifts wherever the wind goes.",
    color: "#f08a3c",
  },
  archipelago: {
    id: "pell",
    name: "Harbormaster Pell",
    role: "Harbormaster",
    greeting:
      "I watch the harbor. Every river ends at our shore, along with whatever it carries.",
    color: "#46d6d0",
  },
};

export const leaderArt = (civ: CivId, talking = false, portrait = true) =>
  `/assets/leaders/${LEADERS[civ].id}${portrait ? "-portrait" : ""}${talking ? "-talk" : ""}.png`;

/** What the advisor says when a game begins. */
export function introLines(civ: CivId): string[] {
  const l = LEADERS[civ];
  return [
    `Chief! ${l.name} of ${CIVS[civ].name} here. ${l.greeting}`,
    "Each decade you get a few actions: build, research, trade, or send aid. Pick them, then lock your plan.",
    "Remember: nothing stays on our side of the border. Floods, smoke and spills flow downstream to our neighbors, and theirs flow to us.",
    "Keep an eye on warming. If the planet reaches +3°C, every civilization loses, us included.",
  ];
}

/** A one-line briefing at the start of each new decade. */
export function decadeLine(round: number, climate: number, ocean: number) {
  const mood =
    climate >= 2.2
      ? "We are close to the edge. Cut emissions now, or there won't be a next decade."
      : climate >= 1.4
        ? "The heat is building. Clean power and shared projects will matter more than ever."
        : "We still have room to choose. Invest before the next disaster forces our hand.";
  return `Decade ${round} begins. Warming is +${climate.toFixed(1)}°C and the ocean is at ${Math.round(ocean)}%. ${mood}`;
}
