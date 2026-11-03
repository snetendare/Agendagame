// ===== The party's social life: who talks to whom, in what mood, and what they share =====
// Social(people, furniture, moves, pies, match, board, hooks) runs every NPC's choices and every conversation.
//
// NPC types (dealt from the match seed, 5 of each among the 20 NPCs; players have no type: they act as they like):
//   type 1, social 0: never seeks a conversation; the first time anyone asks in a match it declines, then won't talk
//                     for 15 s; after that it accepts. In a conversation it never adds anything.
//   type 2, social 1: never seeks a conversation; always accepts.
//   type 3, social 2: sometimes seeks a conversation; always accepts.
//   type 4, social 3: constantly seeks a conversation; always accepts. Inviting: it brings others into its conversation
//                     or to the table or bar where it sits. While only listening to a group it sometimes interrupts,
//                     but never pulls anyone away.
// Conversations:
//   standing: 2 people (a 1v1) or 3 talking, standing on neighbouring tiles facing their middle. Anyone who joins a
//             group of 3 talking only listens. Interacting with a talker in a group you only listen to may make each
//             of them peeved or irritated; doing it again pulls that one aside for a 1v1 (rolling again), unless they
//             are irritated. Peeved (10 s): acts normally but is reluctant (adds at half speed) and can't be peeved
//             again, only irritated (likelier). Irritated (10 s): can't be pulled away. The higher the social level,
//             the likelier both.
//   at furniture: everyone seated at the same table or bar (or standing at the same standing table) talks together.
// Sharing: every talker who adds to the conversation fills their own pie (shown over them while they're in one), one
// piece every SHARE_S seconds, half as fast while reluctant. Type 1 and listeners don't fill theirs.
//
// hooks: me() -> my figure's id; askPlayer(fromId, kind ('talk' or 'invite'), answer(ok)) when an NPC asks you;
// toast(text) for what happened when you acted; onChange() when anything visible changed.
// Calls: update(dt) every frame; options(meId, targetId) -> { info, label, disabled, act } for the popup over a person;
// playerMoved(id) when a player walks off on their own; debug(id) -> a line for the dev labels.
const Social = (people, furniture, moves, pies, match, board, hooks = {}) => {
  const SHARE_S = 5;        // a talker fills a pie piece this often
  const MOOD_S = 10;        // peeved, irritated and reluctant last this long
  const SHY_COOLDOWN = 15;  // a type 1 won't talk for this long after its first refusal
  const ASK_S = 8;          // a player who doesn't answer an NPC within this long has said no
  const rr = match.rng, L = people.list, key = (c, r) => c + ',' + r;
  const npcs = L.filter((p) => p.player === null);
  const deck = npcs.map((_, i) => 1 + (i % 4));
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const S = L.map((p) => ({ id: p.id, type: p.player === null ? deck[npcs.indexOf(p)] : null, convo: null, role: null, share: 0,
    peeved: 0, irritated: 0, reluctant: 0, declinedOnce: false, cooldown: 0, intent: null, stay: 0,
    wait: p.player === null ? 1 + rr() * 8 : 0, nudges: new Map() }));
  const convos = new Map(); let nextId = 1;
  const changed = () => hooks.onChange && hooks.onChange();

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
    if (role === 'talk') pies.show(id);
  }
  // a standing conversation's circle: its middle is the middle of the talkers' tiles; the talkers step in to evenly
  // spaced places round it (a 1v1 face to face, a group of 3 in a triangle), listeners to a wider ring outside them.
  // Their tiles stay their places for walking and blocking; only the bodies move in.
  const RING = { 2: 1.6, 3: 2.0 }, LISTEN_OUT = 2.8;
  const PIE_OUT = { 2: 1.6, 3: 2.3 }; // how far each talker's pie leans out from the middle
  function arrange(cv) {
    if (cv.kind !== 'stand') return;
    const tc = (id) => people.centre(L[id].col, L[id].row), ts = [...cv.talkers], n = ts.length;
    const cx = ts.reduce((a, id) => a + tc(id)[0], 0) / n, cz = ts.reduce((a, id) => a + tc(id)[1], 0) / n, R = RING[n] || 2.2;
    // in order round the middle, then evenly spaced, turned to sit closest to where each one already is
    const order = ts.map((id) => ({ id, a: Math.atan2(tc(id)[1] - cz, tc(id)[0] - cx) })).sort((a, b) => a.a - b.a);
    let sx = 0, sy = 0; order.forEach((o, i) => { const d = o.a - i * 2 * Math.PI / n; sx += Math.cos(d); sy += Math.sin(d); });
    const base = Math.atan2(sy, sx);
    order.forEach((o, i) => {
      const a = base + i * 2 * Math.PI / n;
      moves.stand(o.id, cx + Math.cos(a) * R, cz + Math.sin(a) * R, cx, cz);
      pies.offset(o.id, Math.cos(a) * PIE_OUT[n], Math.sin(a) * PIE_OUT[n]); pies.show(o.id); // pies fan out from the middle
    });
    for (const id of cv.listeners) { const [x, z] = tc(id), a = Math.atan2(z - cz, x - cx); moves.stand(id, cx + Math.cos(a) * (R + LISTEN_OUT), cz + Math.sin(a) * (R + LISTEN_OUT), cx, cz); pies.hide(id); } // listeners share nothing: no pie
  }
  // out of a conversation and standing still: back to the middle of its own tile
  const stepBack = (id) => { if (!L[id].seat && !moves.walking(id)) { const [x, z] = people.centre(L[id].col, L[id].row); moves.stand(id, x, z); } else L[id].faceAt = null; };
  function startConvo(a, b) {
    for (const id of [a, b]) if (S[id].convo) leave(id);
    const cv = { id: nextId++, kind: 'stand', talkers: new Set(), listeners: new Set() };
    convos.set(cv.id, cv); enter(cv, a, 'talk'); enter(cv, b, 'talk'); arrange(cv); changed();
    return cv;
  }
  function join(cv, id) {
    if (cv.kind !== 'stand') return;
    enter(cv, id, cv.talkers.size < 3 ? 'talk' : 'listen'); arrange(cv); changed();
  }
  function leave(id) {
    const s = S[id], cv = convos.get(s.convo);
    s.convo = null; s.role = null; s.nudges.clear(); stepBack(id); pies.offset(id, 0, 0);
    pies.hide(id);
    if (!cv) return;
    cv.talkers.delete(id); cv.listeners.delete(id);
    // a group that loses a talker: a listener steps in
    while (cv.kind === 'stand' && cv.talkers.size < 3 && cv.listeners.size) { const q = cv.listeners.values().next().value; cv.listeners.delete(q); cv.talkers.add(q); S[q].role = 'talk'; }
    if (cv.talkers.size < 2) { // too few left to talk: it's over
      convos.delete(cv.id);
      for (const q of [...cv.talkers, ...cv.listeners]) { S[q].convo = null; S[q].role = null; S[q].nudges.clear(); stepBack(q); pies.offset(q, 0, 0); pies.hide(q); }
    } else arrange(cv);
    changed();
  }
  // everyone seated at the same piece of furniture talks together
  function syncFurniture() {
    for (const f of furniture.list) {
      const here = L.filter((p) => p.seated && p.seat && p.seat.furniture === f.id && atRest(p.id)).map((p) => p.id);
      let cv = [...convos.values()].find((c) => c.kind === 'poi' && c.furniture === f.id);
      if (here.length >= 2) {
        if (!cv) { cv = { id: nextId++, kind: 'poi', furniture: f.id, talkers: new Set(), listeners: new Set() }; convos.set(cv.id, cv); }
        for (const id of here) if (!cv.talkers.has(id)) { enter(cv, id, 'talk'); changed(); }
        for (const id of [...cv.talkers]) if (!here.includes(id)) leave(id);
      } else if (cv) for (const id of [...cv.talkers]) leave(id);
    }
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
  function ask(from, to, kind, done) {
    if (L[to].player !== null) {
      const p = { to, done, t: ASK_S, over: false };
      const answer = (ok) => { if (p.over) return; p.over = true; pending.splice(pending.indexOf(p), 1); done(!!ok); };
      pending.push(p);
      if (hooks.askPlayer && hooks.me && hooks.me() === to) hooks.askPlayer(from, kind, answer); // the other player answers on their own screen
      return;
    }
    const t = S[to];
    if (t.type === 1) {
      if (!t.declinedOnce) { t.declinedOnce = true; t.cooldown = SHY_COOLDOWN; return done(false, 'declined'); }
      if (t.cooldown > 0) return done(false, 'not now');
    }
    done(true);
  }

  // ---------- intents: something a figure is on its way to do ----------
  //   talk: walk up to target and ask; join: walk up to a standing conversation and join; sit: take a free seat at a
  //   piece of furniture; pulled: walk up to the one who pulled you aside, for a 1v1
  function intend(id, it) { S[id].intent = { ...it, t: 0, last: null }; }
  const done = (id) => { S[id].intent = null; };
  function stepIntent(id, dt) {
    const it = S[id].intent; if (!it) return;
    it.t += dt;
    if (it.asking) return;
    if (it.t > (L[id].player === null ? 30 : 60)) return done(id); // gave up
    if (!atRest(id)) return;
    if (it.kind === 'talk') {
      const tg = it.target, cv = convos.get(S[tg].convo);
      if (cv && cv.kind === 'stand') { S[id].intent = { kind: 'join', convo: cv.id, t: it.t, last: null }; return; }
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
      const k = key(L[tg].col, L[tg].row);
      if (it.last === k) return; // already on the way to where they are
      it.last = k;
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
      const k = ids.map((q) => key(L[q].col, L[q].row)).join('|');
      if (it.last === k) return;
      it.last = k;
      const spot = spotNear(ids, id);
      if (!spot || !goTo(id, spot)) done(id);
    } else if (it.kind === 'sit') {
      const f = furniture.list[it.furniture], here = pos(id);
      const free = furniture.free(f).sort((a, b) => Math.hypot(a.x - here.x, a.z - here.z) - Math.hypot(b.x - here.x, b.z - here.z));
      done(id);
      if (S[id].convo) leave(id);
      if (!free.some((s) => moves.sit(id, s)) && hooks.me && hooks.me() === id) hooks.toast('No free seat there');
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
    return !!seat && moves.sit(id, seat);
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
      const f = furniture.list[L[target].seat.furniture], free = furniture.free(f).length;
      return { info: L[target].seated ? `At the ${f.name.toLowerCase()}` : `On the way to the ${f.name.toLowerCase()}`, label: f.kind === 'chair' ? null : 'Join them', disabled: !free, act: () => playerIntent(me, { kind: 'sit', furniture: f.id }) };
    }
    if (cvT && cvT.kind === 'stand') {
      const full = cvT.talkers.size >= 3;
      return { info: full ? 'Talking in a group of 3' : 'In a conversation', label: full ? 'Listen in' : 'Join conversation', act: () => playerIntent(me, { kind: 'join', convo: cvT.id }) };
    }
    return { info: atRest(target) ? 'Standing' : 'Walking', label: 'Talk', act: () => playerIntent(me, { kind: 'talk', target }) };
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

  // ---------- every frame ----------
  function update(dt) {
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
    // sharing: talkers fill their pies
    for (const cv of convos.values()) for (const id of cv.talkers) {
      const s = S[id]; if (s.type === 1) continue;
      s.share += dt / SHARE_S * (s.reluctant > 0 ? 0.5 : 1);
      if (s.share >= 1) { s.share -= 1; const p = pies.state(id); if (p.filled < p.n) pies.add(id); }
    }
  }
  function debug(id) {
    const s = S[id], cv = convos.get(s.convo);
    const who = s.type == null ? 'P' + (L[id].player + 1) : 'T' + s.type;
    const doing = cv ? (cv.kind === 'poi' ? 'table' : s.role === 'listen' ? 'listen' : cv.talkers.size === 2 ? '1v1' : 'group') : L[id].seated ? 'seat' : s.intent ? s.intent.kind : '';
    const mood = [s.peeved > 0 && 'peeved ' + Math.ceil(s.peeved), s.irritated > 0 && 'irritated ' + Math.ceil(s.irritated), s.cooldown > 0 && 'shy ' + Math.ceil(s.cooldown)].filter(Boolean).join(' · ');
    return [who, doing, mood].filter(Boolean).join(' · ');
  }
  return { update, options, playerMoved, debug, convos, state: S, intend, startConvo, leave };
};
