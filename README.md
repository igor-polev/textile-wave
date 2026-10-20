<!--
    AI impact: reworked by Claude from the author's draft; later restructured by
    Claude — demo link, opening section, performance section, stability section
    rewritten from the constants comment in src/main.js.
    Human review: approved.
-->

# Textile-Wave

Real-time XPBD cloth simulation running entirely in WebGPU compute shaders.
Plain JavaScript: no engine, no libraries, no build step.

**[Live demo](https://igor-polev.github.io/textile-wave/)** — requires a browser
with WebGPU: Chrome or Edge 113+, or another Chromium-based browser with WebGPU
enabled.

<!-- TODO: looping GIF of the running simulation goes here, directly below the demo link -->

A square piece of cloth is held at its four corners while a vertex at its centre
is driven up and down as a sine wave. Both stages of the physics — position
prediction and the constraint solve — run on the GPU, one compute pass each, for
every substep of every frame. The CPU only measures frame time, adjusts the
substep count and encodes the passes.

The physical model is kept minimal on purpose: distance constraints and nothing
else. The work here is in the solver and the time stepping, not in the material.

## Usage

The shaders are loaded with `fetch`, so a local copy must be served over HTTP.
Opening `index.html` as a file will not work.

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The **Gravity on/off** checkbox in the top-left corner switches gravity. The
model parameters — mesh size, mass, compliance, wave amplitude and speed, camera
angles — are constants at the top of `src/main.js`.

## Implementation details

- **Mesh:** a regular grid of particles. Each particle is joined to its
  8 neighbours by distance constraints: 4 along the grid edges and
  4 along the diagonals.
- **Fixed and driven particles:** the four corners and the driving vertex have
  zero inverse mass, so the constraints do not move them.
- **Time stepping:** as in *Small Steps*, each frame is split into n substeps,
  with one XPBD iteration per substep. The frame time step is the measured time
  between frames. The number of substeps adapts to the GPU time budget of a
  frame and stays within fixed limits.
- **Solver:** a parallel Jacobi iteration. One compute pass predicts the
  positions; a second pass solves the constraints of each particle against
  these predictions and updates the positions and velocities. Each constraint is
  therefore evaluated twice per substep, once from each of its two endpoints.
- **Rendering:** the cloth is drawn as a triangle mesh with a depth buffer,
  coloured by depth, on a square canvas.

## Performance

The substep count is not fixed: the render loop measures how long a frame
actually costs and keeps the substep count at the largest value that still fits
into 80% of the frame at the target frame rate. The numbers below therefore say
how much constraint solving this implementation fits into one frame.

> Measurements pending — the tables below are the measurement plan.

**Test bench**

| | |
| :-- | :-- |
| GPU | |
| Driver / Mesa version | |
| Browser and version | |
| OS | |
| Canvas size, px | |
| Device pixel ratio | |

**Throughput against mesh size.** Steady state, gravity on, `TARGET_FPS = 60`,
`COMPLIANCE` at its default. Particle and constraint counts are fixed by the
mesh and are filled in already.

| `MESH_SIZE` | Particles | Constraints | Substeps / frame | FPS | Time per substep, ms | Particle updates / s | Constraint evaluations / s |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 21 | 441 | 1 640 | | | | | |
| 31 | 961 | 3 660 | | | | | |
| 51 | 2 601 | 10 100 | | | | | |
| 71 | 5 041 | 19 740 | | | | | |
| 101 | 10 201 | 40 200 | | | | | |

The two derived columns:

- *particle updates / s* = particles × substeps × FPS;
- *constraint evaluations / s* = 2 × constraints × substeps × FPS, the factor 2
  because the Jacobi pass evaluates every constraint from both of its endpoints.

**Stable substep window.** The lower bound is where the Jacobi iteration stops
converging within a substep; the upper bound is where f32 precision runs out
(*Small Steps*, section 7). `MIN_SUBSTEPS` and `MAX_SUBSTEPS` in `src/main.js`
are set from this window.

| `COMPLIANCE` | Lowest stable substeps | Highest stable substeps |
| ---: | ---: | ---: |
| 0.02 | | |
| 0.08 | | |
| 0.20 | | |

**What the frame is spent on.** Two dispatches per substep means
2 × substeps × FPS compute dispatches per second — fill in that figure and state
which side the limit falls on: GPU memory traffic, or CPU-side command encoding.

| | |
| :-- | :-- |
| Dispatches / s at `MESH_SIZE = 51` | |
| Limiting factor | |

*How the numbers are taken:* `substeps` and `timePerSubstep` in the render loop
of `src/main.js` hold both values; log them once a second after the simulation
has settled. Note that `timePerSubstep` is derived from wall-clock time around
`device.queue.onSubmittedWorkDone()`, so it includes CPU encoding and queue
latency and is a frame-cost estimate rather than a pure GPU measurement. GPU
timestamp queries would give the exact figure — see the TODO in `src/main.js`.

## Numerical stability

The simulation stays stable only inside a window of substep counts, and the
window depends on compliance, mass and mesh step.

- **Too few substeps** and the Jacobi iteration does not converge inside a
  substep: one iteration per substep is enough only while the substep is short
  enough. The mesh then distorts and blows up.
- **Too many substeps** and the time step becomes small enough that f32
  precision limits the position update (*Small Steps*, section 7). Errors
  accumulate instead of shrinking.

`MIN_SUBSTEPS` and `MAX_SUBSTEPS` keep the adaptive controller inside that
window for the default parameters at 60 FPS. Changing `COMPLIANCE`,
`PARTICLE_MASS`, `MESH_SIZE` or `TARGET_FPS` moves the window, and a
combination outside it shows up as a distorted or vanished cloth. Reloading the
page restarts from the initial state.

## Math involved

- [XPBD: Position-Based Simulation of Compliant Constrained Dynamics](https://matthias-research.github.io/pages/publications/XPBD.pdf) (Macklin, Müller, Chentanez, 2016);
- [Small Steps in Physics Simulation](https://matthias-research.github.io/pages/publications/smallsteps.pdf)
  (Macklin et al., 2019), the substep modification of XPBD.
  The shader comments refer to it as `_SSX_`.

## Scope

Distance constraints are the only constraints: there is no damping, no bending
stiffness, no friction and no collision detection. Self-collision in particular
is what separates a solver demonstration from a usable cloth simulation.

## Known Issues

Some combination of parameters can make calculation scheme unstable (distorted or 
disappeared image). In such a case refresh the app page in your browser (press F5
or Ctrl+r).

## Project structure

| File               | Contents                                          |
| :----------------- | :------------------------------------------------ |
| `index.html`       | the page: canvas and UI                           |
| `style.css`        | page styles                                       |
| `src/main.js`      | WebGPU setup, buffers, pipelines, render loop, UI |
| `src/compute.wgsl` | physics: prediction and XPBD constraint solve     |
| `src/render.wgsl`  | vertex and fragment shaders                       |
| `claude-log.md`    | log of the AI assistant usage                     |

## Dependencies

None at runtime: plain JavaScript, HTML and CSS, with no libraries and no build
step. `npm install` is only needed for the WebGPU type hints in the editor
(`@webgpu/types`).

## AI usage disclosure

The physical model, the solver, the time-stepping scheme and the WebGPU
pipeline design are the author's. An AI assistant was used under the rules in
`CLAUDE.md`, and the full prompt-by-prompt record is in `claude-log.md`: most
entries there are reviews that changed no code. What the assistant did write is
the initial page skeleton, adapted from the `webgpu-samples` hello-triangle
sample, one rewrite of the render loop and the substep limits, and spelling
fixes in comments. Every file it touched says so in its header comment.

## License

MIT, see `LICENSE`.
