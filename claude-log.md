# Claude usage log

## 2026-10-03 — Project skeleton

**Prompt:** Prepare the empty skeleton of the project. Keep the folder structure and the files that already exist. Use the WebGPU "Hello Triangle" sample (webgpu-samples) as a prototype.

**Reply:** Filled in the empty files from the Hello Triangle sample: the page with a full-window canvas, the styles, the entry script (WebGPU setup, render pipeline, render loop), and two WGSL shaders in `shaders/` (vertex: one triangle, fragment: red). The shaders are loaded with `fetch`, so the app must be served over HTTP.

## 2026-10-03 — Review of `initShaders`

**Prompt:** Check my `initShaders` function. It fails on `device.createRenderPipeline`. It looks like I messed up the `texFormat` argument.

**Reply:** Review only, no code changed. Two errors break pipeline creation:
- `targets: [{ texFormat }]` makes a target without a `format` key; it must be `{ format: texFormat }`.
- The fragment shader reads `@location(0)`, but the vertex shader does not output it.

Other problems found:
- The index buffer is created with `VERTEX` usage instead of `INDEX`.
- `y` in `prepareMesh` is not reset for each row.
- Negative `z` values are clipped (the clip-space z range is 0..1).
- The Uint16 size check counts indices, not vertices.

## 2026-10-04 — Error "No bind group set at group index 0"

**Prompt:** Look at my `camBuffer` and `src/shaders.wgsl`. I get the error "No bind group set at group index 0".

**Reply:** Review only, no code changed. The buffer and its layout are correct (a 48-byte `mat3x3f` with column padding), but it is never connected to the shader. Fix: create a bind group with `pipeline.getBindGroupLayout(0)` and call `pass.setBindGroup(0, ...)` before the draw. Also noted:
- With the current view angles, one corner of the mesh gets depth > 1 and is clipped.
- The header comments in `shaders.wgsl` and `main.js` are out of date.
