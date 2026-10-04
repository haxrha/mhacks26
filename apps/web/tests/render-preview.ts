// Dev helper: render the live world map (exactly what the game draws) to a raw RGBA file.
// Usage: npx tsx tests/render-preview.ts <out.rgba> [frame]
// Convert with Python/Pillow: Image.frombytes("RGBA", (320, 200), data).
import { writeFileSync } from "node:fs";
import { createGame } from "../src/game/engine";
// Pass "game" as the 3rd argument to include a fresh game's events; default is the calm map.
import { MAP_H, MAP_W, renderWorld } from "../src/game/worldRender";

const out = process.argv[2] ?? "map.rgba";
const frame = Number(process.argv[3] ?? 0);
const buf = new Uint8ClampedArray(MAP_W * MAP_H * 4);
renderWorld(process.argv[4] === "game" ? createGame() : undefined, frame, buf);
writeFileSync(out, Buffer.from(buf.buffer));
console.log(`wrote ${out} (${MAP_W}x${MAP_H}, frame ${frame})`);
