/*
 * Textile-Wave: app entry point.
 * 
 * AI impact: initial skeleton written by Claude, based on the
 * webgpu-samples helloTriangle sample.
 * Human supervision: the skeleton was Ok.
 */

// === global parameers ========================================================

// Detalization of the textile square. The value MESH_SIZE will result
// in a (MESH_SIZE - 1) x (MESH_SIZE - 1) grid.
const MESH_SIZE = 51;

// Desired number of frames per second in the simulation
const TARGET_FPS = 60;

// Initial number of substeps per frame (will be adjusted)
const SUBSTEPS = 100;

// Parameters of driving wave z = A * sin (S * t)
const WAVE_AMPLITUDE = 0.1;    // A
const WAVE_SPEED     = 0.005; // S

const PARTICLE_MASS  = 1e-3;
const COMPLIANCE     = 0.1;

// To simulate viewer camera position we rotate all objects by rotation
// angles around X, Y, Z given in radians
// TODO: rework camera position simulation to avoid every frame rotation
const VIEW_ROTATION = [- Math.PI / 3, 0, - Math.PI / 3];

let params = new Float32Array([
  // === grid parameters ===
  MESH_SIZE,           //  : 0
  0, // mesh_step          : 1
  0, // diag_step          : 2
  0, // vertex_count       : 3
  0, // idx_center         : 4
  // === initial wave parameters ===
  WAVE_AMPLITUDE,       // : 5
  WAVE_SPEED,           // : 6
  // === physical parameters ===
  0, // dtime              : 7
  COMPLIANCE,           // : 8
  0, // padding0           : 9
  0, // padding1           : 10
  0, // padding2           : 11
  // gravity_force (vec3f)
  0,                    // : 12
  0,                    // : 13
  PARTICLE_MASS * 9.81, // : 14
  0, // padding3           : 15
  // === visualization parameters ===
  // z_shift (vec3f)
  0,                    // : 16
  0,                    // : 17
  0.5,                  // : 18
  0  // padding4           : 19
]);
const idxMeshStep    = 1,
      idxDiagStep    = 2,
      idxVertexCount = 3,
      idxIdxCenter   = 4,
      idxTime        = 7,
      idxDTime       = 8,
      idxGravity     = 14;

// === GPU memory allocation ===================================================

const [computeData, indexData] = initData();
const {context, device, format} = await initWGPU();
const {pplPredict, pplXPBD, pplRender} = await initShaders(device, format);

// vertex coordinates and velocity field
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
  size: 20 * 4, // 20x float32 parameters (with padding)
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

const computeBindGroup = device.createBindGroup({
  layout: pplXPBD.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: mainBuffer  } },
    { binding: 1, resource: { buffer: paramBuffer } }
  ]
});

const renderBindGroup = device.createBindGroup({
  layout: pplRender.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: mainBuffer   } },
    { binding: 1, resource: { buffer: paramBuffer  } },
    { binding: 2, resource: { buffer: cameraBuffer } }
  ]
});

// === render loop =============================================================

// draw first frame
const timeTheBeginning = performance.now();
requestAnimationFrame(render);
let timePerFrame = performance.now() - timeTheBeginning;
// compute one substep
let timePerComp = compute(timePerFrame);

const loopInterval = 1000 / TARGET_FPS;
while (true)
{
  let computeInterval = loopInterval - timePerFrame;
  while (computeInterval > timePerComp)
  {
    const timeActual = compute(timePerComp);
    timePerComp = 0.3 * timePerComp + 0.7 * timeActual;
    computeInterval -= timeActual;
  }
  const timeStart = performance.now();
  requestAnimationFrame(render);
  timePerFrame = 0.3 * timePerFrame + 0.7 * (performance.now() - timeStart);

  if (Math.floor((performance.now() - timeTheBeginning) % 2000) === 0) {
    console.log(`Average compute time: ${timePerComp .toFixed(3)}ms.`);
    console.log(`Average render  time: ${timePerFrame.toFixed(3)}ms.`);
  }
}

// === GPU pipelines ===========================================================

/**
 * @param {number} dTime
 */
function compute(dTime)
{
  const timeStart  = performance.now();
  params[idxDTime] = dTime;
  device.queue.writeBuffer(paramBuffer, 0, params);

  const encoder = device.createCommandEncoder();

  const passPredict = encoder.beginComputePass();
  passPredict.setPipeline(pplPredict);
  passPredict.setBindGroup(0, computeBindGroup);
  passPredict.dispatchWorkgroups(Math.ceil(computeData.length / 16));
  passPredict.end();

  const passXPBD = encoder.beginComputePass();
  passXPBD.setPipeline(pplXPBD);
  passXPBD.setBindGroup(0, computeBindGroup);
  passXPBD.dispatchWorkgroups(Math.ceil(computeData.length / 16));
  passXPBD.end();

  device.queue.submit([encoder.finish()]);
  return performance.now() - timeStart;
}

function render()
{
  const encoder = device.createCommandEncoder();

  const passRender = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: [0.3, 0.3, 0.3, 1],
      loadOp:  'clear',
      storeOp: 'store'
    }],
  });
  passRender.setPipeline(pplRender);
  passRender.setBindGroup(0, renderBindGroup);
  passRender.setIndexBuffer(indexBuffer, 'uint16');
  passRender.drawIndexed(indexData.length);
  passRender.end();

  device.queue.submit([encoder.finish()]);
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

  const canvas  = document.querySelector('canvas');
  const cnvSize = window.devicePixelRatio
    * Math.min(canvas.clientWidth, canvas.clientHeight);
  canvas.width  = cnvSize;
  canvas.height = cnvSize;

  const context = canvas.getContext('webgpu');
  const format  = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  return {context, device, format};
};

/**
 * @param {GPUDevice}        device 
 * @param {GPUTextureFormat} texFormat
 */
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
      entryPoint: 'predict_x'
    }
  });  const pplXPBD = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: computeModule,
      entryPoint: 'xpbd_main'
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
      topology: 'triangle-list'
    }
  });

  return {pplPredict, pplXPBD, pplRender};
}

// ATTENTION: initData reads and writes global variables
function initData()
{
  if (!Number.isInteger(MESH_SIZE) || MESH_SIZE <= 1)
    throw new Error(`prepareMesh : invalid value of the mesh size = ${MESH_SIZE}`);
  const sizeTooLarge = (MESH_SIZE - 1) * (MESH_SIZE - 1) * 6 > 0xFFFF; // limit for Uint16Array
  if (sizeTooLarge)
    throw new Error(`prepareMesh : requested mesh size (${MESH_SIZE}) is too large`);

  const vertices  = [];
  const triangles = [];

  const massInv  = 1.0 / PARTICLE_MASS;
  const meshStep = 0.8 / (MESH_SIZE - 1);
  let vertexIdx  = 0;
  let x = -0.4;
  for (let i = 0; i < MESH_SIZE; i++) {
    let y = -0.4;
    for (let j = 0; j < MESH_SIZE; j++) {
      vertices.push(
        x, y, 0.5,
        massInv,  // inversed mass
        0, 0, 0,  // undesturbed velocity field
        0         // padding
      );
      if (i < MESH_SIZE - 1 && j < MESH_SIZE - 1) {
        triangles.push(
          vertexIdx, vertexIdx + 1, vertexIdx + MESH_SIZE + 1,
          vertexIdx + MESH_SIZE + 1, vertexIdx + MESH_SIZE, vertexIdx
        ); // 4-byte alignment of Uint16Array is Ok
      }
      vertexIdx++;
      y += meshStep;
    }
    x += meshStep;
  }

  // setting global parameter values
  params[idxMeshStep]    = meshStep;
  params[idxDiagStep]    = meshStep * Math.sqrt(2);
  params[idxVertexCount] = vertexIdx;
  params[idxIdxCenter]   = Math.floor(vertexIdx * 0.5);

  return [
    new Float32Array(vertices),
    new Uint16Array(triangles)
  ];
}

/**
 * @param {number[]} angles 
 */
function prepareCamera(angles)
{
  // to avoid extra libs usage we make rotation matrix 'by hand'
  const sin_a = Math.sin(angles[0]), cos_a = Math.cos(angles[0]);
  const sin_b = Math.sin(angles[1]), cos_b = Math.cos(angles[1]);
  const sin_g = Math.sin(angles[2]), cos_g = Math.cos(angles[2]);

  // matrix is defined column-wise according to WebGPU
  const rotationXYZ = [
      cos_b * cos_g,
      sin_a * sin_b * cos_g + sin_g * cos_a,
      sin_a * sin_g - sin_b * cos_a * cos_g,
      0.0, // padding to fit mat3x3f format
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
