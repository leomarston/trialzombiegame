# Forest House — survival

A first-person survival mini-game built with [Three.js](https://threejs.org/).
You spawn in a forest diorama with a cabin. A **zombie licker hunts you** — run,
and get inside the house (the front door swings open as you approach). One touch
and it's game over; a **Play again** button restarts the run. No build step and
no runtime dependencies (Three.js is vendored under `vendor/`).

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look around |
| `Shift` | Run (you're a touch faster than the zombie) |
| `Space` | Jump |
| `F` | Toggle fly mode (free exploration) |
| `Q` / `E` | Down / Up (fly mode) |
| `R` | Reset position |
| `Esc` | Release the mouse |

## How it works

- **The monster** (`zombie_licker.glb`, 18 animations) roars, then chases you on
  the ground using its in-place gallop clip, turning to face you; when it reaches
  you it lunges (attack clip) and you die.
- **The player** is small and slow enough to be threatened — and slim enough to
  fit through the doorway.
- **The door** on the west gable opens/closes as you approach/leave. The house
  has a real interior; a short virtual ramp at the threshold lets you walk up and
  inside (the model's own door is fused into the walls, so a custom hinged door is
  placed over the entrance).

## Run it locally

Browsers block loading `.glb` files over `file://`, so serve the folder over HTTP.
A tiny zero-dependency Node server is included:

```bash
npm start
```

Then open <http://localhost:8080> and click **"Click to explore"**.
(Set `PORT` to change the port, e.g. `PORT=3000 npm start`.)

## Deploy on Railway

This repo is ready to deploy as a Node web service on [Railway](https://railway.app):

1. Create a new Railway project **→ Deploy from GitHub repo** and pick this repo
   / the `claude/magical-fermi-wkod8z` branch.
2. That's it. Railway auto-detects Node, runs `npm start`, and the server binds
   to the `PORT` it provides on `0.0.0.0` (configured in `server.js` and
   `railway.json`). No build step, no environment variables required.
3. Open the generated public URL and click **"Click to explore"**.

The server (`server.js`) serves the static files with correct MIME types
(`model/gltf-binary` for the `.glb`) and supports HTTP range requests so the
36 MB map streams smoothly.

> Want a custom domain? Add it under the service's **Settings → Networking** in
> Railway.

## Publish it (GitHub Pages alternative)

The site is also fully static, so it works on GitHub Pages: **Settings → Pages**,
set the source to your branch and the root folder (`.nojekyll` is included so the
`vendor/` files are served as-is). Railway is recommended since you asked for it.

## Assets & credits

```
assets/models/house_in_the_forest.glb   # the map   — "House in the forest" by katydid
assets/models/zombie_licker.glb          # the monster — "Zombie licker" by italianPie
```

Both are CC-BY 4.0 — see `assets/models/CREDITS.txt`. The map's movement tuning,
fog, shadows and spawn are scaled to its size; the door position is specific to
this house model (see the `DOOR` constants in `main.js`).

## Project layout

```
index.html                         # page, UI overlay, import map
main.js                            # scene, player, zombie AI, doors, game loop
server.js                          # zero-dependency static server (Railway / local)
package.json                       # `npm start` -> node server.js
railway.json                       # Railway build/deploy config
assets/models/house_in_the_forest.glb   # the map
assets/models/zombie_licker.glb          # the monster
vendor/                            # vendored three.js (module + GLTFLoader + PointerLockControls)
```
