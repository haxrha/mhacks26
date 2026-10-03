import {
  advanceFlows,
  answerQuiz,
  createGame,
  nextRound,
  resolveRound,
  runBots,
  score,
} from "../src/game/engine";
import { QUESTIONS } from "../src/game/questions";
import { CIV_IDS } from "../src/game/types";
// All-bot policy stress test. Rotate the excluded seat so every civilization
// gets one set of actions. This is a balance signal, not a balance proof.
const result = {
  games: 400,
  collapse: 0,
  concordat: 0,
  prosperity: 0,
  meanClimate: 0,
  wins: Object.fromEntries(CIV_IDS.map((id) => [id, 0])),
};
for (let seed = 1; seed <= 100; seed++)
  for (const player of CIV_IDS) {
    let s = createGame(player, "solo", seed);
    while (s.phase !== "ended") {
      // Act each civilization once by temporarily excluding a different already-spent seat.
      s = runBots(s);
      const savedPlayer = s.player;
      s.player = CIV_IDS.find((id) => id !== savedPlayer)!;
      s = runBots(s);
      s.player = savedPlayer;
      s.mode = "hotseat";
      s = advanceFlows(resolveRound(s));
      while (s.phase === "quiz") {
        const q = s.quizzes.find((q) => !q.tier)!;
        const item = QUESTIONS.find(
          (item) => item.id === q.questions[q.answers.length],
        )!;
        s = answerQuiz(s, q.civ, item.correct, 5000);
      }
      s = nextRound(s);
      s.mode = "solo";
    }
    result[s.outcome!]++;
    result.meanClimate += s.climate;
    const winner = [...CIV_IDS].sort((a, b) => score(s, b) - score(s, a))[0];
    if (s.outcome !== "collapse") result.wins[winner]++;
  }
result.meanClimate = Number((result.meanClimate / result.games).toFixed(3));
console.log(JSON.stringify(result, null, 2));
