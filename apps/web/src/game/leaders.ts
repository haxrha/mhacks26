import { CIVS, EVENTS } from "./content";
import { describe } from "./engine";
import type { CivId, GameState } from "./types";

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
    name: "The Lorax",
    role: "Dam keeper",
    greeting:
      "I speak for the trees, and I keep the Highland Dam. Every drop that reaches the valley passes my gate first.",
    color: "#a07ad6",
  },
  enclave: {
    id: "moss",
    name: "Shrek",
    role: "Grove elder",
    greeting:
      "This is my swamp, and these are my groves. Our forests drink the rain and breathe out the air everyone shares.",
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
    name: "Tung Tung Tung Sahur",
    role: "Harbormaster",
    greeting:
      "Tung tung tung! I drum the harbor awake. Every river ends at our shore, along with whatever it carries.",
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
    "Every decade something hits our town. I'll tell you what's coming, then test what you know: a quick answer softens the blow.",
    "Then you choose: the cheap fix, which often dumps the problem on a neighbor or heats the planet, or the sustainable one, which costs more now and protects us after.",
    "Last, we build with sheep, wheat, wood, brick and ore. Grow the town, but watch the warming. At +3°C every town loses, us included.",
  ];
}

/** The advisor tells this cycle's event. */
export function eventLines(state: GameState, civ: CivId): string[] {
  const ev = state.events[civ];
  const e = EVENTS[ev.type];
  const lines = [`${e.name}! ${e.tell}`];
  if (ev.cause && e.caused)
    lines.push(e.caused.replace("{cause}", CIVS[ev.cause].name));
  lines.push(
    `If we do nothing we lose ${describe(ev.loss)}. First, a question. Answer quickly and well, and we lose less.`,
  );
  return lines;
}

/** A briefing line at the start of each later decade. */
export function decadeLine(round: number, climate: number) {
  const mood =
    climate >= 2.2
      ? "We are close to the edge. One more cheap fix could tip the whole valley over."
      : climate >= 1.4
        ? "The heat is building, and every event hits harder now."
        : "We still have room to choose well.";
  return `Decade ${round}. Warming is +${climate.toFixed(1)}°C. ${mood}`;
}
