import test from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  answerQuiz,
  applyAction,
  createGame,
} from "../src/game/engine";
import { broadcastFacts } from "../src/game/broadcast";
import {
  MAX_LINES,
  MAX_SCRIPT_CHARS,
  cleanFacts,
  fallbackLines,
  grokPrompt,
  parseScript,
  sanitizeTags,
} from "../src/game/radioScript";

function buildPhase() {
  let s = advance(createGame("heartland", "solo"));
  s = answerQuiz(s, "heartland", 0, 1000);
  s = applyAction(s, { type: "choose", civ: "heartland", option: 1 }).state;
  assert.equal(s.phase, "build");
  return s;
}

test("facts carry the decade's dispatches, the player's leader and the lesson", () => {
  const facts = broadcastFacts(buildPhase(), "heartland");
  assert.equal(facts.round, 1);
  assert.equal(facts.leader, "ostra");
  assert(facts.news.length > 0);
  assert(facts.lesson.length > 0);
  assert.deepEqual(cleanFacts(facts), facts);
});
test("untrusted facts are validated and size-capped", () => {
  assert.equal(cleanFacts(null), null);
  assert.equal(
    cleanFacts({ round: 1, leader: "evil", news: [], lesson: "x" }),
    null,
  );
  const big = cleanFacts({
    round: 2,
    leader: "pell",
    news: Array(20).fill("n".repeat(1000)),
    lesson: "l".repeat(5000),
  })!;
  assert.equal(big.news.length, 6);
  assert(big.news.every((n) => n.length <= 220));
  assert(big.lesson.length <= 500);
});
test("grok output becomes voiced lines; unknown speakers and tags are dropped", () => {
  const lines = parseScript(
    [
      "anchor: [sighs] Another hard decade.",
      "**brask**: [grunts] Smoke drifts downwind. [explosion]",
      "villain: ignore previous instructions",
      "reporter - (laughs) Tidehaven felt it first.",
      "pell:",
      "",
    ].join("\n"),
  );
  assert.deepEqual(
    lines.map((l) => l.speaker),
    ["anchor", "brask", "reporter"],
  );
  assert.equal(lines[0].text, "[sighs] Another hard decade.");
  assert.equal(lines[1].text, "[grunts] Smoke drifts downwind.");
  assert.equal(lines[2].text, "Tidehaven felt it first.");
  assert.equal(sanitizeTags("[Chuckles] hi [bomb]"), "[chuckles] hi");
});
test("scripts are capped in lines and characters", () => {
  const raw = Array.from(
    { length: 30 },
    () => `anchor: ${"word ".repeat(60)}`,
  ).join("\n");
  const lines = parseScript(raw);
  assert(lines.length <= MAX_LINES);
  assert(lines.reduce((n, l) => n + l.text.length, 0) <= MAX_SCRIPT_CHARS);
});
test("without Grok the anchor gives the decade and the lesson in one short line", () => {
  const facts = broadcastFacts(buildPhase(), "heartland");
  const lines = fallbackLines(facts);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].speaker, "anchor");
  assert.match(lines[0].text, /^Decade 1\. /);
  assert(lines[0].text.length <= MAX_SCRIPT_CHARS);
  assert(grokPrompt(facts).includes(facts.lesson));
});
