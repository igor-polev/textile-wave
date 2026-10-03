/*
 * Textile-Wave: app entry point. Sets up WebGPU and runs the render loop.
 * For now it only draws one triangle, like the WebGPU "Hello Triangle" sample.
 * AI impact: initial skeleton written by Claude, based on the
 * webgpu-samples helloTriangle sample.
 */

const canvas = document.querySelector('canvas');

const adapter = await navigator.gpu?.requestAdapter();
const device  = await adapter?.requestDevice();
if (!device) {
  document.body.textContent = 'WebGPU is not available in this browser.';
  throw new Error('WebGPU is not available.');
}

const context = canvas.getContext('webgpu');
canvas.width  = canvas.clientWidth  * window.devicePixelRatio;
canvas.height = canvas.clientHeight * window.devicePixelRatio;
const format  = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format });

// The paths are relative to index.html, not to this file.
const [vertexCode, fragmentCode] = await Promise.all([
  fetch('shaders/triangle.vert.wgsl').then((response) => response.text()),
  fetch('shaders/red.frag.wgsl')     .then((response) => response.text()),
]);

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: device.createShaderModule({ code: vertexCode }),
  },
  fragment: {
    module: device.createShaderModule({ code: fragmentCode }),
    targets: [{ format }],
  },
  primitive: {
    topology: 'triangle-list',
  },
});

function frame() {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 1],
      loadOp: 'clear',
      storeOp: 'store',
    }],
  });
  pass.setPipeline(pipeline);
  pass.draw(3);
  pass.end();
  device.queue.submit([encoder.finish()]);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
