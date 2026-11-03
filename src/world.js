// ===== The world: the room (floor and walls), the characters and the camera =====
// World(THREE, el) builds the scene into el and draws it whenever something changed (the camera moving, a resize, the
// first frame, a pie animating). The board is BOARD.cols x BOARD.rows tiles of BOARD.tile metres, centred on the origin.
// The game runs in ticks of TICK_S seconds: whatever a player orders (walk, talk, sit, accept...) waits for the next
// tick and then happens at the same moment as everything the NPCs do (src/social.js). One order is queued at a time;
// a new one replaces it.
const BOARD = { cols: 20, rows: 8, tile: 6 }; // NML's tiles (6 m), on a wider board: 120 x 48 m
let TICK_S = 2;

const World = (THREE, el, opts = {}) => {
  const T = BOARD.tile, BW = BOARD.cols * T, BD = BOARD.rows * T;

  // ---------- three.js basics, set up as on NML's 3D board ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';
  el.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  const scene = new THREE.Scene();
  // indoors, in the evening: a dark house round the room, warm light from above (the chandeliers, later)
  scene.background = new THREE.Color('#15100D');
  scene.fog = new THREE.Fog('#15100D', 90, 220);
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 600);
  scene.add(new THREE.HemisphereLight('#FFE6C7', '#2A1D15', 1.5));
  const sun = new THREE.DirectionalLight('#FFEBCF', 2.1);
  sun.position.set(-18, 60, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); // NML: 2048 for its 72 x 96 m board; this one is wider
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 60, bottom: -60, near: 1, far: 180 });
  scene.add(sun);

  // ---------- the floor: polished parquet with the tile grid in its joints ----------
  const floorTex = new THREE.CanvasTexture(Floor.paint(BOARD.cols, BOARD.rows, 96));
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(BW, BD), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // outside the room: dark
  const around = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: '#0F0B09' }));
  around.rotation.x = -Math.PI / 2; around.position.y = -0.05;
  scene.add(around);
  // the walls (the one the camera looks in over drops low)
  const room = Room(THREE, scene, BW, BD);
  let dirty = true;

  // ---------- the people ----------
  const match = opts.match || Match();
  const furniture = Furniture(THREE, scene, BOARD);
  // nobody starts on furniture, on a seat, or in a pocket cut off from the room (behind the bar, say)
  const avoid = new Set([...furniture.blocked, ...furniture.seatTiles]);
  {
    const k = (c, r) => c + ',' + r, ok = (c, r) => c >= 0 && r >= 0 && c < BOARD.cols && r < BOARD.rows && !avoid.has(k(c, r));
    const start = [Math.floor(BOARD.cols / 2), BOARD.rows - 1], reach = new Set([k(...start)]), q = [start];
    while (q.length) {
      const [c, r] = q.pop();
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        const nc = c + dc, nr = r + dr;
        if ((!dc && !dr) || !ok(nc, nr) || reach.has(k(nc, nr)) || (dc && dr && (!ok(c + dc, r) || !ok(c, r + dr)))) continue;
        reach.add(k(nc, nr)); q.push([nc, nr]);
      }
    }
    for (let r = 0; r < BOARD.rows; r++) for (let c = 0; c < BOARD.cols; c++) if (!reach.has(k(c, r))) avoid.add(k(c, r));
  }
  const people = Characters(THREE, scene, BOARD, match, avoid);
  const pies = Pies(THREE, scene, { height: people.height, onEvent: (type, detail) => opts.onPie && opts.onPie(type, detail) });
  const moves = Movement(THREE, scene, BOARD, people, furniture, { me: opts.me || 0 });

  // ---------- taps: on a person or a piece of furniture opens a popup over it; on a tile walks you there ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function personAt(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(people.list.map((n) => n.group), true).find((h) => h.object.userData.who != null);
    return hit ? hit.object.userData.who : null;
  }
  function furnitureAt() { // (after personAt, which aimed the ray)
    const hit = ray.intersectObjects(furniture.targets(), true).find((h) => h.object.userData.furniture != null);
    return hit ? hit.object.userData.furniture : null;
  }

  // ---------- the popup: over a piece of furniture (sit down, get up), over a person (talk, join, listen, speak up,
  // pull aside, leave), or over someone asking you (accept) ----------
  const ui = opts.ui || {}, pop = ui.popup; // { el, name, info, go, chart } (elements, from the page)
  // ---------- orders: what each player does on the next tick ----------
  const orders = [null, null]; // per player: { label, run }
  function order(label, run, walkTo) {
    const p = moves.me(); orders[p] = { label, run };
    moves.preview(walkTo ? walkTo.col : null, walkTo ? walkTo.row : null);
    dirty = true;
  }
  let popFor = null; // { kind: 'furniture', f } | { kind: 'person', id } | { kind: 'ask', from, ask, answer }
  const meId = () => moves.mine().id;
  const mySeatAt = (f) => { const me = moves.mine(); return me.seat && me.seat.furniture === f.id ? me.seat : null; };
  // a white ring under the person the popup is about (gold is for you)
  const pick = new THREE.Mesh(new THREE.RingGeometry(people.radius * 1.3, people.radius * 1.3 + 0.28, 48),
    new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  pick.rotation.x = -Math.PI / 2; pick.position.y = 0.055; pick.renderOrder = 2; pick.visible = false; scene.add(pick);
  function openPop(p) {
    if (!pop) return;
    if (popFor && popFor.kind === 'ask' && p.kind !== 'ask') popFor.answer(false);
    popFor = p; refreshPop();
    furniture.highlight(p.kind === 'furniture' ? p.f.id : null);
    pop.el.hidden = false; placePop(); dirty = true;
  }
  function refreshPop() { // its text, again as things change
    const p = popFor;
    if (p.kind === 'furniture') {
      const f = p.f, mine = mySeatAt(f), free = furniture.free(f).length, n = f.seats.length;
      pop.name.textContent = f.name;
      pop.info.textContent = n === 1 ? (mine ? 'Your seat' : free ? 'Free' : 'Taken') : `${free} of ${n} ${f.kind === 'mingle' ? 'places' : 'seats'} free`;
      pop.go.textContent = mine ? (mine.pose === 'sit' ? 'Get up' : 'Leave table') : f.verb;
      const reach = furniture.free(f).some((s) => moves.inReach(meId(), s.col, s.row));
      if (!mine && free && !reach) pop.info.textContent += ' · too far';
      pop.go.disabled = !mine && (!free || !reach); pop.go.hidden = false;
    } else if (p.kind === 'person') {
      const o = social.options(meId(), p.id);
      pop.name.textContent = p.id === meId() ? 'You' : 'Guest';
      pop.info.textContent = o.info; p.act = o.act; p.label = o.label;
      pop.go.hidden = !o.label; pop.go.textContent = o.label || ''; pop.go.disabled = !!o.disabled;
    } else {
      pop.name.textContent = 'Guest';
      pop.info.textContent = p.ask === 'invite' ? 'Invites you to join them' : 'Wants to talk to you';
      pop.go.hidden = false; pop.go.textContent = 'Accept'; pop.go.disabled = false;
    }
    drawChart(pop.chart, p.kind === 'furniture' ? null : p.kind === 'person' ? p.id : p.from, 112);
  }
  // a person's personal chart (2D), as far as you've seen it, and whether they give, take or both
  const drawn = new WeakMap();
  function drawChart(el, id, size) {
    if (!el) return;
    if (id == null) { el.hidden = true; return; }
    const c = social.chart(moves.me(), id), seenN = c.pieces.filter(c.known).length;
    const counts = {}; for (const q of c.pieces) if (c.known(q)) counts[q.e] = (counts[q.e] || 0) + 1;
    const role = !c.role ? 'Gives ? · Takes ?' : c.role.gives && c.role.takes ? 'Gives and takes' : c.role.gives ? 'Gives only' : 'Takes only';
    const rows = EMOTIONS.filter((e) => counts[e.key]).map((e) => `<div class="chip"><i style="background:${e.color}"></i>${e.name} ×${counts[e.key]}</div>`).join('');
    const html = chartSVG(c.pieces, c.known, size) + `<div class="chart-side"><div class="chart-role">${role}</div>`
      + `<div class="chart-meta">${c.pieces.length} of ${c.cap} pieces${c.mine ? '' : ` · ${seenN} seen`}</div>${rows}</div>`;
    if (drawn.get(el) !== html) { el.innerHTML = html; drawn.set(el, html); }
    el.hidden = false;
  }
  function closePop() {
    if (pop) pop.el.hidden = true;
    if (popFor && popFor.kind === 'ask') popFor.answer(false);
    if (popFor) dirty = true;
    popFor = null; furniture.highlight(null);
  }
  const v3 = new THREE.Vector3();
  function placePop() {
    pick.visible = !!popFor && popFor.kind !== 'furniture';
    if (!popFor || !pop) return;
    let x, y, z;
    if (popFor.kind === 'furniture') { [x, z] = furniture.middle(popFor.f); y = popFor.f.top + 1.5; }
    else {
      const id = popFor.kind === 'person' ? popFor.id : popFor.from, g = people.list[id].group;
      x = g.position.x; z = g.position.z; y = people.height + 1.2;
      pick.position.x = x; pick.position.z = z;
    }
    const r = renderer.domElement.getBoundingClientRect();
    v3.set(x, y, z).project(camera);
    if (v3.z > 1) { pop.el.style.visibility = 'hidden'; return; }
    pop.el.style.visibility = '';
    const w = pop.el.offsetWidth, h = pop.el.offsetHeight;
    const px = Math.max(8, Math.min(r.width - w - 8, (v3.x + 1) / 2 * r.width - w / 2)), py = Math.max(8, Math.min(r.height - h - 8, (1 - v3.y) / 2 * r.height - h - 10));
    pop.el.style.transform = `translate(${px}px, ${py}px)`;
  }
  if (pop) pop.go.addEventListener('click', () => {
    const p = popFor; if (!p) return;
    const me = moves.mine().id;
    if (p.kind === 'furniture') {
      const f = p.f;
      order(mySeatAt(f) ? 'Get up' : f.verb, () => {
        social.playerMoved(me);
        if (mySeatAt(f)) { moves.leave(me); return; }
        const pos = moves.mine().group.position, free = furniture.free(f).filter((s) => moves.inReach(me, s.col, s.row)).sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
        for (const s of free) if (moves.sit(me, s) === true) break;
      });
    } else if (p.kind === 'person') {
      const target = p.id, label = p.label; // checked again on the tick: things may have changed by then
      order(label, () => { const o = social.options(me, target); if (o.label === label && !o.disabled && o.act) o.act(); });
    } else { const a = p.answer; popFor = null; order('Accept', () => a(true)); }
    closePop(); dirty = true;
  });
  // a short line about what just happened
  let toastT = 0;
  function toast(text) { if (!ui.toast) return; ui.toast.textContent = text; ui.toast.hidden = false; toastT = 3; }

  // ---------- the party's social life ----------
  const social = Social(people, furniture, moves, pies, match, BOARD, {
    me: meId, toast, onChange: () => { dirty = true; },
    askPlayer: (from, kind, answer) => {
      let over = false; const once = (ok) => { if (over) return; over = true; answer(ok); };
      if (popFor && popFor.kind !== 'ask') return; // busy with something else: no answer is an answer
      openPop({ kind: 'ask', from, ask: kind, answer: once });
      return once;
    },
  });
  // what NPCs ask an accepted player: an invitation takes you there
  // (handled in Social: accepting an invite makes your figure walk to the group or the table)

  // ---------- dev labels: each person's type, what they're doing and their mood ----------
  let dev = false;
  const labels = people.list.map(() => { if (!ui.labels) return null; const d = document.createElement('div'); d.className = 'dev'; d.hidden = true; ui.labels.appendChild(d); return d; });
  function placeLabels() {
    if (!ui.labels) return;
    const r = renderer.domElement.getBoundingClientRect();
    people.list.forEach((p, i) => {
      const d = labels[i]; d.hidden = !dev; if (!dev) return;
      v3.set(p.group.position.x, people.height * 0.55, p.group.position.z).project(camera);
      d.textContent = social.debug(i);
      d.style.transform = `translate(${(v3.x + 1) / 2 * r.width}px, ${(1 - v3.y) / 2 * r.height}px) translate(-50%, -50%)`;
    });
  }
  // ---------- the camera: NML's controls, starting in (and going back to) the tilted view ----------
  const cam = Camera3D(THREE, camera, renderer.domElement, {
    width: BW, depth: BD, home: 1, farTop: room.height, tapsEverywhere: true,
    onInput: () => { dirty = true; },
    onTap: (point, cx, cy) => {
      const id = personAt(cx, cy);
      if (id != null) { openPop({ kind: 'person', id }); return; }
      const f = furnitureAt();
      if (f != null) { openPop({ kind: 'furniture', f: furniture.list[f] }); return; }
      closePop();
      const t = point && people.tileOf(point.x, point.z);
      if (!t) return;
      if (!moves.inReach(meId(), t.col, t.row)) { toast(`Too far: you walk ${moves.REACH} tiles at a time`); return; }
      const me = meId();
      order('Walk', () => { social.playerMoved(me); moves.moveTo(me, t.col, t.row); }, t);
    },
  });

  function size() {
    const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    cam.resize(w, h);
    dirty = true;
  }
  window.addEventListener('resize', size);
  size();

  // ---------- ticks ----------
  let tickT = 0, ticks = 0, paused = false; // pause(true) stops the clock (tick() still steps it by hand, for tests)
  function tick() {
    ticks++;
    for (let p = 0; p < 2; p++) { const o = orders[p]; orders[p] = null; if (o) o.run(); }
    moves.preview(null);
    social.tick(TICK_S);
    dirty = true;
  }
  // the HUD: the tick clock, your queued order, your own chart
  const hud = ui.hud || {};
  function drawHud() {
    if (hud.ring) hud.ring.style.setProperty('--t', (tickT / TICK_S).toFixed(3));
    if (hud.next) { const o = orders[moves.me()]; hud.next.textContent = o ? 'Next tick: ' + o.label : 'Tick ' + ticks; }
    drawChart(hud.chart, meId(), 72);
  }

  let last = performance.now(), frozen = false; // freeze(true) stops drawing (for stepping frames by hand in tests)
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused && (tickT += dt) >= TICK_S) { tickT -= TICK_S; tick(); }
    drawHud();
    if (popFor) refreshPop();
    if (toastT > 0 && (toastT -= dt) <= 0) ui.toast.hidden = true;
    if (dev) dirty = true;
    if (!frozen && (dirty || cam.busy() || pies.busy() || moves.busy())) {
      dirty = false;
      cam.update(dt);
      room.update(camera);
      moves.update(dt);
      pies.update(dt, camera);
      // the fog and the far plane follow how far back the camera stands: a tall phone screen has to stand far
      // back to fit the wide board, further than NML's fog (90 to 220 m) reaches
      const d = camera.position.length();
      scene.fog.near = Math.max(90, d * 0.85); scene.fog.far = Math.max(220, d * 2.2);
      if (Math.abs(camera.far - Math.max(600, d * 3)) > 1) { camera.far = Math.max(600, d * 3); camera.updateProjectionMatrix(); }
      renderer.render(scene, camera);
      placePop(); placeLabels();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { scene, camera: cam, cam3: camera, match, people, furniture, pies, moves, social, closePop, tick, order,
    pause: (on) => { paused = on; }, setTick: (s) => { TICK_S = Math.max(0.1, s); tickT = Math.min(tickT, TICK_S); }, ticks: () => ticks, showTypes: (on) => { dev = on; dirty = true; if (!on) placeLabels(); }, setMe: (p) => { moves.setMe(p); dirty = true; }, renderer, render: () => { dirty = true; }, freeze: (on) => { frozen = on; dirty = true; } };
};
