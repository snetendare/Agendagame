# Agenda

A game of social manipulation and strategy, loosely inspired by No Mans Land (NML).

Current state: the world only. No gameplay yet.

- **Board**: 20 x 8 tiles of 6 m (120 x 48 m), NML's painted meadow with its grid, no player zones or no man's land.
- **Scenery**: none yet. The land round the board is flat.
- **Camera**: NML's controls. Wheel or pinch steps between Strategic, Tilted, Angled and Ground; right/middle drag, two-finger twist or Q/E rotates from Tilted in. Tilted (camera 2) is the standard view: the camera starts there, and Esc or a tap in a closer view returns to it.
- **NPCs**: 20 static people on random tiles (seeded), each NML's Flame Wizard body without hat, beard and staff, in its own robe colour.
- **Pies**: tap a person to show their pie (a grey plate with 3 to 8 outlined slots, above their head, facing the camera); tap again to drop the next wooden piece in, Space for another. A full pie empties on the next tap. Events for sound: `window` event `agenda:pie` with `{ type, npc, slot, n }`, type `show`, `hide`, `drop`, `snap`, `full` or `clear`.

## Files

- `src/camera3d.js`: NML's camera, plus `home` and `farTop` options
- `src/floor.js`: the painted meadow floor and grid
- `src/npcs.js`: the NPCs
- `src/pies.js`: the pies and the wooden pieces, with the snap animation
- `src/world.js`: scene, lights, board, render loop (`BOARD` sets the size)
- `src/template.html`, `src/build.js`: build the pages

## Build

    node src/build.js

Writes `index.html` (three.js from `vendor/`) and `agenda-artifact.html` (three.js from jsDelivr) for claude.ai.
