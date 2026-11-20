# Contributing levels

Anyone can build a level and add it to the game. Levels are plain JSON files in [`levels/`](levels/).
Every file there shows up in the game under **Community levels**.

## 1. Build it in the editor
1. `npm install` and `npm run dev`, open http://localhost:5173
2. Main menu, **Level editor**
3. Pick a category with `Q`/`E` (or click the palette at the bottom), then:
   - left mouse: place / paint, right mouse: erase
   - `WASD` / arrows / mouse wheel: scroll
   - top bar: name, author, biome, time of day, width, **Playtest**, **Save**, **Export**, **Import**
   - **From seed** starts from a procedurally generated level you can then edit
4. Set a **spawn** and an **exit vehicle** (helicopter, truck or plane) under *Start / End*,
   or pick a **boss** (the last 30 columns become the boss arena).
5. **Playtest** (`P`) until it is fun and beatable. **Save** keeps it in your browser (*Community levels > Mine*).

## 2. Add it to the repo
1. Click **Export**, you get `your-level-name.json`
2. Put the file into `levels/` (lowercase, dashes, e.g. `levels/burning-bridge.json`)
3. Run the checks:
   ```bash
   npm test
   ```
   The test suite validates every level (format, size, spawn on solid ground, exit present, known
   enemy/prop/item types) and lets the helicopter drop a player into it.
4. Open a pull request. CI runs the same checks.

## Level rules
- Height 20 to 48 tiles (taller levels allow sky finales: high-rises, floating islands), width 40 to 1000.
- Floating terrain collapses when hit by explosions unless it has an anchor: list cells in `"anchors": [[x, y], ...]`. If the anchor tile is destroyed, the island falls.
- A chopper exit must sit at row 6 or lower (it hovers above its spot).
- The player spawns on a solid tile with two free tiles above it.
- Normal levels need exactly one exit vehicle. Boss levels need width >= 60 and get their extraction automatically.
- Keep at least the bottom row as bedrock (`x`) where there is ground, otherwise players can dig out of the map.
- Make sure every player can reach the exit, since all of them have to board it.

## File format (short)
```jsonc
{
  "format": "ballistocracy-level", "version": 1,
  "name": "BURNING BRIDGE", "author": "you", "description": "optional",
  "biome": "jungle",            // jungle | desert | snow | city | industrial | volcano
  "tod": "dusk",                // day | dusk | night
  "width": 120, "height": 20,   // height 20..48
  "tiles": ["....", "..."],     // 20 rows; . empty d dirt s rock b block w wood m metal x bedrock l ladder g sandbag p platform c crumbling
  "back":  ["....", "..."],     // optional: . sky d earth wall s stone wall W window w wood wall
  "spawn": { "x": 3, "y": 14 }, // tile column, ground row under the player
  "exit":  { "x": 110, "y": 14, "vehicle": "chopper" },
  "boss": null,                 // or { "type": "tank" | "gunship" | "drill" }
  "entities": [
    { "kind": "enemy", "type": "grunt", "x": 20, "y": 14 },
    { "kind": "prop", "type": "crate", "x": 8, "y": 14, "item": "rocket" },
    { "kind": "pickup", "item": "grenade", "x": 30, "y": 14 },
    { "kind": "scenery", "type": "palm", "x": 12, "y": 14 }
  ]
}
```
Entities stand on the tile row `y` (drones hover in row `y`). The full list of types is in
[`src/world/levelFormat.ts`](src/world/levelFormat.ts).

## License of contributions

By opening a pull request (code or levels) you agree that your contribution is licensed under the GNU AGPL v3 or later, the same license as the project (see [LICENSE](LICENSE)).
