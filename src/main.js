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
const TARGET_FPS = 100;

// Parameters of demo wave z = A * sin (S * t)
const WAVE_AMPLITUDE = 0.1;    // A
const WAVE_SPEED     = 0.005; // S

// To simulate viewer camera position we rotate all objects by rotation
// angles around X, Y, Z given in radians
// TODO: rework camera position simulation to avoid every frame rotation
const VIEW_ROTATION = [- Math.PI / 3, 0, - Math.PI / 3];

// per-frame parameters
let params = new Float32Array([
  0, // time
  0, // d-time
  WAVE_AMPLITUDE,
  WAVE_SPEED
]);
const idxTime = 0, idxDTime = 1, idxAmp = 2, idxSpeed = 3;

// === GPU memory allocation ===================================================

const [computeData, indexData]  =       initData(MESH_SIZE);
const {context, device, format} = await initWGPU();
const {pplCompute, pplRender}   = await initShaders(device, format);

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
  size: 4 * 4, // 4x float32 parameters
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

const computeBindGroup = device.createBindGroup({
  layout: pplCompute.getBindGroupLayout(0),
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

const renderInterval   = 1000 / TARGET_FPS;
const timeTheBeginning = performance.now();
while (true)
{
  const timeStart    = performance.now();
  params[idxTime]    = timeStart - timeTheBeginning;
  params[idxDTime]  += timeStart;
  device.queue.writeBuffer(paramBuffer, 0, params);
  requestAnimationFrame(frame);
  params[idxDTime]   = - timeStart;
  const timePerFrame = performance.now() - timeStart;

  if (timePerFrame > renderInterval)
    console.warn(`frame took ${timePerFrame} ms, expected ${renderInterval} ms`);
  else
    await new Promise(resolve => setTimeout(resolve, renderInterval - timePerFrame));
}

function frame()
{
  const encoder = device.createCommandEncoder();

  const passCompute = encoder.beginComputePass();
  passCompute.setPipeline(pplCompute);
  passCompute.setBindGroup(0, computeBindGroup);
  passCompute.dispatchWorkgroups(Math.ceil(computeData.length / 8));
  passCompute.end();

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

  const pplCompute = device.createComputePipeline({
    layout: 'auto', // must match pplRender
    compute: {
      module: computeModule,
      entryPoint: 'compute_main'    
    }
  });
  const pplRender = device.createRenderPipeline({
    layout: 'auto', // must match pplCompute
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

  return {pplCompute, pplRender};
}

/**
 * @param {number} size -- size of the mesh
 */
function initData(size)
{
  if (!Number.isInteger(size) || size <= 1)
    throw new Error(`prepareMesh : invalid value of the mesh size = ${size}`);
  const sizeTooLarge = (size - 1) * (size - 1) * 6 > 0xFFFF; // limit for Uint16Array
  if (sizeTooLarge)
    throw new Error(`prepareMesh : requested mesh size (${size}) is too large`);

  const vertices  = [];
  const triangles = [];

  const meshStep  = 0.8 / (size - 1);
  let vertexIdx = 0;
  let x = -0.4;
  for (let i = 0; i < size; i++) {
    let y = -0.4;
    for (let j = 0; j < size; j++) {
      vertices.push(
        x, y, params[idxAmp] * Math.sin(x * y * 80), // wave at t = 0
        0,       // padding
        0, 0, 0, // undesturbed velocity field
        0        // padding
      );
      if (i < size - 1 && j < size - 1) {
        triangles.push(
          vertexIdx, vertexIdx + 1, vertexIdx + size + 1,
          vertexIdx + size + 1, vertexIdx + size, vertexIdx
        ); // 4-byte alignment of Uint16Array is Ok
      }
      vertexIdx++;
      y += meshStep;
    }
    x += meshStep;
  }

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
