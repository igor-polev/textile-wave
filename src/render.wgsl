/*
  Textile-Wave project

  Author: Igor Polev, igor.polev@gmail.com
  AI impact: spelling in comments fixed by Claude.

  Render shaders
*/

// Same struct declarations in both shader files:
// a simple workaround, because WGSL has no #include.
// Pay attention to sync them manually.

struct Particle {
  position : vec3f,
  mass_inv : f32,
  predict  : vec3f,
  padding  : f32,
  velocity : vec3f,
  raw_data : f32 // can be used to store data between calls
}

@group(0) @binding(0)
var<storage, read> particles : array<Particle>;

@group(0) @binding(1)
var<uniform> camRotation : mat3x3f;

struct VertexOut {
    @builtin(position) position : vec4f,
    @location(0)       color    : vec4f,
};

@vertex
fn vertex_main(@builtin(vertex_index) idx : u32) -> VertexOut {
  var view : vec3f = camRotation * particles[idx].position;
  view[2] += 0.5; // the shift is needed to fit the WebGPU depth range [0, 1]
                  // TODO: evaluate the shift properly 
  var out : VertexOut;
  out.position = vec4f(view, 1);
  out.color    = vec4f(view[2], 0, 0, 1);

  return out;
}

@fragment
fn fragment_main(vertex_data : VertexOut) -> @location(0) vec4f {
  return vertex_data.color;
}
