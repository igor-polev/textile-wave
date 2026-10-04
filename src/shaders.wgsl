// Textile-Wave: vertex shader. Makes one triangle from the vertex index, no vertex buffers.
// AI impact: written by Claude, taken from the webgpu-samples helloTriangle sample.

@group(0) @binding(0)
var<uniform> camRotation : mat3x3f;

struct VertexOut {
    @builtin(position) position : vec4f,
    @location(0)       color    : vec4f,
};

@vertex
fn vertex_main(@location(0) vertex : vec3f) -> VertexOut {
  var point = camRotation * vertex;
  point[2] += 0.5; // depth shift to fit WebGPU coordinate range
  var out : VertexOut;
  out.position = vec4f(point, 1.0);
  out.color    = vec4f(vertex[2] * 4 + 0.5, 0, 0, 1);
  return out;
};

@fragment
fn fragment_main(data : VertexOut) -> @location(0) vec4f {
  return data.color;
}
