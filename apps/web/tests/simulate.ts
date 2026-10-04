/** Balance check: AI plays every seat across many seeds. Run: npm run simulate [games] */
import { autoplay, createGame, score } from "../src/game/engine";
import { CIV_IDS, RESOURCES } from "../src/game/types";

const N = Number(process.argv[2] ?? 300);
const wins: Record<string, number> = Object.fromEntries(
  CIV_IDS.map((c) => [c, 0]),
);
let collapse = 0,
  climate = 0,
  rounds = 0;
let prosperity = 0,
  shortages = 0,
  resources = 0,
  research = 0;
for (let i = 0; i < N; i++) {
  const s = autoplay(createGame("heartland", "solo", 1000 + i));
  climate += s.climate;
  rounds += s.round;
  for (const c of CIV_IDS) {
    prosperity += score(s, c);
    shortages += s.civs[c].hardship ?? 0;
    research += s.civs[c].technologies?.length ?? 0;
    for (const r of RESOURCES) resources += s.civs[c].stock[r];
  }
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
  avgTownProsperity: +(prosperity / N / CIV_IDS.length).toFixed(2),
  avgTownShortages: +(shortages / N / CIV_IDS.length).toFixed(2),
  avgTownStockTotal: +(resources / N / CIV_IDS.length).toFixed(2),
  avgCompletedResearch: +(research / N / CIV_IDS.length).toFixed(2),
});
