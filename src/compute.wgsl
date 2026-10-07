/*
  Textile-Wave project

  Author: Igor Polev, igor.polev@gmail.com

  Small Steps modification of XPBD algorithm. See details in:
  https://matthias-research.github.io/pages/publications/smallsteps.pdf
  This paper is referenced below as _SSX_.
*/

// Same struct declerations in both shader files:
// easy solution for the inclusion scheme absence.
// Pain attention to sync them manually.

struct Particle {
  position : vec3f,
  mass_inv : f32,
  velocity : vec3f,
  raw_data : f32 // can be used to store data between calls
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
var<storage, read_write> particles : array<Particle>;

@group(0) @binding(1)
var<uniform> prm : Parameters;

// NOTICE: This per-vertex calculations contains some vertex-independent
// values, which means same calulations for each vertex. Consider this
// inefficiency a payment for the first release speed-up.
// TODO: Rework calculation pipeline to avoid this.

@compute
@workgroup_size(16)
fn predict_x(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&particles)) { return; }
  
  let idx : u32 = id.x;
  let p : Particle = particles[idx];

  if (idx != prm.idx_center) { // XPBD 'prediction' step _SSX_(3)
    particles[idx].position += prm.dtime * (p.velocity + prm.dtime * p.massInv * prm.gravity_force);
    particles[idx].velocity -= p.position / prm.dtime; // second term of velocity update
  } else { // predefined movement of central vertex
    // particles[0].raw_data reserved for abs_time
    let drift : f32 = prm.w_speed * particles[0].raw_data;
    // z_shift is required to fit WebGPU depth coordinate range
    particles[idx].position = vec3f(0, 0, prm.w_amplitude * sin(drift)) + prm.z_shift;
    particles[idx].velocity = vec3f(0, 0, prm.w_amplitude * prm.w_speed * cos(drift));
    particles[0].raw_data += prm.dtime; // abs_time update
  }
}

@compute
@workgroup_size(16)
fn xpbd_main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&particles)) { return; }

  let idx : u32 = id.x;
  let p : Particle  = particles[idx];

  // constraints loop = neighbours loop
  for (var i: i32 = -1; i <= 1; i++) {
    for (var j: i32 = -1; j <= 1; j++) {
      if (i == 0 && j == 0) { continue; }

      let idx_s : i32 = i32(idx) + i * i32(prm.grid_size) + j;
      if (idx_s < 0 || idx_s >= i32(prm.vertex_count)) {
        continue; // boundary vertex lacks some constraints
      }
      let n : Particle = particles[u32(idx_s)]; // the neighbour

      // edge size constraint : |v_i - v_j| - L = 0
      let edge     : vec3f = p.position - n.position;
      let edge_len : f32   = length(edge);
      var cnstr_value : f32 = edge_len;
      if (i == 0 || j == 0) {
        cnstr_value -= prm.mesh_step;
      } else { // diagonal neighbour
        cnstr_value -= prm.diag_step;
      }
      // for the edge constraint GRAD(C)*M^(-1)*GRAD(C)^T reduces to just
      // m_1 + m_2 where m_i is an inversed mass of i-th vertex involved
      let lambda = - cnstr_value / (p.mass_inv + n.mass_inv + prm.compliance); // _SSX_(7)
      // for this case GRAD(C) = edge / edge_len
      particles[idx].position += (p.mass_inv * lambda / edge_len) * edge;      // _SSX_(4)
    }
  }

  // first term of velocity update
  particles[idx].velocity += particles[idx].position / prm.dtime;

  /* demo wave animation used for debug -- rudimentary
  p.velocity.z =
    prm.amplitude * prm.speed *
    cos(prm.speed * prm.time + p.position.x * p.position.y * 80);
  p.position += p.velocity * prm.dtime;
  particles[id.x] = p;
  */
}
