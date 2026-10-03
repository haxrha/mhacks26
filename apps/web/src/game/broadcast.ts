import { EVENTS } from "./content";
import type { CivId, GameState } from "./types";

export const BROADCAST_MAX_CHARS = 1000;

const sentence = (s: string) => {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/**
 * Radio-bulletin text for the end of a decade's events: the decade's dispatches plus
 * the lesson of the event that hit `civ`'s town. Use it once the choices have resolved
 * (the `build` phase), when this round's news exists.
 */
export function broadcastScript(state: GameState, civ: CivId): string {
  const lesson = `Lesson of the decade. ${sentence(EVENTS[state.events[civ].type].lesson)}`;
  const stories = state.news
    .filter((n) => n.round === state.round)
    .slice(0, 5)
    .map((n) => sentence(n.text));
  const head = `This is the Earthshare World Service. Decade ${state.round}.`;
  const build = () =>
    [
      head,
      ...(stories.length ? ["Top stories.", ...stories] : []),
      lesson,
    ].join(" ");
  while (stories.length > 1 && build().length > BROADCAST_MAX_CHARS)
    stories.pop();
  return build().slice(0, BROADCAST_MAX_CHARS);
}
