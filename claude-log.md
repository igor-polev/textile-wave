<!-- AI impact: this log is written and maintained by Claude. -->
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

## 2026-10-06 — Bind group error after splitting the shaders

**Prompt:** I split the shaders into `src/compute.wgsl` and `src/render.wgsl`. Now `createBindGroup` fails: "binding index 1 not present in the bind group layout". How do I bind the buffers properly?

**Reply:** Review only, no code changed. With `layout: 'auto'`, a pipeline's layout has only the bindings its entry point uses. `compute_main` does not use `camRotation`, so binding 1 is missing. Also, an `'auto'` layout works only with its own pipeline, and binding 0 differs (`read_write` in compute, `read` in vertex). So one shared bind group cannot work. Fix: make two bind groups, one from each pipeline's `getBindGroupLayout(0)`: compute gets bindings 0 and 2, render gets 0, 1 and 2. Also noted: the dispatch count uses the number of floats, not particles (8 times too many threads), and the bounds check in `compute_main` is commented out.

## 2026-10-07 — Review of the XPBD code

**Prompt:** Review `main.js`, `compute.wgsl`, `render.wgsl`: find errors, check padding, check spelling in comments, compare the math with the XPBD and Small Steps papers, give advice.

**Reply:** Review only, no code changed.
- Blocking errors: the `while (true)` loop freezes the page; `p.massInv` and the `fragment_main` parameter do not compile; the render bind group has binding 1, which the `'auto'` layout drops; one compute bind group is used with two `'auto'` pipelines; `idxDTime` points to the compliance slot, so `dtime` stays 0 and everything turns into NaN; the neighbour index wraps across row ends; neighbour reads race with writes.
- Compared with the papers: prediction, Δλ (SSX 7), Δx (SSX 4) and the velocity update match. Differences: compliance is not divided by Δt²; the time step is the measured CPU time in ms, not Δt_frame / n in seconds; the driven centre particle should have zero inverse mass; the Jacobi solve needs a snapshot buffer; no damping; gravity sign is probably wrong; f32 precision suffers from the 0.5 z-shift baked into positions and from the f32 time accumulator.
- Padding: all struct layouts and buffer sizes are correct.
- Older issues still present: dispatch count, Uint16 check. New: one cloth corner is clipped, no depth buffer.
- Spelling: list of fixes for comments. Advice: one frame loop per Algorithm 1, GPU timing, shared WGSL prefix, bending constraints.

## 2026-10-07 — Check of the fixes, comment spelling

**Prompt:** Fix spelling in all comments yourself. Check my corrections and report only errors that remain or are new. Include the issues I left open on purpose (page freeze, simulated time step, damping, depth buffer) and explain how to choose `workgroup_size`.

**Reply:** Spelling in comments fixed in `main.js`, `compute.wgsl`, `render.wgsl`. Padding of the new structs is correct. Remaining or new errors:
- WGSL has no `**` operator (compile error).
- `predict` starts at zero and is updated with `+=` instead of being set from `position`.
- The neighbour loop overwrites `position`, so only the last correction survives.
- The centre particle velocity is still wrong; its phase lags by one substep.
- `WAVE_SPEED` is still in rad/ms, but `dtime` is now in seconds.
- `normalize(velocity)` gives NaN for zero velocity.
- The dispatch count is hard-coded to 64 workgroups.

Open issues were listed again. `workgroup_size`: use a multiple of 64 (64 is fine here). Tie the JS dispatch count and WGSL with an `override` constant.

## 2026-10-07 — One-step render loop with GPU timing

**Prompt:** Revert the render loop to the one-step scheme of commit d034650 (similar to advice #1). Change the time measurement as in advice #2. State objections before editing.

**Reply:** Objections raised first: the old `while` + `setTimeout` driver is not synced with the display, and a fixed `1/TARGET_FPS` step gives the wrong simulation speed on displays that are not 60 Hz. The user chose a `requestAnimationFrame` chain and a measured, clamped frame step. Done in `main.js`: one `frame()` encodes all substeps and the render pass; Δt_s = Δt_frame / n; the frame cost is measured with `onSubmittedWorkDone()`, and the substep count adapts to 80% of the frame budget. Also reported, not fixed: `GRID_SIZE` is never assigned; `shift` is a `let` but is reassigned; the centre velocity is still about 2× too large.

## 2026-10-07 — Why the centre velocity is 2× too large

**Prompt:** Explain in detail why the centre particle's velocity is about 2× too large.

**Reply:** Explanation only, no code changed. In one substep, the centre gets the analytic velocity A·S·cos φ. The two velocity-update terms then add the finite difference (z_new − z_old)/h ≈ A·S·cos φ on top of it, so the result is about 2·A·S·cos φ. Today this has no visible effect: `predict_x` overwrites the centre velocity in every substep, no other particle reads it, and the render normalizes it. It becomes a real error as soon as something reads the speed. Fix: remove the analytic velocity line.
