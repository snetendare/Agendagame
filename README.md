# Agenda

A game of social manipulation and strategy at a high-society dinner party, loosely inspired by
[No Mans Land](https://github.com/playnomansland/playnomansland.github.io) (NML).

Two players each control one guest among 20 NPCs. Every guest looks alike, so the players have to work out which
figure is the other player. The aim is that you can't tell from how someone walks. You tell from patterns over time,
suspicious behaviour when things get urgent, and people acting out of role.

## Current state

A playable sandbox: the room, the guests, walking, sitting, mingling, and the emotions people give and take in
conversation. There is no win condition, networking or sound yet. Open `index.html` in a browser (serve the folder, e.g. `python3 -m http.server`).

### The room
- 20 x 8 tiles of 6 m (120 x 48 m), indoors: a polished parquet floor with the tile grid in its joints, panelled
  walls, warm light from above.
- Doll's-house walls: the wall the camera looks in over drops to a low panel. Rotate the view and the cut-away wall changes.
- Furniture (no other dressing yet):
  - a dining table with 8 seats
  - 2 standing tables with 3 places each
  - a bar with 2 stools
  - 4 single chairs against the walls

### Ticks
The game runs in ticks of 2 s (`TICK_S` in `src/world.js`, or `agenda.setTick(s)`). Everything anyone decides or does
happens on a tick, at the same moment for everyone: NPC choices, conversation exchanges, moods, and your own orders.
Whatever you order (walk, talk, sit, accept, leave...) waits for the next tick; one order is queued at a time and a new
one replaces it. The ring in the top-left corner fills up to the next tick, and says what you've queued. Walking and the
animations run smoothly between ticks.

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
- Nobody walks more than 3 tiles in one go. NPCs heading further walk leg by leg, a new leg on a tick, so how far
  someone walks at once gives nothing away.
- Nobody starts in a pocket cut off from the room.

### You
- A gold circle under your own figure, visible only to you.
- Your reach: a faint gold square of the tiles within 3 of you (a 7 x 7 square). Tap a tile inside it to walk there
  on the next tick; a tile outside it is too far, so you steer across the room leg by leg. The destination shows as
  soon as you tap, the gold arrow once you walk. Only you see them.
- Talk, Join conversation, Listen in, Join them and Sit down need the person or a free seat within your reach.
- Tap a table, the bar or a chair: it lights up (a warm glow and a gold outline on the floor) and a popup offers
  Sit down (Join table at a standing table), or Get up where you sit.
- Tap a person for a popup about them, with their personal chart (below): Talk, Join conversation, Listen in, Join them (at a table), Speak to them,
  Pull aside or Leave conversation, depending on the situation. A white ring marks who it's about.
- When an NPC wants to talk to you or invites you, a popup with Accept appears over them. No answer within 8 s is a no.

### NPC types
The 20 NPCs are dealt four types, five of each. Players have no type and act as they choose.

| Type | Social | Seeks conversation | When asked |
|---|---|---|---|
| 1 | 0 | never | declines the first ask of the match, then won't talk for 15 s, then accepts. Only takes, never gives. |
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
  - Peeved (10 s): acts normally, can't be peeved again, and is reluctant: acts half as often.
  - Irritated (10 s): can't be pulled away.

### Emotions
Six emotions, each a wooden piece: Indifference (plain wood), Happiness (yellow), Anger (red), Doubt (purple),
Anxiety (grey) and Sadness (blue).

- Personal chart: everyone starts with 2 indifference pieces and 1 other emotion (their starting emotion). Its shares
  are the chance of what they give. Starting pieces never leave it. Pieces taken from conversations are added to it, up
  to 12 in all.
- Gives and takes: most people do both. Every type 1 only takes, and 4 NPCs of the other types only give. The players
  give and take (automatically for now, by the same rules as an NPC).
- Conversation chart: one shared pie of 8 slots per conversation, floating over its middle (over the table, for a
  table). On each tick each member may act (35 to 55 % by social level, half while reluctant). One action gives and
  takes together, 0 to 3 pieces of each, depending on the person, free slots and room in their own chart.
  - Giving: pieces they took earlier go first, and move over. After that a random starting piece, which stays: a copy
    goes in.
  - Taking: at random for now (later decided by what they want). Several takers on one tick split what's there between
    them, one piece at a time.
  - Listeners only take, at most 1 a time. All on a tick happens at once: takes come out of what was there, gives go
    into slots that were empty. The chart goes when the conversation ends.
- The bar: sitting there turns one indifference piece into your starting emotion every 3 ticks (taken pieces first,
  then starting ones).
- Personal charts are 2D, shown in a person's popup and (yours) in the top-left corner. Someone else's chart starts as
  grey pieces with question marks. While you're in a conversation with them, every piece you see them give or take
  shows, and one more of theirs every 3 ticks. Whether they give, take or both shows after 2 ticks together. Your own
  chart is always open to you. A pin marks a starting piece.
- The conversation pies keep the piece snap: the piece drops in fast, sinks a hair too deep and springs back (the
  click), squashes, glints and throws a few wood chips; the plate dips and wobbles, and the other pieces ripple. A full
  pie sends one wave round. A taken piece lifts up and out.
- Sound hooks: a `window` event `agenda:pie` with `{ type, convo, slot, n, e }`, type `show`, `hide`, `drop`, `snap`,
  `full` or `take`.

### Testing aids
- "Show types" labels everyone with their type (or P1 / P2), whether they give (G) and take (T), how many pieces they
  hold, what they're doing and their mood.
- `agenda.pause(true)` stops the clock; `agenda.tick()` steps one tick by hand.
- "You are player N · switch" views the match as the other player. Each player sees only their own circle and path.

### Known gaps
- No networking yet, so the other player's figure stands still unless you switch to it, which makes it easy to spot.
- NPC movement hasn't been measured against real human play yet. The plan is to log matches, compare human and NPC
  movement, and tune until telling them apart from movement alone is hard.
- No goal, scoring or end of match; no sound; no names for the guests.
- Takes are random: "wants" come later. The players can't yet choose what they give or take.

## Files

- `src/world.js`: scene, lights, the render loop, ticks and orders, taps, popups and the HUD (`BOARD` sets the size)
- `src/camera3d.js`: NML's camera, plus `home`, `farTop` and `tapsEverywhere` options
- `src/floor.js`: the painted parquet floor and grid
- `src/room.js`: the walls
- `src/furniture.js`: the dining table, standing tables, bar and wall chairs, their seats, and the highlight
- `src/match.js`: the match seed
- `src/characters.js`: the 20 NPCs and the 2 players' figures, all alike
- `src/movement.js`: walking (paths over the tiles), sitting and getting up, stepping into conversation circles,
  your circle, path arrow and destination
- `src/emotions.js`: the six emotions and the 2D personal chart
- `src/social.js`: NPC types, conversations, moods, giving and taking, what each player has seen, and every NPC's choices
- `src/pies.js`: the conversation pies and the wooden pieces, with the snap animation
- `src/template.html`, `src/build.js`: build the pages
- `vendor/`: three.js (r180)

## Build

    node src/build.js

Writes `index.html` (three.js from `vendor/`) and `agenda-artifact.html` (three.js from jsDelivr) for claude.ai.
