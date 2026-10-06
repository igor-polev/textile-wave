/*
  Textile-Wave project

  Author: Igor Polev, igor.polev@gmail.com

  Compute shader
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
var<storage, read_write> particles : array<Particle>;

@group(0) @binding(1)
var<uniform> prm : Parameters;

@compute
@workgroup_size(8)
fn compute_main(@builtin(global_invocation_id) id: vec3u) {
  let total_vertices = arrayLength(&particles);
  if (id.x >= total_vertices) { return; }
  
  var p = particles[id.x];
  p.velocity.z =
    prm.amplitude * prm.speed *
    cos(prm.speed * prm.time + p.position.x * p.position.y * 80);
  p.position += p.velocity * prm.dtime;
  particles[id.x] = p;
  
}
