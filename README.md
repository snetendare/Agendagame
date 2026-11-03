# Agenda

A game of social manipulation and strategy at a high-society dinner party, loosely inspired by
[No Mans Land](https://github.com/playnomansland/playnomansland.github.io) (NML).

Two players each control one guest among 20 NPCs. Every guest looks alike, so the players have to work out which
figure is the other player. The aim is that you can't tell from how someone walks. You tell from patterns over time,
suspicious behaviour when things get urgent, and people acting out of role.

## Current state

A playable sandbox: the room, the guests, walking, sitting, and mingling. There is no win condition, networking or
sound yet. Open `index.html` in a browser (serve the folder, e.g. `python3 -m http.server`).

### The room
- 20 x 8 tiles of 6 m (120 x 48 m), indoors: a polished parquet floor with the tile grid in its joints, panelled
  walls, warm light from above.
- Doll's-house walls: the wall the camera looks in over drops to a low panel. Rotate the view and the cut-away wall changes.
- Furniture (no other dressing yet):
  - a dining table with 8 seats
  - 2 standing tables with 3 places each
  - a bar with 2 stools
  - 4 single chairs against the walls

### Camera
NML's controls. The wheel (or a pinch) steps between Strategic, Tilted, Angled and Ground. Right or middle drag,
a two-finger twist, or Q / E rotates the view from Tilted in. Tilted ("camera 2") is the standard view: the camera
starts there, and Esc goes back to it. Taps in every view go to the game, so you can play zoomed in.

### Guests
- 22 figures: 20 NPCs and the 2 players' figures. All use NML's Flame Wizard body (robe and head) without the hat,
  beard and staff.
- Per match (a new seed on every page load), these are random and then fixed: who stands where, which way they face,
  robe and skin colour, which two figures are the players, and the NPCs' types. Everything random comes from the seed,
  so a networked match only has to share it.
- Everyone walks at 2 m/s (NML's move speed 2), about 3 s a tile.

### You
- A gold circle under your own figure, visible only to you.
- Tap a tile to walk there. A gold arrow on the ground shows your path, and only you see it.
- Tap a table, the bar or a chair: it lights up (a warm glow and a gold outline on the floor) and a popup offers
  Sit down (Join table at a standing table), or Get up where you sit.
- Tap a person for a popup about them: Talk, Join conversation, Listen in, Join them (at a table), Speak to them,
  Pull aside or Leave conversation, depending on the situation. A white ring marks who it's about.
- When an NPC wants to talk to you or invites you, a popup with Accept appears over them. No answer within 8 s is a no.

### NPC types
The 20 NPCs are dealt four types, five of each. Players have no type and act as they choose.

| Type | Social | Seeks conversation | When asked |
|---|---|---|---|
| 1 | 0 | never | declines the first ask of the match, then won't talk for 15 s, then accepts. Never adds to a conversation. |
| 2 | 1 | never | always accepts |
| 3 | 2 | sometimes | always accepts |
| 4 | 3 | constantly | always accepts. Invites others to its group or table. While only listening to a group it sometimes interrupts, but never pulls anyone away. |

NPCs are drawn to places by type. Type 1 prefers the wall chairs and quiet spots, while types 3 and 4 go where people
already are. NPCs take seats, get up, wander, and wait for anyone walking up to talk to them.

### Conversations
- 1v1s and groups of 3 form on neighbouring tiles. Each conversation has a circle around the middle of the talkers'
  tiles. Talkers step in to evenly spaced places on it (face to face, or a triangle), and listeners stand on a wider
  ring outside. Tiles stay everyone's place for walking and blocking.
- Joining a 1v1 makes a group of 3. Anyone joining a group of 3 only listens. If a talker leaves, a listener steps in.
- Everyone seated at the same table or bar, or standing at the same standing table, talks together.
- Interrupting: while you only listen to a group, interacting with one of its talkers may make each of them peeved
  or irritated. Doing it again pulls that talker aside into a 1v1 with you (and rolls again), unless they're irritated.
  - Chances rise with social level. Peeved: 20 / 35 / 50 / 65 % for types 1 to 4. Irritated: 4 / 8 / 12 / 16 %, or
    15 / 25 / 35 / 45 % when already peeved.
  - Peeved (10 s): acts normally, can't be peeved again, and is reluctant, sharing at half speed.
  - Irritated (10 s): can't be pulled away.

### Pies
- Each talker fills their own pie (a grey plate with 3 to 8 outlined slots, over their head) with a wooden piece
  every 5 s while they talk. Type 1 and listeners don't fill theirs, and a reluctant guest fills at half speed.
- Pies show over people while they talk, and fan out from the conversation's middle so they don't pile up.
- The piece snap: the piece drops in fast, sinks a hair too deep and springs back (the click), squashes, glints and
  throws a few wood chips. The plate dips and wobbles, and the other pieces ripple. A full pie sends one wave round.
- Sound hooks: a `window` event `agenda:pie` with `{ type, character, slot, n }`, type `show`, `hide`, `drop`,
  `snap`, `full` or `clear`.

### Testing aids
- "Show types" labels everyone with their type (or P1 / P2), what they're doing and their mood.
- "You are player N · switch" views the match as the other player. Each player sees only their own circle and path.

### Known gaps
- No networking yet, so the other player's figure stands still unless you switch to it, which makes it easy to spot.
- NPC movement hasn't been measured against real human play yet. The plan is to log matches, compare human and NPC
  movement, and tune until telling them apart from movement alone is hard.
- No goal, scoring or end of match; no sound; no names for the guests.

## Files

- `src/world.js`: scene, lights, the render loop, taps and popups (`BOARD` sets the size)
- `src/camera3d.js`: NML's camera, plus `home`, `farTop` and `tapsEverywhere` options
- `src/floor.js`: the painted parquet floor and grid
- `src/room.js`: the walls
- `src/furniture.js`: the dining table, standing tables, bar and wall chairs, their seats, and the highlight
- `src/match.js`: the match seed
- `src/characters.js`: the 20 NPCs and the 2 players' figures, all alike
- `src/movement.js`: walking (paths over the tiles), sitting and getting up, stepping into conversation circles,
  your circle, path arrow and destination
- `src/social.js`: NPC types, conversations, moods, sharing, and every NPC's own choices
- `src/pies.js`: the pies and the wooden pieces, with the snap animation
- `src/template.html`, `src/build.js`: build the pages
- `vendor/`: three.js (r180)

## Build

    node src/build.js

Writes `index.html` (three.js from `vendor/`) and `agenda-artifact.html` (three.js from jsDelivr) for claude.ai.
