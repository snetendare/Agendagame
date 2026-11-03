// ===== The party's social life: who talks to whom, in what mood, and the emotions they give and take =====
// Social(people, furniture, moves, pies, match, board, hooks) runs every NPC's choices and every conversation.
// It works in ticks (src/world.js calls tick(dt) every TICK_S seconds): everything anyone decides or does happens on
// a tick, at the same moment for everyone. Only the walking itself and the animations run between ticks.
//
// NPC types (dealt from the match seed, 5 of each among the 20 NPCs; players have no type: they act as they like):
//   type 1, social 0: never seeks a conversation; the first time anyone asks in a match it declines, then won't talk
//                     for 15 s; after that it accepts. It only takes, never gives.
//   type 2, social 1: never seeks a conversation; always accepts.
//   type 3, social 2: sometimes seeks a conversation; always accepts.
//   type 4, social 3: constantly seeks a conversation; always accepts. Inviting: it brings others into its conversation
//                     or to the table or bar where it sits. While only listening to a group it sometimes interrupts,
//                     but never pulls anyone away.
// Conversations:
//   standing: 2 people (a 1v1) or 3 talking, standing on neighbouring tiles facing their middle. Anyone who joins a
//             group of 3 talking only listens. Interacting with a talker in a group you only listen to may make each
//             of them peeved or irritated; doing it again pulls that one aside for a 1v1 (rolling again), unless they
//             are irritated. Peeved (10 s): acts normally but is reluctant (acts half as often) and can't be peeved
//             again, only irritated (likelier). Irritated (10 s): can't be pulled away. The higher the social level,
//             the likelier both.
//   at furniture: everyone seated at the same table or bar (or standing at the same standing table) talks together.
//
// Emotions (src/emotions.js): indifference, happiness, anger, doubt, anxiety, sadness, each a wooden piece.
//   Personal chart: everyone starts with 2 indifference and 1 other emotion (their starting emotion). Starting pieces
//     never leave the chart. Pieces taken from conversations are added to it (up to CAP pieces in all).
//   Roles: some give and take, some only give, some only take (every type 1 only takes; GIVE_ONLY of the others only
//     give). The players give and take.
//   Conversation chart: one shared pie per conversation, SLOTS slots. On a tick each member may act (likelier the more
//     social, half as likely while reluctant). One action gives and takes together, 0 to 3 of each. Giving puts pieces
//     from the personal chart into empty slots: pieces taken earlier go first (they move over); after that a starting
//     piece is picked at random and a copy of it goes in (the share of each emotion is the chance). Taking lifts
//     pieces out of the conversation chart into the personal chart, at random for now (later: by what they want);
//     when several take on the same tick, the pieces are dealt out between them (split). Listeners only take, at most
//     1. Everything on a tick happens at once: takes come out of what was there, gives go into slots that were empty.
//   The bar: anyone seated there turns one indifference piece into their starting emotion every BAR_TICKS ticks
//     (taken pieces first, then starting ones).
//   What a player can see: another person's chart starts as grey pieces with question marks. While you're in a
//     conversation with them you see what they give and take (those pieces show), and every REVEAL_TICKS ticks one more
//     of their pieces. Whether they give, take or both shows after ROLE_TICKS ticks together.
//
// hooks: me() -> my figure's id; askPlayer(fromId, kind ('talk' or 'invite'), answer(ok)) when an NPC asks you;
// toast(text) for what happened when you acted; onChange() when anything visible changed.
// Calls: tick(dt) on every tick; options(meId, targetId) -> { info, label, disabled, act } for the popup over a person;
// playerMoved(id) when a player walks off on their own; debug(id) -> a line for the dev labels;
// chart(viewerPlayer, id) -> what that player can see of id's personal chart.
const Social = (people, furniture, moves, pies, match, board, hooks = {}) => {
  const MOOD_S = 10;        // peeved, irritated and reluctant last this long
  const SHY_COOLDOWN = 15;  // a type 1 won't talk for this long after its first refusal
  const ASK_S = 8;          // a player who doesn't answer an NPC within this long has said no
  const SLOTS = 8;          // slots in a conversation chart
  const CAP = 12;           // pieces a personal chart holds at most
  const GIVE_ONLY = 4;      // NPCs of types 2 to 4 who only give
  const BAR_TICKS = 3, REVEAL_TICKS = 3, ROLE_TICKS = 2;
  // how likely each acts on a tick, and how many pieces (0, 1, 2 or 3) an action gives or takes, by type ('p': players)
  const ACT = { 1: 0.35, 2: 0.35, 3: 0.45, 4: 0.55, p: 0.45 };
  const AMOUNT = { 1: [0.25, 0.5, 0.2, 0.05], 2: [0.25, 0.5, 0.2, 0.05], 3: [0.1, 0.4, 0.35, 0.15], 4: [0.05, 0.3, 0.4, 0.25], p: [0.1, 0.4, 0.35, 0.15] };
  const rr = match.rng, L = people.list, key = (c, r) => c + ',' + r;
  const npcs = L.filter((p) => p.player === null);
  const deck = npcs.map((_, i) => 1 + (i % 4));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  shuffle(deck);
  const S = L.map((p) => ({ id: p.id, type: p.player === null ? deck[npcs.indexOf(p)] : null, convo: null, role: null,
    peeved: 0, irritated: 0, reluctant: 0, declinedOnce: false, cooldown: 0, intent: null, stay: 0,
    wait: p.player === null ? 1 + rr() * 8 : 0, nudges: new Map(), bar: 0 }));
  const convos = new Map(); let nextId = 1;
  const changed = () => hooks.onChange && hooks.onChange();

  // ---------- personal charts ----------
  let uid = 1;
  const piece = (e, start = false) => ({ uid: uid++, e, start });
  const OTHERS = EMOTIONS.map((e) => e.key).filter((k) => k !== 'indifference');
  const giveOnly = new Set(shuffle(S.filter((s) => s.type != null && s.type !== 1).map((s) => s.id)).slice(0, GIVE_ONLY));
  const P = L.map((p) => {
    const base = OTHERS[Math.floor(rr() * OTHERS.length)], s = S[p.id];
    return { base, gives: s.type !== 1, takes: !giveOnly.has(p.id), pieces: [piece('indifference', true), piece('indifference', true), piece(base, true)] };
  });
  // what each player has seen: per player, per person, the pieces seen and the ticks spent together
  const seen = [0, 1].map(() => L.map(() => ({ pieces: new Set(), ticks: 0, role: false })));
  const playerOf = (id) => L[id].player;
  const reveal = (p, id, pc) => { if (pc) seen[p][id].pieces.add(pc.uid); };

  // ---------- where people are ----------
  const pos = (id) => L[id].group.position;
  const dist = (a, b) => Math.hypot(pos(a).x - pos(b).x, pos(a).z - pos(b).z);
  const inside = (c, r) => c >= 0 && r >= 0 && c < board.cols && r < board.rows;
  const occupied = (c, r, self) => L.some((p) => p.id !== self && p.col === c && p.row === r);
  const walkable = (c, r, self) => inside(c, r) && !furniture.blocked.has(key(c, r)) && !furniture.seatTiles.has(key(c, r)) && !occupied(c, r, self);
  const touching = (a, b) => Math.max(Math.abs(L[a].col - L[b].col), Math.abs(L[a].row - L[b].row)) === 1;
  const atRest = (id) => !moves.walking(id);
  const isFree = (id) => !S[id].convo && !L[id].seat && !S[id].intent && atRest(id);
  const pick = (items, weight) => { const w = items.map(weight), sum = w.reduce((a, b) => a + b, 0); if (!(sum > 0)) return null; let x = rr() * sum; for (let i = 0; i < items.length; i++) if ((x -= w[i]) <= 0) return items[i]; return items[items.length - 1]; };
  // a free tile next to the given people (best next to all of them), nearest to self; self's own tile counts
  function spotNear(ids, self) {
    const cand = new Set();
    for (const id of ids) for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (dc || dr) cand.add(key(L[id].col + dc, L[id].row + dr));
    let best = null, bs = Infinity;
    for (const k of cand) {
      const [c, r] = k.split(',').map(Number);
      if (!walkable(c, r, self) || ids.some((id) => L[id].col === c && L[id].row === r)) continue;
      const near = ids.filter((id) => Math.max(Math.abs(L[id].col - c), Math.abs(L[id].row - r)) === 1).length;
      const [x, z] = people.centre(c, r), s = -near * 8 + Math.hypot(x - pos(self).x, z - pos(self).z) / 6;
      if (s < bs) { bs = s; best = { col: c, row: r }; }
    }
    return best;
  }
  // (walks there, or the next leg of the way: nobody walks more than moves.REACH tiles in one go)
  const goTo = (id, t) => (L[id].col === t.col && L[id].row === t.row && atRest(id)) || moves.moveTo(id, t.col, t.row);
  function wander(id, reach) {
    for (let k = 0; k < 20; k++) {
      const c = L[id].col + Math.round((rr() * 2 - 1) * reach), r = L[id].row + Math.round((rr() * 2 - 1) * reach);
      if ((c !== L[id].col || r !== L[id].row) && walkable(c, r, id)) return moves.moveTo(id, c, r);
    }
    return false;
  }

  // ---------- conversations ----------
  const stayFor = (id, kind) => {
    const t = S[id].type; if (t == null) return Infinity; // players stay as long as they like
    const [a, b] = { 1: [8, 18], 2: [15, 35], 3: [20, 45], 4: [25, 55] }[t];
    return (a + rr() * (b - a)) * (kind === 'poi' ? 1.15 : 1);
  };
  function enter(cv, id, role) {
    const s = S[id];
    if (s.convo && s.convo !== cv.id) leave(id);
    (role === 'talk' ? cv.talkers : cv.listeners).add(id);
    s.convo = cv.id; s.role = role; s.stay = stayFor(id, cv.kind); s.nudges.clear();
  }
  function open(cv) { // its shared chart, and the pie that shows it
    cv.chart = Array(SLOTS).fill(null);
    pies.create(cv.id, SLOTS, () => cv.kind === 'stand' ? cv.mid : furniture.middle(furniture.list[cv.furniture]));
  }
  // a standing conversation's circle: its middle is the middle of the talkers' tiles; the talkers step in to evenly
  // spaced places round it (a 1v1 face to face, a group of 3 in a triangle), listeners to a wider ring outside them.
  // Their tiles stay their places for walking and blocking; only the bodies move in.
  const RING = { 2: 1.6, 3: 2.0 }, LISTEN_OUT = 2.8;
  function arrange(cv) {
    if (cv.kind !== 'stand') return;
    const tc = (id) => people.centre(L[id].col, L[id].row), ts = [...cv.talkers], n = ts.length;
    const cx = ts.reduce((a, id) => a + tc(id)[0], 0) / n, cz = ts.reduce((a, id) => a + tc(id)[1], 0) / n, R = RING[n] || 2.2;
    cv.mid = [cx, cz];
    // in order round the middle, then evenly spaced, turned to sit closest to where each one already is
    const order = ts.map((id) => ({ id, a: Math.atan2(tc(id)[1] - cz, tc(id)[0] - cx) })).sort((a, b) => a.a - b.a);
    let sx = 0, sy = 0; order.forEach((o, i) => { const d = o.a - i * 2 * Math.PI / n; sx += Math.cos(d); sy += Math.sin(d); });
    const base = Math.atan2(sy, sx);
    order.forEach((o, i) => { const a = base + i * 2 * Math.PI / n; moves.stand(o.id, cx + Math.cos(a) * R, cz + Math.sin(a) * R, cx, cz); });
    for (const id of cv.listeners) { const [x, z] = tc(id), a = Math.atan2(z - cz, x - cx); moves.stand(id, cx + Math.cos(a) * (R + LISTEN_OUT), cz + Math.sin(a) * (R + LISTEN_OUT), cx, cz); }
  }
  // out of a conversation and standing still: back to the middle of its own tile
  const stepBack = (id) => { if (!L[id].seat && !moves.walking(id)) { const [x, z] = people.centre(L[id].col, L[id].row); moves.stand(id, x, z); } else L[id].faceAt = null; };
  function startConvo(a, b) {
    for (const id of [a, b]) if (S[id].convo) leave(id);
    const cv = { id: nextId++, kind: 'stand', talkers: new Set(), listeners: new Set() };
    convos.set(cv.id, cv); enter(cv, a, 'talk'); enter(cv, b, 'talk'); arrange(cv); open(cv); changed();
    return cv;
  }
  function join(cv, id) {
    if (cv.kind !== 'stand') return;
    enter(cv, id, cv.talkers.size < 3 ? 'talk' : 'listen'); arrange(cv); changed();
  }
  function leave(id) {
    const s = S[id], cv = convos.get(s.convo);
    s.convo = null; s.role = null; s.nudges.clear(); stepBack(id);
    if (!cv) return;
    cv.talkers.delete(id); cv.listeners.delete(id);
    // a group that loses a talker: a listener steps in
    while (cv.kind === 'stand' && cv.talkers.size < 3 && cv.listeners.size) { const q = cv.listeners.values().next().value; cv.listeners.delete(q); cv.talkers.add(q); S[q].role = 'talk'; }
    if (cv.talkers.size < 2) { // too few left to talk: it's over, and its chart with it
      convos.delete(cv.id); pies.destroy(cv.id);
      for (const q of [...cv.talkers, ...cv.listeners]) { S[q].convo = null; S[q].role = null; S[q].nudges.clear(); stepBack(q); }
    } else arrange(cv);
    changed();
  }
  // everyone seated at the same piece of furniture talks together
  function syncFurniture() {
    for (const f of furniture.list) {
      const here = L.filter((p) => p.seated && p.seat && p.seat.furniture === f.id && atRest(p.id)).map((p) => p.id);
      let cv = [...convos.values()].find((c) => c.kind === 'poi' && c.furniture === f.id);
      if (here.length >= 2) {
        if (!cv) { cv = { id: nextId++, kind: 'poi', furniture: f.id, talkers: new Set(), listeners: new Set() }; convos.set(cv.id, cv); open(cv); }
        for (const id of here) if (!cv.talkers.has(id)) { enter(cv, id, 'talk'); changed(); }
        for (const id of [...cv.talkers]) if (!here.includes(id)) leave(id);
      } else if (cv) for (const id of [...cv.talkers]) leave(id);
    }
  }

  // ---------- giving and taking ----------
  const kind = (id) => S[id].type == null ? 'p' : S[id].type;
  const amount = (id) => { const w = AMOUNT[kind(id)]; let x = rr(); for (let n = 0; n < 4; n++) if ((x -= w[n]) <= 0) return n; return 3; };
  // the piece id gives next: a taken piece first (it moves over), else a copy of a random starting piece
  function nextGift(id) {
    const ps = P[id].pieces, gained = ps.filter((q) => !q.start);
    if (gained.length) { const g = gained[Math.floor(rr() * gained.length)]; ps.splice(ps.indexOf(g), 1); return { pc: g, from: g }; }
    const st = ps.filter((q) => q.start), src = st[Math.floor(rr() * st.length)];
    return { pc: piece(src.e), from: src };
  }
  // one tick of a conversation: who acts, the takes (dealt out), then the gives; returns what each did
  function exchange(cv) {
    const chart = cv.chart, emptyBefore = chart.map((q, i) => (q ? -1 : i)).filter((i) => i >= 0);
    const acts = [];
    for (const id of [...cv.talkers, ...cv.listeners]) {
      if (rr() >= ACT[kind(id)] * (S[id].reluctant > 0 ? 0.5 : 1)) continue;
      const listen = cv.listeners.has(id);
      const give = P[id].gives && !listen ? amount(id) : 0;
      const take = P[id].takes ? Math.min(listen ? 1 : 3, amount(id), CAP - P[id].pieces.length) : 0;
      if (give || take) acts.push({ id, give, take, got: [], gave: [] });
    }
    if (!acts.length) return acts;
    // takes: out of what's there, dealt round the takers one piece at a time (random order) until done or none left
    const avail = shuffle(chart.map((q, i) => (q ? i : -1)).filter((i) => i >= 0));
    let takers = shuffle(acts.filter((a) => a.take > 0));
    while (avail.length && takers.length) {
      for (const a of takers) {
        if (!avail.length) break;
        const slot = avail.pop(), pc = chart[slot]; chart[slot] = null;
        P[a.id].pieces.push(pc); a.got.push(pc); a.take--; pies.take(cv.id, slot);
      }
      takers = takers.filter((a) => a.take > 0);
    }
    // gives: into the slots that were empty before this tick, clockwise from the top
    for (const a of shuffle(acts.filter((x) => x.give > 0))) {
      for (let n = 0; n < a.give && emptyBefore.length; n++) {
        const slot = emptyBefore.shift(), g = nextGift(a.id);
        chart[slot] = g.pc; a.gave.push(g); pies.put(cv.id, slot, g.pc.e);
      }
    }
    return acts;
  }
  // the bar: an indifference piece turns into the sitter's starting emotion
  function bar(id) {
    const s = S[id], who = L[id];
    if (!(who.seated && who.seat && furniture.list[who.seat.furniture].kind === 'bar' && atRest(id))) { s.bar = 0; return; }
    if (++s.bar < BAR_TICKS) return;
    s.bar = 0;
    const ps = P[id].pieces, q = ps.find((x) => x.e === 'indifference' && !x.start) || ps.find((x) => x.e === 'indifference');
    if (q) { q.e = P[id].base; changed(); }
  }
  // what the players see: everyone they share a conversation with
  function watch(cv, acts) {
    const members = [...cv.talkers, ...cv.listeners];
    for (const me of members) {
      const p = playerOf(me); if (p == null) continue;
      for (const id of members) {
        if (id === me) continue;
        const k = seen[p][id]; k.ticks++;
        if (k.ticks >= ROLE_TICKS) k.role = true;
        if (k.ticks % REVEAL_TICKS === 0) { const hidden = P[id].pieces.filter((q) => !k.pieces.has(q.uid)); reveal(p, id, hidden[Math.floor(rr() * hidden.length)]); }
      }
      for (const a of acts) {
        if (a.id === me) continue;
        for (const pc of a.got) reveal(p, a.id, pc);                       // you saw them take it
        for (const g of a.gave) if (g.from.start) reveal(p, a.id, g.from); // a copy of a starting piece: now you know it
        if (a.got.length || a.gave.length) seen[p][a.id].role = true;
      }
    }
  }
  // what player p can see of id's chart
  function chart(p, id) {
    const mine = L[id].player === p, k = seen[p][id], c = P[id];
    return { pieces: c.pieces, known: (q) => mine || k.pieces.has(q.uid), role: mine || k.role ? { gives: c.gives, takes: c.takes } : null, cap: CAP, mine };
  }

  // ---------- moods ----------
  // one talker's roll when someone barges in: irritated (slight chance) or peeved (likelier); the more social, the likelier
  function roll(id) {
    const t = S[id]; if (t.type == null || t.irritated > 0) return null;
    const lv = t.type - 1, pI = t.peeved > 0 ? 0.15 + 0.1 * lv : 0.04 + 0.04 * lv, pP = 0.2 + 0.15 * lv, r = rr();
    if (r < pI) { t.irritated = MOOD_S; return 'irritated'; }
    if (t.peeved <= 0 && r < pI + pP) { t.peeved = MOOD_S; t.reluctant = MOOD_S; return 'peeved'; }
    return null;
  }
  // by, only listening to target's group, interacts with target: the whole group may take it badly
  function barge(by, target) {
    const cv = convos.get(S[target].convo); if (!cv) return;
    for (const id of cv.talkers) if (id !== by) roll(id);
    S[by].nudges.set(target, (S[by].nudges.get(target) || 0) + 1);
    changed();
  }

  // ---------- asking ----------
  // from asks to (to talk, or an invitation): done(ok) now (an NPC answers at once) or later (a player decides)
  const pending = []; // { to, done, t }
  function ask(from, to, kind_, done) {
    if (L[to].player !== null) {
      const p = { to, done, t: ASK_S, over: false };
      const answer = (ok) => { if (p.over) return; p.over = true; pending.splice(pending.indexOf(p), 1); done(!!ok); };
      pending.push(p);
      if (hooks.askPlayer && hooks.me && hooks.me() === to) hooks.askPlayer(from, kind_, answer); // the other player answers on their own screen
      return;
    }
    const t = S[to];
    if (t.type === 1) {
      if (!t.declinedOnce) { t.declinedOnce = true; t.cooldown = SHY_COOLDOWN; return done(false, 'declined'); }
      if (t.cooldown > 0) return done(false, 'not now');
    }
    done(true);
  }

  // ---------- intents: something a figure is on its way to do (one leg of the way per tick at most) ----------
  //   talk: walk up to target and ask; join: walk up to a standing conversation and join; sit: take a free seat at a
  //   piece of furniture; pulled: walk up to the one who pulled you aside, for a 1v1
  function intend(id, it) { S[id].intent = { ...it, t: 0 }; }
  const done = (id) => { S[id].intent = null; };
  function stepIntent(id, dt) {
    const it = S[id].intent; if (!it) return;
    it.t += dt;
    if (it.asking) return;
    if (it.t > (L[id].player === null ? 75 : 40)) return done(id); // gave up
    if (!atRest(id)) return;
    if (it.kind === 'talk') {
      const tg = it.target, cv = convos.get(S[tg].convo);
      if (cv && cv.kind === 'stand') { S[id].intent = { kind: 'join', convo: cv.id, t: it.t }; return; }
      if (L[tg].seated) { S[id].intent = { kind: 'sit', furniture: L[tg].seat.furniture, t: it.t }; return; }
      if (S[tg].intent && L[tg].player === null) return; // busy: wait a moment
      if (touching(id, tg) && atRest(tg)) {
        it.asking = true;
        return ask(id, tg, 'talk', (ok, why) => {
          done(id);
          if (ok && !S[tg].convo && !L[tg].seat && touching(id, tg)) startConvo(id, tg);
          else if (L[id].player !== null && hooks.me && hooks.me() === id) hooks.toast(why === 'not now' ? 'They don’t want to talk right now' : 'They’d rather not talk');
        });
      }
      const spot = spotNear([tg], id);
      if (!spot || !goTo(id, spot)) done(id);
    } else if (it.kind === 'join' || it.kind === 'pulled') {
      const cv = it.kind === 'join' ? convos.get(it.convo) : null;
      const ids = cv ? [...cv.talkers] : [it.by];
      if (!ids.length || (cv == null && it.kind === 'join')) return done(id);
      if (ids.some((q) => touching(id, q))) {
        done(id);
        if (it.kind === 'join') join(cv, id);
        else if (!S[it.by].convo) startConvo(it.by, id);
        return;
      }
      const spot = spotNear(ids, id);
      if (!spot || !goTo(id, spot)) done(id);
    } else if (it.kind === 'sit') {
      if (L[id].seated && L[id].seat.furniture === it.furniture) return done(id);
      const f = furniture.list[it.furniture], here = pos(id);
      const free = furniture.free(f).sort((a, b) => Math.hypot(a.x - here.x, a.z - here.z) - Math.hypot(b.x - here.x, b.z - here.z));
      if (S[id].convo) leave(id);
      for (const s of free) { const r = moves.sit(id, s); if (r === true) return done(id); if (r) return; } // there, or a leg of the way
      done(id);
      if (hooks.me && hooks.me() === id) hooks.toast('No free seat there');
    }
  }

  // ---------- the NPCs' choices ----------
  // how strongly each type is drawn to each kind of place
  const PLACE = { 1: { chair: 3, bar: 0.6, dining: 0.5, mingle: 0.3 }, 2: { chair: 1, bar: 1.4, dining: 1, mingle: 0.8 },
    3: { chair: 0.3, bar: 1.2, dining: 1, mingle: 1.4 }, 4: { chair: 0.2, bar: 1.3, dining: 1.1, mingle: 1.5 } };
  function goSit(id) {
    const t = S[id].type, here = pos(id);
    const seat = pick(furniture.seats.filter((s) => s.by == null), (s) => {
      const f = furniture.list[s.furniture], company = f.seats.filter((q) => q.by != null).length;
      const social = t >= 3 ? 1 + company * 0.6 : t === 1 ? 1 / (1 + company) : 1; // the sociable go where others are, the shy where they aren't
      return PLACE[t][f.kind] * social / (10 + Math.hypot(s.x - here.x, s.z - here.z));
    });
    if (!seat) return false;
    const r = moves.sit(id, seat);
    if (r === 'leg') intend(id, { kind: 'sit', furniture: seat.furniture }); // too far for one go: keep heading there
    return !!r;
  }
  // someone, a group or a table to talk to, nearer and livelier likelier
  function seekTalk(id) {
    const t = S[id].type, opts = [];
    for (const p of L) {
      if (p.id === id) continue;
      const d = dist(id, p.id), cv = convos.get(S[p.id].convo);
      if (cv && cv.kind === 'stand') opts.push({ w: (cv.talkers.size < 3 ? 1.3 : t === 4 ? 0.5 : 0.2) / (6 + d), it: { kind: 'join', convo: cv.id } });
      else if (p.seated) { if (furniture.free(furniture.list[p.seat.furniture]).length) opts.push({ w: 0.8 / (6 + d), it: { kind: 'sit', furniture: p.seat.furniture } }); }
      else if (isFree(p.id)) opts.push({ w: 1 / (6 + d), it: { kind: 'talk', target: p.id } });
    }
    const o = pick(opts, (x) => x.w); if (!o) return false;
    intend(id, o.it); return true;
  }
  // a type 4 brings someone nearby into its conversation, or to its seat's table
  function invite(id) {
    const cv = convos.get(S[id].convo), f = L[id].seated ? furniture.list[L[id].seat.furniture] : null;
    if (cv && cv.kind === 'stand' && cv.talkers.size >= 3) return;
    if (f && !furniture.free(f).length) return;
    if (!cv && !f) return;
    const near = L.filter((p) => p.id !== id && isFree(p.id) && dist(id, p.id) < 30);
    const tg = pick(near, (p) => 1 / (6 + dist(id, p.id))); if (!tg) return;
    ask(id, tg.id, 'invite', (ok) => {
      if (!ok) return;
      if (cv && convos.has(cv.id) && cv.kind === 'stand') intend(tg.id, { kind: 'join', convo: cv.id });
      else if (f) intend(tg.id, { kind: 'sit', furniture: f.id });
    });
  }
  function leaveAndGo(id) {
    if (S[id].convo) leave(id);
    if (L[id].seat) moves.leave(id); else wander(id, 2);
  }
  // someone is on their way to talk to id (or to pull it aside): it waits for them
  const awaited = (id) => S.some((q) => q.intent && (q.intent.target === id || (q.intent.kind === 'pulled' && q.intent.by === id)));
  function decide(id) {
    const s = S[id], who = L[id];
    if (s.intent || !atRest(id)) return 1.5;
    if (!s.convo && !who.seat && awaited(id)) return 1.5;
    const cv = convos.get(s.convo);
    if (cv) {
      if (s.stay <= 0) { leaveAndGo(id); return 4 + rr() * 8; }
      if (s.type === 4) {
        if (s.role === 'listen' && rr() < 0.35) { const ts = [...cv.talkers]; barge(id, ts[Math.floor(rr() * ts.length)]); return 10 + rr() * 15; }
        if (rr() < 0.5) invite(id);
      }
      return 4 + rr() * 8;
    }
    if (who.seated) { // alone at a chair, or the only one at a table
      if (s.type === 4 && rr() < 0.7) { invite(id); return 5 + rr() * 6; }
      if (rr() < (s.type === 1 ? 0.25 : 0.6)) { leaveAndGo(id); return 4 + rr() * 8; }
      return 6 + rr() * 10;
    }
    if (rr() < [0, 0, 0, 0.35, 0.85][s.type] && seekTalk(id)) return 6 + rr() * 6;
    const r = rr();
    if (r < [0, 0.4, 0.3, 0.2, 0.15][s.type] && goSit(id)) return 10 + rr() * 15;
    if (r < 0.8 && wander(id, 1 + Math.floor(rr() * 3))) return 4 + rr() * 9;
    return 3 + rr() * 9; // stand where they are a while
  }

  // ---------- the player's side: what tapping a person offers ----------
  const TOO_FAR = ' · too far: get within ' + moves.REACH + ' tiles';
  const near = (me, ids) => ids.some((id) => moves.inReach(me, L[id].col, L[id].row));
  function options(me, target) {
    if (me === target) return { info: 'You', label: null };
    const tm = S[target], mm = S[me], cvT = convos.get(tm.convo), cvM = convos.get(mm.convo);
    if (cvT && cvT === cvM) {
      if (mm.role === 'listen' && cvT.talkers.has(target)) {
        return (mm.nudges.get(target) || 0) === 0
          ? { info: 'Talking in a group of 3 · you’re listening', label: 'Speak to them', act: () => { barge(me, target); hooks.toast && hooks.toast('They’re busy talking. Speak to them again to pull them aside.'); } }
          : { info: 'Talking in a group of 3 · you’re listening', label: 'Pull aside', act: () => pullAside(me, target) };
      }
      return { info: cvT.kind === 'poi' ? 'At your table' : 'Talking with you', label: 'Leave conversation', act: () => { leave(me); if (L[me].seat) moves.leave(me); } };
    }
    if (L[target].seat) {
      const f = furniture.list[L[target].seat.furniture], free = furniture.free(f), ok = free.some((s) => moves.inReach(me, s.col, s.row));
      const info = L[target].seated ? `At the ${f.name.toLowerCase()}` : `On the way to the ${f.name.toLowerCase()}`;
      return { info: info + (free.length && !ok ? TOO_FAR : ''), label: f.kind === 'chair' ? null : 'Join them', disabled: !ok, act: () => playerIntent(me, { kind: 'sit', furniture: f.id }) };
    }
    if (cvT && cvT.kind === 'stand') {
      const full = cvT.talkers.size >= 3, ok = near(me, [...cvT.talkers]);
      return { info: (full ? 'Talking in a group of 3' : 'In a conversation') + (ok ? '' : TOO_FAR), label: full ? 'Listen in' : 'Join conversation', disabled: !ok, act: () => playerIntent(me, { kind: 'join', convo: cvT.id }) };
    }
    const ok = near(me, [target]);
    return { info: (atRest(target) ? 'Standing' : 'Walking') + (ok ? '' : TOO_FAR), label: 'Talk', disabled: !ok, act: () => playerIntent(me, { kind: 'talk', target }) };
  }
  function playerIntent(me, it) {
    if (S[me].convo && !(it.kind === 'join' && it.convo === S[me].convo)) leave(me);
    intend(me, it); changed();
  }
  function pullAside(me, target) {
    barge(me, target);
    if (S[target].irritated > 0) { hooks.toast && hooks.toast('They won’t leave the group right now'); return; }
    leave(target); leave(me);
    intend(target, { kind: 'pulled', by: me });
  }
  // a player walked off on their own: out of any conversation, and nothing planned
  function playerMoved(id) { if (S[id].convo) leave(id); S[id].intent = null; }

  // ---------- every tick ----------
  function tick(dt) {
    for (const s of S) {
      for (const k of ['peeved', 'irritated', 'reluctant', 'cooldown']) if (s[k] > 0) s[k] = Math.max(0, s[k] - dt);
      if (s.convo) s.stay -= dt;
    }
    for (let i = pending.length - 1; i >= 0; i--) { const p = pending[i]; p.t -= dt; if (p.t <= 0 && !p.over) { p.over = true; pending.splice(i, 1); p.done(false); } }
    syncFurniture();
    for (const s of S) stepIntent(s.id, dt);
    for (const s of S) {
      if (s.type == null) continue;
      s.wait -= dt;
      if (s.wait <= 0) s.wait = decide(s.id);
    }
    for (const cv of convos.values()) { const acts = exchange(cv); watch(cv, acts); if (acts.length) changed(); }
    for (const s of S) bar(s.id);
  }
  function debug(id) {
    const s = S[id], cv = convos.get(s.convo), c = P[id];
    const who = s.type == null ? 'P' + (L[id].player + 1) : 'T' + s.type;
    const role = c.gives && c.takes ? 'G+T' : c.gives ? 'G' : 'T';
    const doing = cv ? (cv.kind === 'poi' ? 'table' : s.role === 'listen' ? 'listen' : cv.talkers.size === 2 ? '1v1' : 'group') : L[id].seated ? 'seat' : s.intent ? s.intent.kind : '';
    const mood = [s.peeved > 0 && 'peeved ' + Math.ceil(s.peeved), s.irritated > 0 && 'irritated ' + Math.ceil(s.irritated), s.cooldown > 0 && 'shy ' + Math.ceil(s.cooldown)].filter(Boolean).join(' · ');
    return [who, role + ' ' + c.pieces.length, doing, mood].filter(Boolean).join(' · ');
  }
  return { tick, options, playerMoved, debug, chart, convos, state: S, personal: P, intend, startConvo, leave };
};
