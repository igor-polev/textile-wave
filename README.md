<!--
    AI impact: reworked by Claude from the author's draft.
    Human review: approved with small corrections.
-->

# Textile-Wave

A simple real-time simulation of textile dynamics, made to test the XPBD
modelling method. A square piece of cloth is held at its four corners, and a
vertex at its centre moves up and down as a sine wave. The physics runs on the
GPU in WebGPU compute shaders.

## Usage

The shaders are loaded with `fetch`, so the page must be served over HTTP.
Opening `index.html` as a local file will not work.

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a browser with WebGPU support
(Chrome or Edge 113+, or another browser with WebGPU enabled).

The **Gravity on/off** checkbox in the top-left corner switches gravity.

The model parameters (mesh size, mass, compliance, wave amplitude and speed,
camera angles) are constants at the top of `src/main.js`.

## Dependencies

None at runtime: plain JavaScript, HTML and CSS, with no libraries and no
build step.

`npm install` is only needed for the WebGPU type hints in the editor
(`@webgpu/types`).

## Math involved

- [XPBD: Position-Based Simulation of Compliant Constrained Dynamics](https://matthias-research.github.io/pages/publications/XPBD.pdf) (Macklin, Müller, Chentanez, 2016);
- [Small Steps in Physics Simulation](https://matthias-research.github.io/pages/publications/smallsteps.pdf)
  (Macklin et al., 2019), the substep modification of XPBD.
  The shader comments refer to it as `_SSX_`.

## Implementation details

- **Mesh:** a regular grid of particles. Each particle is joined to its
  8 neighbours by distance constraints: 4 along the grid edges and
  4 along the diagonals.
- **Fixed and driven particles:** the four corners and the driving vertex have
  zero inverse mass, so the constraints do not move them.
- **Time stepping:** as in *Small Steps*, each frame is split into n substeps,
  with one XPBD iteration per substep. The frame time step is the measured
  time between frames. The number of substeps adapts to the GPU time budget
  of a frame and stays within fixed limits.
- **Solver:** a parallel Jacobi iteration. One compute pass predicts the
  positions; a second pass solves the constraints of each particle against
  these predictions and updates the positions and velocities.
- **Rendering:** the cloth is drawn as a triangle mesh with a depth buffer,
  coloured by depth, on a square canvas.

The model is deliberately simple. The only constraints are edge lengths:
there is no damping, no bending stiffness, no friction and no collision
detection.

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

## AI usage disclosure

AI tools were used in the development of this project, but their use was
intentionally limited; see `CLAUDE.md` for the rules. Every file that AI
changed says so in its header comment, and all prompts and replies are
logged in `claude-log.md`.

## License

MIT, see `LICENSE`.
