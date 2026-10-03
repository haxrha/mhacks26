import assert from "node:assert/strict";
import { DbConnection } from "../src/module_bindings";
import { QUESTIONS } from "../src/game/questions";
import type { GameState } from "../src/game/types";

const id = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");
async function client() {
  return new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder()
      .withUri("ws://127.0.0.1:3001")
      .withDatabaseName("earthshare-game")
      .onConnect((conn) =>
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve(conn))
          .onError((ctx) => reject(ctx.event))
          .subscribe([
            `SELECT * FROM room WHERE id = '${id}'`,
            `SELECT * FROM seat WHERE room_id = '${id}'`,
          ]),
      )
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
}
async function until(check: () => boolean) {
  const end = Date.now() + 10000;
  while (!check()) {
    if (Date.now() > end) throw Error("Subscription timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
async function main() {
  const host = await client(),
    guest = await client();
  try {
    await host.reducers.createWorld({
      roomId: id,
      civ: "heartland",
      seed: 42,
      solo: false,
    });
    await guest.reducers.joinWorld({ roomId: id, civ: "archipelago" });
    await until(
      () =>
        [...host.db.seat.iter()].length === 2 && !!guest.db.room.id.find(id),
    );
    const row = () => host.db.room.id.find(id)!;
    const state = () => JSON.parse(row().stateJson) as GameState;
    assert.equal(state().round, 1);
    await assert.rejects(
      guest.reducers.act({
        roomId: id,
        revision: row().revision,
        actionJson: JSON.stringify({
          type: "market",
          civ: "heartland",
          resource: "food",
          amount: 1,
          buy: true,
        }),
      }),
    );
    await host.reducers.act({
      roomId: id,
      revision: row().revision,
      actionJson: JSON.stringify({
        type: "market",
        civ: "heartland",
        resource: "food",
        amount: 1,
        buy: true,
      }),
    });
    await until(
      () => row().revision === 2 && guest.db.room.id.find(id)?.revision === 2,
    );
    assert.equal(state().civs.heartland.ap, 2);
    await assert.rejects(
      host.reducers.act({
        roomId: id,
        revision: 1,
        actionJson: JSON.stringify({
          type: "market",
          civ: "heartland",
          resource: "food",
          amount: 1,
          buy: true,
        }),
      }),
    );
    await assert.rejects(
      host.reducers.act({
        roomId: id,
        revision: row().revision,
        actionJson: JSON.stringify({
          type: "market",
          civ: "heartland",
          amount: 1,
          buy: true,
        }),
      }),
    );
    await host.reducers.ready({ roomId: id });
    assert.equal(state().phase, "planning");
    await guest.reducers.ready({ roomId: id });
    await until(() => state().phase === "flows");
    await assert.rejects(guest.reducers.advance({ roomId: id }));
    await host.reducers.advance({ roomId: id });
    await until(() => state().phase !== "flows");
    await until(() => guest.db.room.id.find(id)?.revision === row().revision);
    assert.equal(guest.db.room.id.find(id)?.stateJson, row().stateJson);
    for (const [conn, civ] of [
      [host, "heartland"],
      [guest, "archipelago"],
    ] as const) {
      let session = state().quizzes.find((q) => q.civ === civ && !q.tier);
      while (session && state().phase === "quiz") {
        const questionId = session.questions[session.answers.length];
        const question = QUESTIONS.find((q) => q.id === questionId)!;
        await assert.rejects(
          conn.reducers.answer({
            roomId: id,
            questionId,
            option: question.correct,
            lifeline: false,
          }),
        );
        await conn.reducers.beginQuestion({ roomId: id, questionId });
        const previous = row().revision;
        await conn.reducers.answer({
          roomId: id,
          questionId,
          option: question.correct,
          lifeline: false,
        });
        await until(() => row().revision > previous);
        await assert.rejects(
          conn.reducers.answer({
            roomId: id,
            questionId,
            option: question.correct,
            lifeline: false,
          }),
        );
        session = state().quizzes.find((q) => q.civ === civ && !q.tier);
      }
    }
    assert.equal(state().phase, "debrief");
    await host.reducers.advance({ roomId: id });
    await until(() => state().round === 2);
    assert.equal(state().phase, "planning");
    assert.equal(state().civs.heartland.ap, 3);
    await until(() => [...host.db.seat.iter()].every((seat) => !seat.ready));
    console.log(
      "PASS: native module creates rooms, syncs two identities, rejects impersonation/stale revisions, waits for readiness, restricts advancement to host, validates quiz clocks/replays, and completes a turn.",
    );
  } finally {
    host.disconnect();
    guest.disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
