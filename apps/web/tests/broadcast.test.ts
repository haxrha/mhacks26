import test from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  answerQuiz,
  applyAction,
  createGame,
} from "../src/game/engine";
import { BROADCAST_MAX_CHARS, broadcastScript } from "../src/game/broadcast";

test("broadcast script reads the decade's dispatches and lesson within the length cap", () => {
  let s = advance(createGame("heartland", "solo"));
  s = answerQuiz(s, "heartland", 0, 1000);
  s = applyAction(s, { type: "choose", civ: "heartland", option: 1 }).state;
  assert.equal(s.phase, "build");
  const script = broadcastScript(s, "heartland");
  assert.match(script, /^This is the Earthshare World Service\. Decade 1\./);
  assert.match(script, /Top stories\./);
  assert.match(script, /Lesson of the decade\./);
  assert(script.length <= BROADCAST_MAX_CHARS);
  assert.match(script, /[.!?]$/);
});
test("a decade with no dispatches still broadcasts a lesson", () => {
  const script = broadcastScript(createGame("heartland", "solo"), "heartland");
  assert.doesNotMatch(script, /Top stories/);
  assert.match(script, /Lesson of the decade\. \S/);
});
