# Agenda

A game of social manipulation and strategy, loosely inspired by No Mans Land (NML).

Current state: the world only. No gameplay yet.

- **Board**: 20 x 8 tiles of 6 m (120 x 48 m), NML's painted meadow with its grid, no player zones or no man's land.
- **Scenery**: none yet. The land round the board is flat.
- **Camera**: NML's controls. Wheel or pinch steps between Strategic, Tilted, Angled and Ground; right/middle drag, two-finger twist or Q/E rotates from Tilted in. Tilted (camera 2) is the standard view: the camera starts there, and Esc or a tap in a closer view returns to it.
- **Characters**: 22 figures, NML's Flame Wizard body without hat, beard and staff: 20 static NPCs and 2 player figures that look exactly like them. Tiles, facings, robe and skin colours and which figures are the players are random per match (a new seed each page load) and fixed for the match.
- **You**: a gold circle under your own figure, visible only to you. Tap a tile to walk there at 2 m/s (NML's move speed 2); a gold arrow on the ground shows your path to the destination, only to you. The "switch" button views the match as the other player, for testing.
- **Furniture**: a dining table with 8 seats, 2 standing tables with 3 places each, a bar with 2 stools, 4 chairs against the walls. Tap one to highlight it (a warm glow and a gold outline on the floor) and get a popup with Sit down (Join table at a standing table), or Get up where you sit; the nearest free seat is taken. NPCs take seats, get up and wander on their own.
- **Mingling**: 20 NPCs dealt 4 types (5 each; social 0 to 3). Type 1 never seeks talk and turns down the first ask of the match, then won't talk for 15 s, and never adds to a conversation; type 2 never seeks talk, always accepts; type 3 sometimes seeks; type 4 constantly seeks, invites others to its group or table, and sometimes interrupts a group it only listens to (never pulls anyone away). Conversations: 1v1s and groups of 3 standing on neighbouring tiles, more joiners only listen; everyone at the same table or bar talks together. Tap a person: Talk, Join conversation, Listen in, Join them (at a table), Speak to them and Pull aside (while only listening: each may make the group peeved or irritated for 10 s; peeved means reluctant, sharing at half speed; irritated can't be pulled away), Leave conversation. NPCs ask you to talk or invite you; you accept from the popup over them. Each talker fills their own pie, one piece every 5 s. "Show types" labels everyone with type, activity and mood, for testing.
- **Camera taps**: a tap in the angled or ground view goes to the game (people, tiles) instead of zooming back out; Esc still goes back to the tilted view.
- **Pies**: tap a person to show their pie (a grey plate with 3 to 8 outlined slots, above their head, facing the camera); tap again to drop the next wooden piece in, Space for another. A full pie empties on the next tap. Events for sound: `window` event `agenda:pie` with `{ type, character, slot, n }`, type `show`, `hide`, `drop`, `snap`, `full` or `clear`.

## Files

- `src/camera3d.js`: NML's camera, plus `home` and `farTop` options
- `src/floor.js`: the painted meadow floor and grid
- `src/match.js`: the match seed: everything random is drawn from it once per match
- `src/characters.js`: the 20 NPCs and the 2 players' figures, all alike
- `src/movement.js`: walking (paths over the tiles, 2 m/s), sitting and getting up, your circle, path arrow and destination
- `src/furniture.js`: the dining table, standing tables, bar and wall chairs, with their seats
- `src/social.js`: NPC types, conversations, moods, sharing, and every NPC's own choices (seeking talk, inviting, sitting, wandering)
- `src/room.js`: the walls
- `src/pies.js`: the pies and the wooden pieces, with the snap animation
- `src/world.js`: scene, lights, board, render loop (`BOARD` sets the size)
- `src/template.html`, `src/build.js`: build the pages

## Build

    node src/build.js

Writes `index.html` (three.js from `vendor/`) and `agenda-artifact.html` (three.js from jsDelivr) for claude.ai.
