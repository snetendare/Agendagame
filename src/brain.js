// ===== The NPCs' own minds: now and then they sit down, get up, or wander =====
// Brain(people, furniture, moves, match, board) lets every NPC (not the players' figures) act on its own: each waits a while,
// then picks something to do. Standing, it may take a free seat or a place at a table (the nearer the likelier), or
// stroll a few tiles; seated, it mostly stays a good while, then gets up and wanders off. Random numbers come from
// the match, so a networked match plays the same for both. update(dt) every frame (cheap).
const Brain = (people, furniture, moves, match, board) => {
  const rr = match.rng;
  const npcs = people.list.filter((p) => p.player === null);
  const wait = new Map(npcs.map((p) => [p.id, 2 + rr() * 12])); // the first moves come soon after the party starts
  const randomTile = (from, reach) => {
    for (let k = 0; k < 20; k++) {
      const c = from.col + Math.round((rr() * 2 - 1) * reach), r = from.row + Math.round((rr() * 2 - 1) * reach);
      const key = c + ',' + r;
      if (c < 0 || r < 0 || c >= board.cols || r >= board.rows || furniture.blocked.has(key) || furniture.seatTiles.has(key)) continue;
      if (people.list.some((q) => q.col === c && q.row === r)) continue;
      return { col: c, row: r };
    }
    return null;
  };
  function pickSeat(p) {
    const free = furniture.seats.filter((s) => s.by == null);
    if (!free.length) return null;
    // weighted by nearness: a seat across the room is still possible, just less likely
    const pos = p.group.position, w = free.map((s) => 1 / (8 + Math.hypot(s.x - pos.x, s.z - pos.z)));
    let x = rr() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < free.length; i++) if ((x -= w[i]) <= 0) return free[i];
    return free[free.length - 1];
  }
  function act(p) {
    if (moves.walking(p.id)) return 3;
    if (p.seated) {
      if (rr() < 0.55) return 10 + rr() * 20;                       // stay a while longer
      const t = randomTile(p, 4); if (t) moves.moveTo(p.id, t.col, t.row);
      return 8 + rr() * 12;
    }
    const roll = rr();
    if (roll < 0.45) { const s = pickSeat(p); if (s && moves.sit(p.id, s)) return 15 + rr() * 25; }
    if (roll < 0.8) { const t = randomTile(p, 3); if (t) moves.moveTo(p.id, t.col, t.row); return 6 + rr() * 10; }
    return 4 + rr() * 8;                                              // stand and chat where they are
  }
  function update(dt) {
    for (const p of npcs) {
      const t = wait.get(p.id) - dt;
      wait.set(p.id, t > 0 ? t : act(p));
    }
  }
  return { update };
};
