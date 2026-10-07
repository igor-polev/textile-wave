/*
 * Textile-Wave project
 *
 * Author: Igor Polev, igor.polev@gmail.com
 * AI impact: spelling in comments fixed by Claude.
 * Human supervision: spelling autofix approved.
 *
 * Small Steps modification of the XPBD algorithm. See details in:
 * https://matthias-research.github.io/pages/publications/smallsteps.pdf
 * This paper is referenced below as _SSX_.
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

struct Parameters {
  // physical parameters
  dtime         : f32,   // 0
  padding0      : f32,   // 1
  padding1      : f32,   // 2
  padding2      : f32,   // 3
  gravity_force : vec3f, // 4
  padding3      : f32    // 7
}

override WG_SIZE    : u32 = 64u;
// mesh parameters
override GRID_SIZE  : u32 = 0u;
override MESH_STEP  : f32 = 0.0;
override DIAG_STEP  : f32 = 0.0;
override VERTEX_CNT : u32 = 0u;
override IDX_CENTER : u32 = 0u;
// initial wave parameters
override WAVE_AMP   : f32 = 0.0;
override WAVE_SP    : f32 = 0.0;
// physical parameters
override COMPLIANCE : f32 = 0.0;

@group(0) @binding(0)
var<storage, read_write> particles : array<Particle>;

@group(0) @binding(1)
var<uniform> prm : Parameters;

// NOTICE: These per-vertex calculations contain some vertex-independent
// values, so the same calculations repeat for each vertex. Consider this
// inefficiency a payment for the first release speed-up.
// TODO: Rework calculation pipeline to avoid this.

const PI2 : f32 = 6.28318530718;

@compute
@workgroup_size(WG_SIZE)
fn predict_x(@builtin(global_invocation_id) id : vec3u) {
  if (id.x >= arrayLength(&particles)) { return; }
  
  let idx : u32 = id.x;
  let position : vec3f = particles[idx].position;

  if (idx != IDX_CENTER) { // XPBD 'prediction' step _SSX_(3)
    particles[idx].predict   = position + prm.dtime * (particles[idx].velocity
      + prm.dtime * particles[idx].mass_inv * prm.gravity_force);
  } else { // predefined movement of the central vertex
    // particles[0].raw_data is reserved for the phase shift
    // (instead of the absolute time)
    var shift : f32 = particles[0].raw_data + WAVE_SP * prm.dtime;
    shift = shift % PI2; // to keep f32 precision
    particles[0].raw_data = shift;

    particles[idx].predict  = vec3f(0, 0, WAVE_AMP * sin(shift));
  }
  // second term of the velocity update, fits also the center vertex
  particles[idx].velocity -= position / prm.dtime;
}

@compute
@workgroup_size(WG_SIZE)
fn xpbd_main(@builtin(global_invocation_id) id : vec3u) {
  if (id.x >= arrayLength(&particles)) { return; }

  let idx_p : u32 = id.x;
  let p_predict  : vec3f = particles[idx_p].predict;
  let p_mass_inv : f32   = particles[idx_p].mass_inv;
  var delta_x : vec3f;

  // constraints loop = neighbours loop
  for (var i: i32 = -1; i <= 1; i++) {
    for (var j: i32 = -1; j <= 1; j++) {
      if (i == 0 && j == 0) { continue; }

      let idx_n : i32 = i32(idx_p) + i * i32(GRID_SIZE) + j;
      let col_n : i32 = i32(idx_p % GRID_SIZE) + j;
      if (idx_n < 0 || idx_n >= i32(VERTEX_CNT)
       || col_n < 0 || col_n >= i32(GRID_SIZE))
      {
        continue; // boundary vertex lacks some constraints
      }
      let idx_nu : u32 = u32(idx_n); // the neighbour unsigned index

      // edge length constraint : |v_i - v_j| - L = 0
      let edge : vec3f = p_predict - particles[idx_nu].predict;
      let edge_len : f32 = length(edge);
      var cnstr_value : f32 = edge_len;
      if (i == 0 || j == 0) {
        cnstr_value -= MESH_STEP;
      } else { // diagonal neighbour
        cnstr_value -= DIAG_STEP;
      }
      // for the edge constraint GRAD(C)*M^(-1)*GRAD(C)^T reduces to just
      // w_1 + w_2, where w_i is the inverse mass of the i-th vertex involved
      let lambda : f32 = - cnstr_value / (p_mass_inv + particles[idx_nu].mass_inv
        + COMPLIANCE / (prm.dtime * prm.dtime)); // _SSX_(7)
      // in this case GRAD(C) = edge / edge_len
      delta_x += (p_mass_inv * lambda / edge_len) * edge; // _SSX_(4)
      // TODO: investigate whether edge_len can be too close to zero
    }
  }

  particles[idx_p].position = p_predict + delta_x;
  // first term of the velocity update
  particles[idx_p].velocity += particles[idx_p].position / prm.dtime;

  /* demo wave animation used for debug -- leftover
  p.velocity.z =
    prm.amplitude * prm.speed *
    cos(prm.speed * prm.time + p.position.x * p.position.y * 80);
  p.position += p.velocity * prm.dtime;
  particles[id.x] = p;
  */
}
