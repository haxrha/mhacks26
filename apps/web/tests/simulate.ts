/** Balance check: AI plays every seat across many seeds. Run: npm run simulate [games] */
import { autoplay, createGame, score } from "../src/game/engine";
import { CIV_IDS } from "../src/game/types";

const N = Number(process.argv[2] ?? 300);
const wins: Record<string, number> = Object.fromEntries(
  CIV_IDS.map((c) => [c, 0]),
);
let collapse = 0,
  climate = 0,
  rounds = 0;
for (let i = 0; i < N; i++) {
  const s = autoplay(createGame("heartland", "solo", 1000 + i));
  climate += s.climate;
  rounds += s.round;
  if (s.outcome === "collapse") collapse++;
  else {
    const best = [...CIV_IDS].sort((a, b) => score(s, b) - score(s, a))[0];
    wins[best]++;
  }
}
console.log({
  games: N,
  collapseRate: collapse / N,
  avgFinalClimate: +(climate / N).toFixed(2),
  avgRounds: +(rounds / N).toFixed(1),
  wins,
});
