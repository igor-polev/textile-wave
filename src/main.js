/*
 * Textile-Wave: app entry point.
 * 
 * AI impact: initial skeleton written by Claude, based on the
 * webgpu-samples helloTriangle sample.
 * Human supervision: the skeleton was Ok.
 */

// === global parameers ========================================================

const MESH_SIZE = 100; // this will result in MESH_SIZE x MESH_SIZE grid
// to simulate viewer camera position we rotate all objects
const VIEW_ROTATION = [Math.PI / 3, 0, - Math.PI / 3];  // rotations angles around X, Y, Z (rad)

// === 3D objects definition ===================================================

const [vertexData, indexData] = prepareMesh(MESH_SIZE);
const camRotationData         = prepareCamera(VIEW_ROTATION);

// === render section ==========================================================

const {context, device, format} = await initWGPU();
const pipeline                  = await initShaders(device, format);

const vertexBuffer = device.createBuffer({
  size:  vertexData.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, 0, vertexData);

const indexBuffer = device.createBuffer({
  size: indexData.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(indexBuffer, 0, indexData);

const camBuffer = device.createBuffer({
  size: camRotationData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});
const camBindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: camBuffer } }],
});
device.queue.writeBuffer(camBuffer, 0, camRotationData);

requestAnimationFrame(frame); // start render loop

function frame()
{
  const encoder = device.createCommandEncoder();
  const pass    = encoder.beginRenderPass({
    colorAttachments: [{
      view:       context.getCurrentTexture().createView(),
      clearValue: [0.3, 0.3, 0.3, 1],
      loadOp:     'clear',
      storeOp:    'store',
    }],
  });
  pass.setPipeline(pipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.setIndexBuffer(indexBuffer, 'uint16');
  pass.setBindGroup(0, camBindGroup);
  pass.drawIndexed(indexData.length);
  pass.end();
  device.queue.submit([encoder.finish()]);

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

async function initShaders(device, texFormat)
{
  const shadersModule = device.createShaderModule({
    // the path is relative to index.html, not to this file
    code: await fetch('src/shaders.wgsl')
      .then((response) => response.text())
  });
  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shadersModule,
      entryPoint: "vertex_main",
      buffers: [{
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
          }
        ],
        arrayStride: 12,
        stepMode: 'vertex'
      }]
    },
    fragment: {
      module: shadersModule,
      entryPoint: "fragment_main",
      targets: [{format: texFormat}]
    },
    primitive: {
      topology: 'triangle-list'
    },
    /*depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    }*/
  });
}

// === objects definition functions ============================================

function prepareMesh(size)
{
  if (!Number.isInteger(size) || size <= 1)
    throw new Error(`prepareMesh : invalid value of the mesh size = ${size}`);
  const sizeTooLarge = (size - 1) * (size - 1) * 6 > 0xFFFF; // limit for Uint16Array
  if (sizeTooLarge)
    throw new Error(`prepareMesh : requested mesh size (${size}) is too large`);

  const vertices  = [];
  const triangles = [];

  const meshStep  = 1.0 / (size - 1);
  let vertexIdx = 0;
  let x = -0.5;
  for (let i = 0; i < size; i++) {
    let y = -0.5;
    for (let j = 0; j < size; j++) {
      vertices.push(x, y, Math.sin(x * y / 0.05 * Math.PI) * 0.0625); // sine is for test visualization
      if (i < size - 1 && j < size - 1) {
        triangles.push(
          vertexIdx, vertexIdx + 1, vertexIdx + size + 1,
          vertexIdx + size + 1, vertexIdx + size, vertexIdx
        ); // 4-byte alignment is Ok
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
