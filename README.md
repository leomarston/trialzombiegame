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

Browsers block loading `.glb` files over `file://`, so serve the folder over HTTP:

```bash
# from the project root
python3 -m http.server 8000
```

Then open <http://localhost:8000> and click **"Click to explore"**.

Any static server works (`npx serve`, VS Code "Live Server", etc.).

## Publish it (GitHub Pages)

Push this repo, then in **Settings → Pages** set the source to your branch and
the root folder. The site is fully static (`.nojekyll` is included so the
`vendor/` files are served as-is).

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
assets/models/house_in_the_forest.glb   # the map
vendor/                            # vendored three.js (module + GLTFLoader + PointerLockControls)
```
