// Textile-Wave: fragment shader. Paints every pixel red.
// AI impact: written by Claude, taken from the webgpu-samples helloTriangle sample.

@fragment
fn main() -> @location(0) vec4f {
  return vec4(1.0, 0.0, 0.0, 1.0);
}
