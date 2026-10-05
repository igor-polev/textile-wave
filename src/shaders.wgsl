// Textile-Wave: all-in-one shaders set.
// AI impact: skeleton was written by Claude, taken from the webgpu-samples helloTriangle sample.
// Human supervision: skeleton was Ok, but almost nothing left here.

struct Particle {
  position : vec3f,
  padding0 : f32, // vec4f layout alignment
  velocity : vec3f,
  padding1 : f32,
}

@group(0) @binding(0)
var<storage, read_write> particles : array<Particle>;

@group(0) @binding(1)
var<uniform> camRotation : mat3x3f;

struct Parameters {
  time      : f32,
  amplitude : f32,
  speed     : f32,
  padding   : f32
}

@group(0) @binding(2)
var<uniform> prm : Parameters;

@compute
@workgroup_size(64)
fn compute_main(@builtin(global_invocation_id) id: vec3u) {
  // let total_vertices = arrayLength(&particles);
  // if (id.x >= total_vertices) { return; }
  var p = particles[id.x];
  p.velocity.z =
    prm.amplitude * prm.speed *
    cos(prm.speed * prm.time + p.position.x * p.position.y);
  p.position += p.velocity * prm.time;
  particles[id.x] = p;
}

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
  out.color    = vec4f(vertex[2] / prm.amplitude * 0.5 + 0.5, 0, 0, 1);
  return out;
}

@fragment
fn fragment_main(data : VertexOut) -> @location(0) vec4f {
  return data.color;
}
