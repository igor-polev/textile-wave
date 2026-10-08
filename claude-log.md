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

## 2026-10-07 — Full review, second round

**Prompt:** Do the full code review again. The only open issue should be "No damping"; report it together with all other results.

**Reply:** Review only, no code changed. Checked with a CPU copy of the shader logic (numpy, f32 and f64).
- Correction of my own earlier review: `velocity -= position / dtime` keeps the old velocity, so the velocity becomes (x_n − x_0)/h and the displacement doubles every substep; the simulation explodes. I had called this update correct in the first review. Fix: `=` instead of `-=`.
- `DEPTH_FORMAT` is used by `initShaders` before its `const` line runs (ReferenceError).
- The adaptive substep count needs limits: above about 200 substeps (at 60 FPS) f32 results go wrong (SSX §7); at 1–2 substeps the plain Jacobi sum explodes.
- An even `MESH_SIZE` puts `IDX_CENTER` on the mesh edge.
- The canvas is no longer square, so the image is stretched.
- No damping (SSX §4.1); constraint damping needs a snapshot of the old positions.
- Padding is correct. Minor items, wording fixes, and earlier advice not yet applied were listed.

## 2026-10-07 — Substep limits, square canvas, spelling

**Prompt:** Check the fixes of errors 1 and 2. Add the [MIN_SUBSTEPS, MAX_SUBSTEPS] guard. An even MESH_SIZE was checked and found harmless; other driving vertices are interesting too (say if you disagree). Make the canvas a rigid 1:1 square, also on window resize. Fix new spelling errors.

**Reply:** Both fixes are correct. Added `MIN_SUBSTEPS = 10` and `MAX_SUBSTEPS = 200` and clamp the adapted substep count to them. The canvas is now the largest centered square that fits the window, done in CSS, so the existing ResizeObserver keeps it square on resize. Spelling fixed in `main.js` and `compute.wgsl`. Position on even MESH_SIZE: other driving vertices are fine, but the shader sets the driver's x and y to (0, 0), so for an even size an edge vertex is pulled 0.4 into the centre. Proposed a one-line fix that keeps the vertex's own x and y; not applied.

## 2026-10-08 — Check of the even MESH_SIZE fix

**Prompt:** I agree with the arguments about even MESH_SIZE. Check my fix.

**Reply:** Review only, no code changed. The JS fix is correct: for an even size it now picks vertex (N/2, N/2), one of the four vertices next to the centre, and the odd case is unchanged. It is only half of the fix: the shader still puts the driver at x = y = 0, half a diagonal step away from its real place, which leaves springs around it stretched or compressed by about 30–58%. The one-line shader change (keep `position.xy`) completes it. Minor: missing semicolon.

## 2026-10-08 — The `#ui` styles seem not to work

**Prompt:** The `#ui {}` CSS section seems not to work: the gravity checkbox is in the top-left corner, small and poor-looking.

**Reply:** Explanation only, no code changed. The CSS is valid and probably applied: top-left at 12px is what it asks for. The panel background is semi-transparent black on the black page, so it is invisible, and 14px text with a default-size checkbox looks small. Gave a way to check in DevTools and a CSS snippet with a visible panel, larger text and a larger checkbox.

## 2026-10-08 — README rework

**Prompt:** Rework my README.md.

**Reply:** Rewrote `README.md` from the draft. It keeps the author's content and fixes the spelling. Filled in the empty Usage and Dependencies sections, expanded the implementation details to match the current code, and added a project structure table and a license note.
