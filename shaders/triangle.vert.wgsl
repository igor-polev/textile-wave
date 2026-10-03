// Textile-Wave: vertex shader. Makes one triangle from the vertex index, no vertex buffers.
// AI impact: written by Claude, taken from the webgpu-samples helloTriangle sample.

@vertex
fn main(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(
    vec2(0.0, 0.5),
    vec2(-0.5, -0.5),
    vec2(0.5, -0.5)
  );
  return vec4f(pos[vertexIndex], 0.0, 1.0);
}
