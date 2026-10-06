/*
  Textile-Wave project

  Author: Igor Polev, igor.polev@gmail.com

  Render shaders
*/

// Same struct declerations in both shader files:
// easy solution for the inclusion scheme absence

struct Particle {
  position : vec3f,
  padding0 : f32, // vec4f layout alignment
  velocity : vec3f,
  padding1 : f32,
}

struct Parameters {
  time      : f32,
  dtime     : f32,
  amplitude : f32,
  speed     : f32
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
fn vertex_main(@builtin(vertex_index) idx: u32) -> VertexOut {
  let vertex = particles[idx].position;

  var point  = camRotation * vertex;
  point[2]  += 0.5; // fixed depth shift to fit WebGPU coordinate range
                    // TODO: evaluate the shift correctly

  var out : VertexOut;
  out.position = vec4f(point, 1.0);
  out.color    = vec4f(
    vertex[2] / prm.amplitude * 0.5 + 0.5,
    0,
    particles[idx].velocity.z / prm.amplitude / prm.speed * 0.5 + 0.5,
    1
  );
  return out;
}

@fragment
fn fragment_main(data : VertexOut) -> @location(0) vec4f {
  return data.color;
}
