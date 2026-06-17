// Forest House — survival: explore the map, but a zombie licker hunts you.
// Reach/enter the house (the west door opens as you approach). One touch = death.
//
// Assets:
//   assets/models/house_in_the_forest.glb  - the map  (katydid, CC-BY 4.0)
//   assets/models/zombie_licker.glb         - the monster (18 animations)
// Three.js is vendored locally under ./vendor (no CDN required).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const MAP_URL    = './assets/models/house_in_the_forest.glb';
const ZOMBIE_URL = './assets/models/zombie_licker.glb';
const SKY_COLOR  = 0x9fc7e8;

// Animation clip indices on the zombie rig (identified by inspection).
const ZA = { idle: 0, run: 4, attack: 15, roar: 11 };

// House front-door geometry (world units, measured from the model).
const DOOR = {
  x: 863,            // door plane, just outside the west gable wall (wall ≈ 865)
  zCenter: -200,
  zLeftHinge: -232,
  zRightHinge: -168,
  halfWidth: 33,     // each panel half-spans toward the centre
  height: 170,
  thickness: 6,
  openDist: 170,     // player distance that triggers opening
  openAngle: 1.78,   // ~102°, swings outward (west)
  // zone where house-wall collision is ignored so you can pass the doorway
  zone: { x0: 826, x1: 900, z0: -240, z1: -160 },
  outsideY: -72,  // ground in front of the door (computed at build)
  floorY: 42,     // interior floor / threshold (computed at build)
};

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const overlay = $('overlay'), subtitle = $('subtitle');
const loadingEl = $('loading'), readyEl = $('ready'), errorEl = $('error'), errorMsg = $('error-msg');
const barEl = $('bar'), pctEl = $('pct'), playBtn = $('play');
const gameoverEl = $('gameover'), againBtn = $('again');
const crosshair = $('crosshair'), hud = $('hud'), modeLabel = $('mode'), statusLabel = $('status');

// ---------------------------------------------------------------------------
// Renderer / Scene / Camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.01, 5000);

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a4631, 1.0); scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.22); scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff2d6, 2.4); sun.castShadow = true; scene.add(sun); scene.add(sun.target);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
const controls = new PointerLockControls(camera, renderer.domElement);
const player = controls.getObject();

controls.addEventListener('lock', () => {
  overlay.classList.add('hidden'); crosshair.style.display = 'block'; hud.style.display = 'block';
});
controls.addEventListener('unlock', () => {
  crosshair.style.display = 'none'; hud.style.display = 'none';
  overlay.classList.remove('hidden');
  // show the right card depending on state
  if (state === 'dead') { showCard(gameoverEl); subtitle.textContent = 'The licker got you'; }
  else if (ready)       { showCard(readyEl);    subtitle.textContent = 'Ready — survive the forest'; }
});
playBtn.addEventListener('click', () => { startRun(); controls.lock(); });
againBtn.addEventListener('click', () => { startRun(); controls.lock(); });

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = Object.create(null);
const MOVE_CODES = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyQ','KeyE']);
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (controls.isLocked && MOVE_CODES.has(e.code)) e.preventDefault();
  if (e.code === 'KeyF' && ready) { flyMode = !flyMode; velocityY = 0; modeLabel.textContent = flyMode ? 'Fly' : 'Walk'; }
  if (e.code === 'KeyR' && ready && state === 'playing') respawnPlayer();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let ready = false;
let state = 'menu';           // 'menu' | 'playing' | 'dead'
let flyMode = false;
let velocityY = 0;
const collidables = [];        // house meshes (walls + floor + ground)
const doorColliders = [];      // the two custom door panels
const spawn = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
let P = null;                  // tunables, scaled to the map
let zombie = null;             // ZombieController
let doors = null;              // DoorController

const raycaster = new THREE.Raycaster();
const _o = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);
const _right = new THREE.Vector3(), _fwd = new THREE.Vector3(), _move = new THREE.Vector3(), _dir = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
const manager = new THREE.LoadingManager();
let mapGltf = null, zombieGltf = null;
const loader = new GLTFLoader(manager);

manager.onProgress = (url, loaded, total) => setProgress(total ? loaded / total : 0);
manager.onError = (url) => onError(new Error('Failed loading ' + url));

loader.load(MAP_URL, (g) => { mapGltf = g; tryBuild(); }, undefined, onError);
loader.load(ZOMBIE_URL, (g) => { zombieGltf = g; tryBuild(); }, undefined, onError);

function setProgress(frac) {
  const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
  barEl.style.width = pct + '%'; pctEl.textContent = pct + '%';
}
function onError(err) {
  console.error(err);
  loadingEl.classList.add('hidden'); readyEl.classList.add('hidden'); gameoverEl.classList.add('hidden');
  errorEl.classList.remove('hidden');
  subtitle.textContent = 'Could not load the game';
  errorMsg.textContent = String(err && err.message || err) +
    '\n\nServe the folder over HTTP (npm start) — .glb files cannot load over file://.';
}
function showCard(el) {
  for (const c of [loadingEl, readyEl, errorEl, gameoverEl]) c.classList.add('hidden');
  el.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Build the world once both models are ready
// ---------------------------------------------------------------------------
function tryBuild() {
  if (!mapGltf || !zombieGltf) return;

  const map = mapGltf.scene;
  map.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; collidables.push(o); } });
  scene.add(map);

  const box = new THREE.Box3().setFromObject(map);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  // Player: smaller & slower than before, and slim enough to fit through the door.
  P = {
    maxDim,
    eyeHeight: maxDim * 0.016,   // ~78  (smaller)
    walkSpeed: maxDim * 0.050,   // ~243 (slower)
    runSpeed:  maxDim * 0.090,   // ~437
    flySpeed:  maxDim * 0.120,
    gravity:   maxDim * 0.190,
    jumpSpeed: maxDim * 0.055,
    collide:   maxDim * 0.0045,  // ~22  (slim, fits the doorway)
    stepUp:    maxDim * 0.010,
    fallLimit: box.min.y - maxDim * 1.5,
  };

  camera.near = maxDim * 0.0012; camera.far = maxDim * 14; camera.updateProjectionMatrix();
  scene.fog = new THREE.Fog(SKY_COLOR, maxDim * 1.3, maxDim * 5.0);

  sun.position.set(center.x + maxDim * 0.7, box.max.y + maxDim, center.z + maxDim * 0.45);
  sun.target.position.copy(center);
  const sc = sun.shadow.camera, r = maxDim * 0.95;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = maxDim * 0.05; sc.far = maxDim * 5;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sc.updateProjectionMatrix();

  // Player spawn: open ground near the centre (sampled, lowest = not under a canopy).
  computeSpawn(box, size, center);

  // Measure the doorway threshold: outside ground vs. interior floor, so we can
  // ramp the player up and into the house (there's a tall step otherwise).
  const oy = groundBelow(790, DOOR.zCenter, 120, maxDim);
  const fy = groundBelow(875, DOOR.zCenter, 120, maxDim);
  if (oy !== null) DOOR.outsideY = oy;
  if (fy !== null) DOOR.floorY = fy;

  // Build the custom front door and the zombie.
  doors = new DoorController();
  zombie = new ZombieController(zombieGltf, P, center);

  ready = true;
  respawnPlayer();        // place the camera at the spawn so the menu shows the world
  setProgress(1);
  subtitle.textContent = 'Ready — survive the forest';
  showCard(readyEl);
}

function computeSpawn(box, size, center) {
  const aboveAll = box.max.y + P.maxDim;
  const baseX = center.x, baseZ = center.z + size.z * 0.28;
  let best = null;
  for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) {
    const x = baseX + gx * size.x * 0.05, z = baseZ + gz * size.z * 0.05;
    const y = sampleGround(x, z, aboveAll);
    if (y === null || y < box.min.y + size.y * 0.05) continue;
    if (best === null || y < best.y) best = { x, z, y };
  }
  if (!best) { const y = sampleGround(center.x, center.z, aboveAll); best = { x: center.x, z: center.z, y: y ?? box.min.y }; }
  spawn.pos.set(best.x, best.y + P.eyeHeight, best.z);
  spawn.look.set(center.x, best.y + P.eyeHeight, center.z);
}

// ---------------------------------------------------------------------------
// Custom front door (two hinged panels) at the west gable
// ---------------------------------------------------------------------------
class DoorController {
  constructor() {
    const baseY = DOOR.floorY;   // door sits on the interior floor / threshold
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a2f17, roughness: 0.85, metalness: 0.0 });
    this.left = this.makePanel(mat, DOOR.zLeftHinge, +1, baseY);
    this.right = this.makePanel(mat, DOOR.zRightHinge, -1, baseY);
    this.angle = 0;     // 0 = closed, DOOR.openAngle = open
    this.targetOpen = false;
  }
  makePanel(mat, hingeZ, dir, baseY) {
    const group = new THREE.Group();
    group.position.set(DOOR.x, baseY, hingeZ);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR.thickness, DOOR.height, DOOR.halfWidth), mat);
    // extend from the hinge toward the centre, sit on the ground
    panel.position.set(0, DOOR.height / 2, dir * DOOR.halfWidth / 2);
    panel.castShadow = true; panel.receiveShadow = true;
    group.add(panel); scene.add(group);
    doorColliders.push(panel);
    group.userData.dir = dir;
    return group;
  }
  update(dt, playerPos) {
    const dx = playerPos.x - DOOR.x, dz = playerPos.z - DOOR.zCenter;
    this.targetOpen = (dx * dx + dz * dz) < DOOR.openDist * DOOR.openDist;
    const target = this.targetOpen ? DOOR.openAngle : 0;
    // smooth swing
    this.angle += (target - this.angle) * Math.min(1, dt * 4.5);
    this.left.rotation.y = -this.angle;   // swings outward (west)
    this.right.rotation.y = +this.angle;
  }
  get isOpen() { return this.angle > DOOR.openAngle * 0.55; }
}

function inDoorZone(p) {
  return p.x > DOOR.zone.x0 && p.x < DOOR.zone.x1 && p.z > DOOR.zone.z0 && p.z < DOOR.zone.z1;
}
// A virtual ramp across the doorway: outside ground -> interior floor, so the
// small player can walk up and inside instead of being stopped by the step.
function rampGround(x) {
  const t = Math.max(0, Math.min(1, (x - DOOR.zone.x0) / (DOOR.zone.x1 - DOOR.zone.x0)));
  return DOOR.outsideY + (DOOR.floorY - DOOR.outsideY) * t;
}

// ---------------------------------------------------------------------------
// Zombie
// ---------------------------------------------------------------------------
class ZombieController {
  constructor(gltf, P, mapCenter) {
    this.P = P;
    this.group = new THREE.Group();
    const model = gltf.scene;
    model.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; this.skinned = this.skinned || (o.isSkinnedMesh ? o : null); } });
    this.group.add(model);

    // Scale to ~2.2x the player's eye height (a big crawling monster).
    scene.updateMatrixWorld(true);
    const bb = this.skeletonBox();
    const md = Math.max(bb.x, bb.y, bb.z) || 8;
    const targetMax = P.eyeHeight * 2.2;
    this.group.scale.setScalar(targetMax / md);
    scene.add(this.group);

    // animations
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = gltf.animations;
    this.actions = {};
    for (const [name, idx] of Object.entries(ZA)) {
      if (this.clips[idx]) { const a = this.mixer.clipAction(this.clips[idx]); a.enabled = true; this.actions[name] = a; }
    }
    this.current = null;
    this.mapCenter = mapCenter;
    this.speed = P.maxDim * 0.066;          // between player walk & run -> must run to escape
    this.killDist = P.collide + targetMax * 0.32;
    this.state = 'idle';
    this.attackT = 0;
    this.onKill = null;
    this.reset();
  }
  skeletonBox() {
    const box = new THREE.Box3(); const v = new THREE.Vector3();
    if (this.skinned && this.skinned.skeleton) {
      for (const b of this.skinned.skeleton.bones) { b.getWorldPosition(v); box.expandByPoint(v); }
    } else box.setFromObject(this.group);
    return box.getSize(new THREE.Vector3());
  }
  play(name, fade = 0.25) {
    const a = this.actions[name]; if (!a || this.current === a) return;
    a.reset();
    if (name === 'attack') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    else a.setLoop(THREE.LoopRepeat, Infinity);
    a.fadeIn(fade); a.play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }
  reset() {
    // spawn between the player and the map centre, on OPEN ground (lowest
    // topmost-hit among a small grid = not on a tree canopy or a roof).
    const px = spawn.pos.x, pz = spawn.pos.z;
    const dx = this.mapCenter.x - px, dz = this.mapCenter.z - pz;
    const len = Math.hypot(dx, dz) || 1;
    const dist = Math.min(len, this.P.maxDim * 0.22);
    const bx = px + dx / len * dist, bz = pz + dz / len * dist;
    const aboveAll = this.mapCenter.y + this.P.maxDim;
    let best = null;
    for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
      const x = bx + gx * this.P.maxDim * 0.03, z = bz + gz * this.P.maxDim * 0.03;
      const y = sampleGround(x, z, aboveAll);
      if (y === null) continue;
      if (best === null || y < best.y) best = { x, y, z };
    }
    if (!best) { const y = sampleGround(this.mapCenter.x, this.mapCenter.z, aboveAll); best = { x: this.mapCenter.x, y: y ?? 0, z: this.mapCenter.z }; }
    this.group.position.set(best.x, best.y, best.z);
    this.state = 'idle'; this.attackT = 0; this.current = null; this._introT = 0;
    this.play('roar', 0.01);
  }
  update(dt, playerPos, active) {
    this.mixer.update(dt);
    if (this.state === 'dead') return;

    if (this.state === 'attack') {
      this.attackT += dt;
      // face the kill, then trigger game over partway into the lunge
      if (this.attackT > 0.30 && this.onKill) { const cb = this.onKill; this.onKill = null; cb(); }
      return;
    }

    // not hunting (menu / between runs): idle in place, watching the player
    if (!active) { this.play('idle', 0.3); this._introT = 0; this.faceTarget(playerPos); return; }

    // brief roar intro, then chase
    if (this._introT < 0.9) { this._introT += dt; this.play('roar', 0.2); this.faceTarget(playerPos); return; }

    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    const distXZ = Math.hypot(dx, dz);

    if (distXZ < this.killDist) { this.bite(); return; }

    this.faceTarget(playerPos);
    this.play('run', 0.3);
    const step = Math.min(this.speed * dt, distXZ);
    const nx = this.group.position.x + dx / distXZ * step;
    const nz = this.group.position.z + dz / distXZ * step;
    // follow the ground from near the feet (so it can't climb tree canopies overhead)
    const gy = groundBelow(nx, nz, this.group.position.y + this.P.maxDim * 0.03, this.P.maxDim * 0.6);
    this.group.position.set(nx, gy !== null ? gy : this.group.position.y, nz);
  }
  faceTarget(t) {
    this.group.rotation.y = Math.atan2(t.x - this.group.position.x, t.z - this.group.position.z);
  }
  bite() {
    this.state = 'attack'; this.attackT = 0;
    this.play('attack', 0.12);
  }
  idle() { this.state = 'idle'; this.play('idle', 0.3); }
}

// ---------------------------------------------------------------------------
// Movement helpers
// ---------------------------------------------------------------------------
function sampleGround(x, z, fromY) {
  _o.set(x, fromY, z); raycaster.set(_o, _down); raycaster.far = (P ? P.maxDim : 1e6) * 8;
  const hits = raycaster.intersectObjects(collidables, true);
  return hits.length ? hits[0].point.y : null;
}
// Topmost surface within `maxDrop` below `fromY` (used to follow ground near the feet).
function groundBelow(x, z, fromY, maxDrop) {
  _o.set(x, fromY, z); raycaster.set(_o, _down); raycaster.far = maxDrop;
  const hits = raycaster.intersectObjects(collidables, true);
  return hits.length ? hits[0].point.y : null;
}
function blocked(dx, dz) {
  _dir.set(dx, 0, dz); if (_dir.lengthSq() === 0) return false; _dir.normalize();
  _o.set(player.position.x, player.position.y - P.eyeHeight * 0.5, player.position.z);
  raycaster.set(_o, _dir); raycaster.far = P.collide;
  // In the doorway, ignore the (fused) house wall and test only the swinging panels.
  const set = inDoorZone(player.position) ? doorColliders : collidables;
  return raycaster.intersectObjects(set, true).length > 0;
}
function respawnPlayer() {
  player.position.copy(spawn.pos); camera.lookAt(spawn.look); velocityY = 0; flyMode = false;
  modeLabel.textContent = 'Walk';
}

function startRun() {
  respawnPlayer();
  if (zombie) zombie.reset();
  state = 'playing';
  statusLabel.textContent = 'RUN';
  showCard(readyEl);
}
function gameOver() {
  if (state !== 'playing') return;
  state = 'dead';
  statusLabel.textContent = 'DEAD';
  controls.unlock();                       // release the mouse (fires unlock handler too)
  crosshair.style.display = 'none'; hud.style.display = 'none';
  overlay.classList.remove('hidden');      // show directly (don't depend on the unlock event)
  showCard(gameoverEl);
  subtitle.textContent = 'The licker got you';
}

// ---------------------------------------------------------------------------
// Player update
// ---------------------------------------------------------------------------
function updatePlayer(dt) {
  _right.setFromMatrixColumn(camera.matrix, 0); _right.y = 0; _right.normalize();
  _fwd.crossVectors(camera.up, _right).normalize();
  let f = 0, r = 0;
  if (keys['KeyW'] || keys['ArrowUp']) f += 1;
  if (keys['KeyS'] || keys['ArrowDown']) f -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) r += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) r -= 1;
  _move.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, r);
  if (_move.lengthSq() > 0) _move.normalize();
  const running = keys['ShiftLeft'] || keys['ShiftRight'];

  if (flyMode) {
    const sp = P.flySpeed * (running ? 2 : 1);
    player.position.addScaledVector(_move, sp * dt);
    let v = 0; if (keys['Space'] || keys['KeyE']) v += 1; if (keys['KeyQ'] || keys['ControlLeft']) v -= 1;
    player.position.y += v * sp * dt;
    return;
  }

  const speed = (running ? P.runSpeed : P.walkSpeed) * dt;
  const dx = _move.x * speed, dz = _move.z * speed;
  if (dx !== 0 && !blocked(dx, 0)) player.position.x += dx;
  if (dz !== 0 && !blocked(0, dz)) player.position.z += dz;

  const feetY = player.position.y - P.eyeHeight;
  if (keys['Space'] && velocityY === 0) {
    const g = sampleGround(player.position.x, player.position.z, feetY + P.stepUp);
    if (g !== null && feetY <= g + P.stepUp * 0.5) velocityY = P.jumpSpeed;
  }
  velocityY -= P.gravity * dt;
  const newFeetY = feetY + velocityY * dt;
  let ground = sampleGround(player.position.x, player.position.z, feetY + P.stepUp);
  if (inDoorZone(player.position)) {
    const r = rampGround(player.position.x);
    ground = ground === null ? r : Math.max(ground, r);
  }
  if (ground !== null) {
    if (newFeetY <= ground) { player.position.y = ground + P.eyeHeight; velocityY = 0; }
    else player.position.y = newFeetY + P.eyeHeight;
  } else {
    player.position.y = newFeetY + P.eyeHeight;
    if (newFeetY < P.fallLimit) respawnPlayer();
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
function step(dt) {
  if (!ready) return;
  if (doors) doors.update(dt, player.position);
  if (zombie) {
    if (state === 'playing') zombie.onKill = gameOver;
    zombie.update(dt, player.position, state === 'playing');
  }
  if (state === 'playing' && controls.isLocked) updatePlayer(dt);
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  step(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
}
animate();

// Small debug handle (also handy for testing / tweaking).
window.__game = {
  get state() { return state; },
  get ready() { return ready; },
  startRun, gameOver, respawnPlayer, step,
  get zombie() { return zombie; }, get doors() { return doors; },
  player, camera, scene,
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
