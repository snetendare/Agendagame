// ===== The world: the board, the land around it, the NPCs and the camera =====
// World(THREE, el) builds the scene into el and draws it whenever something changed (the camera moving, a resize, the
// scenery finishing loading). The board is BOARD.cols x BOARD.rows tiles of BOARD.tile metres, centred on the origin.
const BOARD = { cols: 20, rows: 8, tile: 6 }; // NML's tiles (6 m), on a wider board: 120 x 48 m

const World = (THREE, el) => {
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
  scene.background = new THREE.Color('#0D1315');
  scene.fog = new THREE.Fog('#0D1315', 90, 220);
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 600);
  scene.add(new THREE.HemisphereLight('#cfe3ff', '#20262a', 1.6));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
  sun.position.set(-30, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); // NML: 2048 for its 72 x 96 m board; this one is wider
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 60, bottom: -60, near: 1, far: 180 });
  scene.add(sun);

  // ---------- the floor: the painted meadow with its grid ----------
  const floorTex = new THREE.CanvasTexture(Floor.paint(BOARD.cols, BOARD.rows, 96));
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(BW, BD), new THREE.MeshLambertMaterial({ map: floorTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // the land around the board
  const around = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: '#141b1d' }));
  around.rotation.x = -Math.PI / 2; around.position.y = -0.05; around.receiveShadow = true;
  scene.add(around);

  // ---------- trees, bushes and grass round the board, and small plants on it (the meadow) ----------
  let dirty = true;
  const look = { cols: BOARD.cols, rows: BOARD.rows, look: 'meadow', id: 'agenda' };
  const scenery = Scenery3D(THREE, scene, { renderer, onReady: () => { scenery.update(look, () => 0, BW, BD, T); dirty = true; } });
  const bi = scenery.biome('meadow');
  scene.background.set(bi.sky); scene.fog.color.set(bi.sky); around.material.color.set(bi.land);

  // ---------- the people ----------
  const npcs = NPCs(THREE, scene, BOARD);

  // ---------- the camera: NML's controls, starting in (and going back to) the tilted view ----------
  const cam = Camera3D(THREE, camera, renderer.domElement, {
    width: BW, depth: BD, home: 1, farTop: npcs.height + 1,
    onInput: () => { dirty = true; },
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

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (dirty || cam.busy()) {
      dirty = false;
      cam.update(dt);
      // the fog and the far plane follow how far back the camera stands: a tall phone screen has to stand far
      // back to fit the wide board, further than NML's fog (90 to 220 m) reaches
      const d = camera.position.length();
      scene.fog.near = Math.max(90, d * 0.85); scene.fog.far = Math.max(220, d * 2.2);
      if (Math.abs(camera.far - Math.max(600, d * 3)) > 1) { camera.far = Math.max(600, d * 3); camera.updateProjectionMatrix(); }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { scene, camera: cam, npcs, renderer, render: () => { dirty = true; } };
};
