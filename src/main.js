/*
 * Textile-Wave: app entry point.
 * 
 * AI impact: initial skeleton written by Claude, based on the webgpu-samples
 * helloTriangle sample. Spelling in comments fixed by Claude. Render loop
 * rewritten by Claude: restored the scheme of the previous commit, time
 * measurement reworked. Substep count limits added by Claude.
 *
 * Human supervision: the skeleton was OK, spelling autofix approved. The new 
 * version of the render loop and substep count limits has been inspected and
 * approved.
 */

// === global parameters =======================================================

// Level of detail of the textile square. The value MESH_SIZE will result
// in a (MESH_SIZE - 1) x (MESH_SIZE - 1) grid.
const MESH_SIZE   = 51;
// Absolute size of the square (in meters)
const SQUARE_SIZE = 0.7;

// Desired number of frames per second; sets the GPU time budget per frame
const TARGET_FPS = 60;

// Initial number of substeps per frame (adjusted to the GPU time budget)
// and its limits, tuned for 60 FPS: with fewer substeps the Jacobi solve
// diverges, with more of them f32 precision is not enough (_SSX_, section 7)
const SUBSTEPS     = 100;
const MIN_SUBSTEPS = 50;
const MAX_SUBSTEPS = 200;

// Parameters of the driving wave z = A * sin (S * t)
const WAVE_AMPLITUDE = 0.4; // A
const WAVE_SPEED     = 1.0; // S (rad/s)

const PARTICLE_MASS  = 5e-4;
const COMPLIANCE     = 0.08;
const GRAVITY_CONST  = 9.81;

// To simulate the viewer's camera position, we rotate all objects by
// the angles around X, Y, Z (in radians)
// TODO: rework the camera position simulation to avoid the per-frame rotation
const VIEW_ROTATION = [-Math.PI * 5/8, 0, - Math.PI * 1 / 16];

// shader override parameters
const WG_SIZE = 64;
let   MESH_STEP;
let   DIAG_STEP;
let   VERTEX_CNT;
let   IDX_CENTER;
let   WG_VERTEX_CNT;

let params = new Float32Array([
  0, // dtime               : 0
  0, // padding0            : 1
  0, // padding1            : 2
  0, // padding2            : 3
  // gravity_force (vec3f)
  0,                     // : 4
  0,                     // : 5
  0,                     // : 6
  0  // padding3            : 7
]);
const idxDTime   = 0,
      idxGravity = 6;

// === Environment setup =======================================================

const DEPTH_FORMAT = 'depth24plus';
let   depthTexture = null;

const [computeData, indexData]          = initData();
const {context, device, format, canvas} = await initWGPU();
const {pplPredict, pplXPBD, pplRender}  = await initShaders(device, format);

// === UI section ==============================================================

new ResizeObserver(() => {
  const dpr = window.devicePixelRatio || 1;
  const max = device.limits.maxTextureDimension2D;
  canvas.width  = Math.min(max, Math.max(1, Math.floor(canvas.clientWidth  * dpr)));
  canvas.height = Math.min(max, Math.max(1, Math.floor(canvas.clientHeight * dpr)));
  // the canvas stays square (see style.css), so no aspect correction is needed
}).observe(canvas);

const gravityBox = document.getElementById('gravity');
if (!(gravityBox instanceof HTMLInputElement))
  throw new Error('Checkbox #gravity not found');

gravityBox.addEventListener('change', () => {
  params[idxGravity] = gravityBox.checked ? -GRAVITY_CONST * PARTICLE_MASS : 0;
});

// === GPU memory allocation ===================================================

// vertex coordinates, inverse mass and velocity field
const mainBuffer = device.createBuffer({
  size:  computeData.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(mainBuffer, 0, computeData);

// mesh: triangle indices
const indexBuffer = device.createBuffer({
  size: indexData.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(indexBuffer, 0, indexData);

// camera rotation
const cameraBuffer = device.createBuffer({
  size: 4 * 3 * 4, // padded 4x3 matrix of float32
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(cameraBuffer, 0, prepareCamera(VIEW_ROTATION));

// per-frame parameters
const paramBuffer = device.createBuffer({
  size: params.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

const xpbdBindGroup = device.createBindGroup({
  layout: pplXPBD.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: mainBuffer  } },
    { binding: 1, resource: { buffer: paramBuffer } }
  ]
});
const predictBindGroup = device.createBindGroup({
  layout: pplPredict.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: mainBuffer  } },
    { binding: 1, resource: { buffer: paramBuffer } }
  ]
});
const renderBindGroup = device.createBindGroup({
  layout: pplRender.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: mainBuffer   } },
    { binding: 1, resource: { buffer: cameraBuffer } }
  ]
});

// === render loop =============================================================

// GPU time budget per frame, ms (the rest of the frame is left to the browser)
const FRAME_BUDGET = 0.8 * 1000 / TARGET_FPS;

let substeps       = SUBSTEPS;
let timePerSubstep = FRAME_BUDGET / SUBSTEPS;
let timePrevFrame  = null;

requestAnimationFrame(frame);

/**
 * @param {DOMHighResTimeStamp} timeNow
 */
function frame(timeNow)
{
  const timeStart = performance.now();

  // a long pause (e.g. a hidden tab) must not become one huge step
  const dtFrame = timePrevFrame === null
    ? 1000 / TARGET_FPS
    : Math.min(timeNow - timePrevFrame, 2000 / TARGET_FPS);
  timePrevFrame = timeNow;

  params[idxDTime] = dtFrame * 1e-3 / substeps; // seconds, _SSX_(6)
  device.queue.writeBuffer(paramBuffer, 0, params);

  const encoder = device.createCommandEncoder();

  const passCompute = encoder.beginComputePass();
  for (let s = 0; s < substeps; s++) {
    passCompute.setPipeline(pplPredict);
    passCompute.setBindGroup(0, predictBindGroup);
    passCompute.dispatchWorkgroups(WG_VERTEX_CNT);
    passCompute.setPipeline(pplXPBD);
    passCompute.setBindGroup(0, xpbdBindGroup);
    passCompute.dispatchWorkgroups(WG_VERTEX_CNT);
  }
  passCompute.end();

  ensureDepthTexture();
  const passRender = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: [0.3, 0.3, 0.3, 1],
      loadOp:  'clear',
      storeOp: 'store'
    }],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1.0,
      depthLoadOp:  'clear',
      depthStoreOp: 'store'
    }
  });
  passRender.setPipeline(pplRender);
  passRender.setBindGroup(0, renderBindGroup);
  passRender.setIndexBuffer(indexBuffer, 'uint16');
  passRender.drawIndexed(indexData.length);
  passRender.end();

  device.queue.submit([encoder.finish()]);

  // GPU work is asynchronous: the frame cost is known only when the queue
  // reports it done. The measured time also includes the CPU encoding above.
  const substepsUsed = substeps;
  device.queue.onSubmittedWorkDone().then(() => {
    const timeActual = (performance.now() - timeStart) / substepsUsed;
    timePerSubstep = 0.3 * timePerSubstep + 0.7 * timeActual;
    substeps = Math.min(MAX_SUBSTEPS,
      Math.max(MIN_SUBSTEPS, Math.floor(FRAME_BUDGET / timePerSubstep)));
  });

  requestAnimationFrame(frame);
}

// === init functions ==========================================================

async function initWGPU()
{
  const adapter = await navigator.gpu?.requestAdapter();
  const device  = await adapter?.requestDevice();
  if (!device) {
    document.body.textContent = 'WebGPU is not available in this browser.';
    throw new Error('WebGPU is not available.');
  }

  // TODO: reuse the code of ResizeObserver
  const canvas  = document.querySelector('canvas');
  const dpr = window.devicePixelRatio || 1;
  const max = device.limits.maxTextureDimension2D;
  canvas.width  = Math.min(max, Math.max(1, Math.floor(canvas.clientWidth  * dpr)));
  canvas.height = Math.min(max, Math.max(1, Math.floor(canvas.clientHeight * dpr)));

  const context = canvas.getContext('webgpu');
  const format  = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  return {context, device, format, canvas};
}

function ensureDepthTexture() {
  const w = canvas.width, h = canvas.height;
  if (depthTexture
   && depthTexture.width === w
   && depthTexture.height === h)
    return;
  depthTexture?.destroy();
  depthTexture = device.createTexture({
    label: 'depth',
    size: [w, h],
    format: DEPTH_FORMAT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

// ATTENTION: initData reads and writes global variables
function initData()
{
  if (!Number.isInteger(MESH_SIZE) || MESH_SIZE <= 1)
    throw new Error(`initData : invalid value of the mesh size = ${MESH_SIZE}`);
  if (MESH_SIZE ** 2 - 1 > 0xFFFF) // limit for uint16 value
    throw new Error(`initData : requested mesh size (${MESH_SIZE}) is too large`);

  const vertices  = [];
  const triangles = [];
  const massInv   = 1.0 / PARTICLE_MASS;
  const coordMin  = -0.5 * SQUARE_SIZE;
  const idxMax    = MESH_SIZE - 1;

  // set up global variables
  MESH_STEP  = SQUARE_SIZE / idxMax;
  DIAG_STEP  = MESH_STEP * Math.sqrt(2);
  IDX_CENTER = Math.floor(MESH_SIZE ** 2 * 0.5);
  if (MESH_SIZE % 2 === 0)
    IDX_CENTER += Math.floor(MESH_SIZE * 0.5);

  let vertexIdx   = 0;
  for (let i = 0; i < MESH_SIZE; i++) {
    for (let j = 0; j < MESH_SIZE; j++) {
      let vertexMassInv = massInv;
      // infinite mass at the corners and at the center of the mesh
      if (i === 0      && j === 0
       || i === idxMax && j === 0
       || i === 0      && j === idxMax
       || i === idxMax && j === idxMax
       || vertexIdx === IDX_CENTER)
      {
        vertexMassInv = 0;
      }
      vertices.push(
        coordMin + i * MESH_STEP,
        coordMin + j * MESH_STEP, 
        0,
        vertexMassInv, // inverse mass
        0, 0, 0,       // predicted position
        0,             // padding
        0, 0, 0,       // undisturbed velocity field
        0              // padding
      );
      if (i < idxMax && j < idxMax) {
        triangles.push(
          vertexIdx, vertexIdx + 1, vertexIdx + MESH_SIZE + 1,
          vertexIdx + MESH_SIZE + 1, vertexIdx + MESH_SIZE, vertexIdx
        ); // 4-byte alignment of Uint16Array is OK
      }
      vertexIdx++;
    }
  }
  // set up global variables
  VERTEX_CNT    = vertexIdx;
  WG_VERTEX_CNT = Math.ceil(VERTEX_CNT / WG_SIZE);

  return [
    new Float32Array(vertices),
    new Uint16Array(triangles)
  ];
}

/**
 * @param {GPUDevice}        device 
 * @param {GPUTextureFormat} texFormat
 */
// ATTENTION: initShaders reads global variables set by initData
async function initShaders(device, texFormat)
{
  const computeModule = device.createShaderModule({
    // the path is relative to index.html, not to this file
    code: await fetch('src/compute.wgsl')
      .then((response) => response.text())
  });
  const renderModule = device.createShaderModule({
    // the path is relative to index.html, not to this file
    code: await fetch('src/render.wgsl')
      .then((response) => response.text())
  });

  const pplPredict = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: computeModule,
      entryPoint: 'predict_x',
      constants: { // global constants
        "WG_SIZE"    : WG_SIZE,
        "IDX_CENTER" : IDX_CENTER,
        "WAVE_AMP"   : WAVE_AMPLITUDE,
        "WAVE_SP"    : WAVE_SPEED
      }
    }
  });
  const pplXPBD = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: computeModule,
      entryPoint: 'xpbd_main',
      constants: { // global constants
        "WG_SIZE"    : WG_SIZE,
        "GRID_SIZE"  : MESH_SIZE,
        "MESH_STEP"  : MESH_STEP,
        "DIAG_STEP"  : DIAG_STEP,
        "VERTEX_CNT" : VERTEX_CNT,
        "COMPLIANCE" : COMPLIANCE
      }
    }
  });
  const pplRender = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: renderModule,
      entryPoint: "vertex_main",
      buffers: []
    },
    fragment: {
      module: renderModule,
      entryPoint: "fragment_main",
      targets: [{format: texFormat}]
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none'
    },
    depthStencil: {
      format: DEPTH_FORMAT,
      depthWriteEnabled: true,
      depthCompare: 'less'
    }
  });

  return {pplPredict, pplXPBD, pplRender};
}

/**
 * @param {number[]} angles 
 */
function prepareCamera(angles)
{
  // to avoid extra libraries, we build the rotation matrix by hand
  const sin_a = Math.sin(angles[0]), cos_a = Math.cos(angles[0]);
  const sin_b = Math.sin(angles[1]), cos_b = Math.cos(angles[1]);
  const sin_g = Math.sin(angles[2]), cos_g = Math.cos(angles[2]);

  // the matrix is stored column-major, as WGSL expects
  const rotationXYZ = [
      cos_b * cos_g,
      sin_a * sin_b * cos_g + sin_g * cos_a,
      sin_a * sin_g - sin_b * cos_a * cos_g,
      0.0, // padding to fit the mat3x3f layout
    - sin_g * cos_b,
    - sin_a * sin_b * sin_g + cos_a * cos_g,
      sin_a * cos_g + sin_b * sin_g * cos_a,
      0.0, // padding
      sin_b,
    - sin_a * cos_b,
      cos_a * cos_b,
      0.0  // padding
  ]

  return new Float32Array(rotationXYZ);
}
