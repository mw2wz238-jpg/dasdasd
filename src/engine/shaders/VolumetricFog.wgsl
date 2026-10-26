/**
 * ============================================================================
 * WOLUMETRYCZNA MGŁA I PROMIENIE ŚWIATŁA (WGSL COMPUTE SHADER)
 * ============================================================================
 * Oblicza gęstość rozproszenia światła wewnątrz wolumetrycznego bufora 3D.
 * Używa algorytmu Henyey-Greenstein dla realistycznego rozproszenia.
 */

struct ComputeUniforms {
  density: f32,
  anisotropy: f32,
  lightIntensity: f32,
  time: f32,
  resolution: vec3<u32>,
};

@group(0) @binding(0) var<uniform> uniforms: ComputeUniforms;
@group(0) @binding(1) var volumeTexture: texture_storage_3d<rgba16float, write>;

// Funkcja rozproszenia Henyey-Greensteina
fn henyeyGreenstein(cosTheta: f32, g: f32) -> f32 {
  let g2 = g * g;
  let denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * 3.14159 * pow(denom, 1.5));
}

@compute @workgroup_size(8, 8, 8)
fn compute_main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (any(id >= uniforms.resolution)) {
    return;
  }

  // Normalizacja współrzędnych [0, 1]
  let uvw = vec3<f32>(id) / vec3<f32>(uniforms.resolution);
  
  // Prosta turbulencja proceduralna dla gęstości mgły
  let noise = sin(uvw.x * 10.0 + uniforms.time) * cos(uvw.z * 10.0 + uniforms.time);
  let density = uniforms.density * (0.8 + 0.2 * noise);

  // Zapis do tekstury 3D
  textureStore(volumeTexture, id, vec4<f32>(vec3<f32>(density), 1.0));
}
