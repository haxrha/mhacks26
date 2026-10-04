"use client";
import { useState } from "react";
import { ArrowRight, Check, Copy, Users } from "lucide-react";
import { CIVS } from "@/game/content";
import { LEADERS } from "@/game/leaders";
import { CIV_IDS, type CivId } from "@/game/types";

/**
 * Waiting room for a shared world. The host creates the room, shares the code, and starts
 * when enough players have joined; unclaimed towns are played by AI. Shown during round 1's
 * event phase (the only window the server accepts joins), so nobody is dropped straight into play.
 */
export default function RoomLobby({
  roomId,
  seats,
  isHost,
  me,
  onStart,
  onLeave,
}: {
  roomId: string;
  seats: { civ: string; ready: boolean }[];
  isHost: boolean;
  me: CivId | undefined;
  onStart: () => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const claimed = new Set(seats.map((s) => s.civ));
  const humans = seats.length;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; the code is on screen regardless */
    }
  };
  return (
    <main className="lobby">
      <section className="lobby-card">
        <span className="eyebrow">
          <Users size={14} /> SHARED WORLD · WAITING ROOM
        </span>
        <h1>Gather your neighbors</h1>
        <p>
          Share this code. Each player joins and claims a leader before the host
          begins. Any town left open is run by an AI neighbor.
        </p>

        <div className="lobby-code">
          <span className="lobby-code-label">ROOM CODE</span>
          <b aria-label={`Room code ${roomId.split("").join(" ")}`}>{roomId}</b>
          <button
            className="secondary"
            onClick={copy}
            aria-label="Copy room code"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <ul className="lobby-seats">
          {CIV_IDS.map((id) => {
            const taken = claimed.has(id);
            const mine = id === me;
            return (
              <li key={id} data-taken={taken} data-mine={mine}>
                <i
                  className="lobby-chip"
                  style={{ background: CIVS[id].color }}
                  aria-hidden="true"
                />
                <div>
                  <b>{CIVS[id].name}</b>
                  <small>{LEADERS[id].name}</small>
                </div>
                <span className="lobby-tag">
                  {mine ? "You" : taken ? "Joined" : "AI neighbor"}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="lobby-footer">
          <button className="ghost" onClick={onLeave}>
            Leave
          </button>
          <span className="lobby-count" role="status">
            {humans} of 4 seats claimed
            {humans < 2 ? " · AI fills the rest" : ""}
          </span>
          {isHost ? (
            <button className="primary" onClick={onStart}>
              Start game <ArrowRight size={16} />
            </button>
          ) : (
            <span className="lobby-waiting" role="status">
              Waiting for the host to start…
            </span>
          )}
        </div>
      </section>
    </main>
  );
}
