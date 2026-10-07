/*
  Textile-Wave project

  Author: Igor Polev, igor.polev@gmail.com

  Render shaders
*/

// Same struct declerations in both shader files:
// easy solution for the inclusion scheme absence
// Pain attention to sync them manually.

struct Particle {
  position : vec3f,
  mass_inv : f32,
  velocity : vec3f,
  padding  : f32
}

struct Parameters {
  // grid parameters
  grid_size     : f32,   // 0
  mesh_step     : f32,   // 1
  diag_step     : f32,   // 2
  vertex_count  : f32,   // 3
  idx_center    : f32,   // 4
  // initial wave parameters
  w_amplitude   : f32,   // 5
  w_speed       : f32,   // 6
  // physical parameters
  dtime         : f32,   // 7
  compliance    : f32,   // 8
  padding0      : f32,   // 9
  padding1      : f32,   // 10
  padding2      : f32,   // 11
  gravity_force : vec3f, // 12
  padding3      : f32,   // 15
  // visualization parameters
  z_shift       : vec3f, // 16
  padding4      : f32    // 19
}

@group(0) @binding(0)
var<storage, read> particles : array<Particle>;

@group(0) @binding(1)
var<uniform> prm : Parameters;

@group(0) @binding(2)
var<uniform> camRotation : mat3x3f;

struct VertexOut {
    @builtin(position) position : vec4f,
    @location(0)       color    : vec4f,
}

@vertex
fn vertex_main(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4f {
  return vec4f(camRotation * particles[idx].position, 1.0);
}

@fragment
fn fragment_main(@builtin(position) vec4f : pos) -> @location(0) vec4f {
  var color = pos;
  color[3] = 0;
  color = normalize(color);
  color[3] = 1;
  return color;
}
