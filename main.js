// Forest House — first-person walk-around viewer
// Loads a .glb map and lets you wander around it with mouse-look + WASD.
// Three.js is vendored locally under ./vendor (no CDN required).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const MODEL_URL = './assets/models/house_in_the_forest.glb';
const SKY_COLOR = 0x9fc7e8;

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const overlay   = document.getElementById('overlay');
const subtitle  = document.getElementById('subtitle');
const loadingEl = document.getElementById('loading');
const readyEl   = document.getElementById('ready');
const errorEl   = document.getElementById('error');
const errorMsg  = document.getElementById('error-msg');
const barEl     = document.getElementById('bar');
const pctEl     = document.getElementById('pct');
const playBtn   = document.getElementById('play');
const crosshair = document.getElementById('crosshair');
const hud        = document.getElementById('hud');
const modeLabel = document.getElementById('mode');

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

// Lights (final intensities/placement are tuned to the model size after it loads)
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a4631, 1.0);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.22);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
sun.castShadow = true;
scene.add(sun);
scene.add(sun.target);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
const controls = new PointerLockControls(camera, renderer.domElement);
const player = controls.getObject(); // === camera

controls.addEventListener('lock', () => {
  overlay.classList.add('hidden');
  crosshair.style.display = 'block';
  hud.style.display = 'block';
});
controls.addEventListener('unlock', () => {
  overlay.classList.remove('hidden');
  crosshair.style.display = 'none';
  hud.style.display = 'none';
});
playBtn.addEventListener('click', () => controls.lock());

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = Object.create(null);
const MOVE_CODES = new Set([
  'KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyQ','KeyE',
]);

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (controls.isLocked && MOVE_CODES.has(e.code)) e.preventDefault();

  if (e.code === 'KeyF' && ready) { flyMode = !flyMode; velocityY = 0; modeLabel.textContent = flyMode ? 'Fly' : 'Walk'; }
  if (e.code === 'KeyR' && ready) respawn();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---------------------------------------------------------------------------
// State (populated once the model has loaded)
// ---------------------------------------------------------------------------
let ready = false;
let flyMode = false;
let velocityY = 0;
const collidables = [];
const spawn = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
let P = null; // tunable params, scaled to the model

const raycaster = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _right = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _move = new THREE.Vector3();
const _dir = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Load the map
// ---------------------------------------------------------------------------
const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager);

loader.load(MODEL_URL, onModelLoaded, onProgress, onError);

function onProgress(evt) {
  if (evt && evt.lengthComputable) setProgress(evt.loaded / evt.total);
}
function setProgress(frac) {
  const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
  barEl.style.width = pct + '%';
  pctEl.textContent = pct + '%';
}
function onError(err) {
  console.error(err);
  loadingEl.classList.add('hidden');
  readyEl.classList.add('hidden');
  errorEl.classList.remove('hidden');
  subtitle.textContent = 'Could not load the map';
  errorMsg.textContent =
    'Failed to load:\n  ' + MODEL_URL +
    '\n\nMake sure the file exists at that path and that you are opening the page through a web server ' +
    '(not via file://). See the README for a one-line command.';
}

function onModelLoaded(gltf) {
  const model = gltf.scene;

  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      collidables.push(o);
    }
  });
  scene.add(model);

  // Measure the model so everything (speed, eye height, fog, shadows) scales to it.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  P = {
    maxDim,
    eyeHeight:  maxDim * 0.022,
    walkSpeed:  maxDim * 0.14,
    runSpeed:   maxDim * 0.32,
    flySpeed:   maxDim * 0.40,
    gravity:    maxDim * 0.95,
    jumpSpeed:  maxDim * 0.30,
    collide:    maxDim * 0.018,
    stepUp:     maxDim * 0.045,
    fallLimit:  box.min.y - maxDim * 1.5,
  };

  camera.near = maxDim * 0.0015;
  camera.far = maxDim * 14;
  camera.updateProjectionMatrix();

  scene.fog = new THREE.Fog(SKY_COLOR, maxDim * 1.3, maxDim * 5.0);

  // Sun + shadow frustum sized to the model.
  sun.position.set(center.x + maxDim * 0.7, box.max.y + maxDim * 1.0, center.z + maxDim * 0.45);
  sun.target.position.copy(center);
  const sc = sun.shadow.camera;
  const r = maxDim * 0.95;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
  sc.near = maxDim * 0.05; sc.far = maxDim * 5;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sc.updateProjectionMatrix();

  // Spawn just outside the building footprint, on the ground, looking at the house.
  const sx = center.x;
  const sz = box.max.z + maxDim * 0.05;
  let groundY = sampleGround(sx, sz, box.max.y + maxDim);
  if (groundY === null) groundY = box.min.y;
  spawn.pos.set(sx, groundY + P.eyeHeight, sz);
  spawn.look.set(center.x, groundY + P.eyeHeight, center.z);

  respawn();
  ready = true;

  setProgress(1);
  subtitle.textContent = 'Ready — walk around the map';
  loadingEl.classList.add('hidden');
  readyEl.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Movement helpers
// ---------------------------------------------------------------------------
// Cast straight down from `fromY` at (x,z); return the surface Y or null.
function sampleGround(x, z, fromY) {
  _origin.set(x, fromY, z);
  raycaster.set(_origin, _down);
  raycaster.far = P ? P.maxDim * 8 : 1e6;
  const hits = raycaster.intersectObjects(collidables, true);
  return hits.length ? hits[0].point.y : null;
}

// Is there a wall within collide distance in horizontal direction (dx,dz)?
function blocked(dx, dz) {
  _dir.set(dx, 0, dz);
  if (_dir.lengthSq() === 0) return false;
  _dir.normalize();
  _origin.set(player.position.x, player.position.y - P.eyeHeight * 0.5, player.position.z);
  raycaster.set(_origin, _dir);
  raycaster.far = P.collide;
  return raycaster.intersectObjects(collidables, true).length > 0;
}

function respawn() {
  player.position.copy(spawn.pos);
  camera.lookAt(spawn.look);
  velocityY = 0;
  flyMode = false;
  modeLabel.textContent = 'Walk';
}

function update(dt) {
  // --- desired horizontal direction from input, relative to where we look ---
  _right.setFromMatrixColumn(camera.matrix, 0); _right.y = 0; _right.normalize();
  _forward.crossVectors(camera.up, _right).normalize(); // forward on the xz-plane

  let f = 0, r = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    f += 1;
  if (keys['KeyS'] || keys['ArrowDown'])  f -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) r += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  r -= 1;

  _move.set(0, 0, 0);
  _move.addScaledVector(_forward, f);
  _move.addScaledVector(_right, r);
  if (_move.lengthSq() > 0) _move.normalize();

  const running = keys['ShiftLeft'] || keys['ShiftRight'];

  if (flyMode) {
    const speed = P.flySpeed * (running ? 2.0 : 1.0);
    player.position.addScaledVector(_move, speed * dt);
    let v = 0;
    if (keys['Space'] || keys['KeyE']) v += 1;
    if (keys['KeyQ'] || keys['ControlLeft']) v -= 1;
    player.position.y += v * speed * dt;
    return;
  }

  // --- walk: per-axis horizontal move with wall collision (lets you slide) ---
  const speed = (running ? P.runSpeed : P.walkSpeed) * dt;
  const dx = _move.x * speed;
  const dz = _move.z * speed;
  if (dx !== 0 && !blocked(dx, 0)) player.position.x += dx;
  if (dz !== 0 && !blocked(0, dz)) player.position.z += dz;

  // --- jump ---
  const feetY = player.position.y - P.eyeHeight;
  if (keys['Space'] && velocityY === 0) {
    // only when grounded (velocityY gets zeroed on landing)
    const g = sampleGround(player.position.x, player.position.z, feetY + P.stepUp);
    if (g !== null && feetY <= g + P.stepUp * 0.5) velocityY = P.jumpSpeed;
  }

  // --- gravity + ground following ---
  velocityY -= P.gravity * dt;
  const newFeetY = feetY + velocityY * dt;
  const ground = sampleGround(player.position.x, player.position.z, feetY + P.stepUp);

  if (ground !== null) {
    if (newFeetY <= ground) {
      player.position.y = ground + P.eyeHeight; // land / stand / step up
      velocityY = 0;
    } else {
      player.position.y = newFeetY + P.eyeHeight; // in the air
    }
  } else {
    player.position.y = newFeetY + P.eyeHeight; // nothing underneath
    if (newFeetY < P.fallLimit) respawn();
  }
}

// ---------------------------------------------------------------------------
// Loop + resize
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (ready && controls.isLocked) update(dt);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
