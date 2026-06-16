# Forest House — walkable 3D map

A tiny first-person viewer built with [Three.js](https://threejs.org/). It loads
a `.glb` map and lets you **wander around it** with mouse-look and WASD — no build
step, no dependencies to install at runtime (Three.js is vendored under `vendor/`).

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | Walk |
| Mouse | Look around |
| `Shift` | Run |
| `Space` | Jump (hold to ascend in fly mode) |
| `F` | Toggle fly / walk mode |
| `Q` / `E` | Down / Up (fly mode) |
| `R` | Reset to the start position |
| `Esc` | Release the mouse |

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

## Swapping in your own map

The viewer always loads:

```
assets/models/house_in_the_forest.glb
```

To use a different map, just replace that file with your own `.glb` (keep the
same name/path) and reload. Everything — movement speed, eye height, fog,
shadows, and the spawn point — is scaled automatically to whatever model you
load, so any reasonably-sized `.glb` will work.

> The bundled map is "House in the forest" by katydid, CC-BY 4.0
> (see `assets/models/CREDITS.txt`).

## Project layout

```
index.html                         # page, UI overlay, import map
main.js                            # scene, controls, movement, model loading
server.js                          # zero-dependency static server (Railway / local)
package.json                       # `npm start` -> node server.js
railway.json                       # Railway build/deploy config
assets/models/house_in_the_forest.glb   # the map
vendor/                            # vendored three.js (module + GLTFLoader + PointerLockControls)
```
