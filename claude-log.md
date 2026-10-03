# Claude usage log

## 2026-10-03 — Project skeleton

**Prompt:** Prepare the empty skeleton of the project. Keep the folder structure and the files that already exist. Use the WebGPU "Hello Triangle" sample (webgpu-samples) as a prototype.

**Reply:** Filled in the empty files from the Hello Triangle sample: the page with a full-window canvas, the styles, the entry script (WebGPU setup, render pipeline, render loop), and two WGSL shaders in `shaders/` (vertex: one triangle, fragment: red). The shaders are loaded with `fetch`, so the app must be served over HTTP.
