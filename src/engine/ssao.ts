import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * ============================================================================
 * SCREEN SPACE AMBIENT OCCLUSION (SSAO) - WGSL & AAA GRAPHICS PIPELINE
 * ============================================================================
 * Architektura: WebGPU Primary (WGSL Compute/Fragment Shader) + WebGL 2.0 Fallback.
 * Cechy potoku:
 * 1. Rekonstrukcja pozycji w Camera View Space z bufora głębi sprzętowej (Depth Buffer).
 * 2. Rekonstrukcja wektora normalnego powierzchni z gradientów ekranowych dFdx/dFdy.
 * 3. 32-punktowe stochastyczne próbkowanie półsferyczne z kwadratową dystrybucją wag.
 * 4. Kafelkowana tekstura szumu rotacyjnego 4x4 i baza ortonormalna TBN (Gram-Schmidt).
 * 5. Dynamiczny Range-Check zapobiegający krwawieniu cieni na odległych obiektach.
 * 6. Filtr dwuosiowy Edge-Preserving Bilateral Blur eliminujący szum stochastyczny.
 * 7. Modulacja cieni kontaktowych w rogach i na styku geometrii (Contact Shadows).
 * 8. Zero-GC w pętli renderowania: ponowne użycie macierzy, wektorów i render targetów.
 */

// ============================================================================
// 1. SHADER WGSL: Produkcyjny kod dla potoku WebGPU
// ============================================================================
export const WGSL_SSAO_SHADER = /* wgsl */ `
struct CameraUniforms {
  projectionMatrix: mat4x4<f32>,
  invProjectionMatrix: mat4x4<f32>,
  viewMatrix: mat4x4<f32>,
  resolution: vec2<f32>,
  near: f32,
  far: f32,
  radius: f32,
  bias: f32,
  intensity: f32,
  power: f32,
};

struct KernelData {
  samples: array<vec4<f32>, 32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> kernel: KernelData;
@group(0) @binding(2) var tDepth: texture_depth_2d;
@group(0) @binding(3) var tNoise: texture_2d<f32>;
@group(0) @binding(4) var sPoint: sampler;
@group(0) @binding(5) var sLinear: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

// Generowanie pełnoekranowego trójkąta (Full-screen quad bez bufora VBO)
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var out: VertexOutput;
  let x = f32(i32(vertexIndex & 1u) * 4 - 1);
  let y = f32(i32(vertexIndex & 2u) * 2 - 1);
  out.position = vec4<f32>(x, y, 0.0, 1.0);
  out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
  return out;
}

// Rekonstrukcja pozycji w przestrzeni widoku (View-Space Position) z bufora głębi
fn getViewPosition(uv: vec2<f32>, depth: f32) -> vec3<f32> {
  let clipSpace = vec4<f32>(
    uv.x * 2.0 - 1.0,
    (1.0 - uv.y) * 2.0 - 1.0,
    depth,
    1.0
  );
  var viewSpace = camera.invProjectionMatrix * clipSpace;
  return viewSpace.xyz / viewSpace.w;
}

// Rekonstrukcja wektora normalnego powierzchni z gradientów przestrzeni widoku
fn reconstructNormal(viewPos: vec3<f32>) -> vec3<f32> {
  let dPdx = dpdx(viewPos);
  let dPdy = dpdy(viewPos);
  return normalize(cross(dPdx, dPdy));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let depth = textureSampleLevel(tDepth, sPoint, in.uv, 0.0);
  
  // Pominięcie dalekiego tła / skyboxa
  if (depth >= 0.99999) {
    return vec4<f32>(1.0, 1.0, 1.0, 1.0);
  }

  let viewPos = getViewPosition(in.uv, depth);
  let normal = reconstructNormal(viewPos);

  // Odczyt szumu rotacyjnego z kafelkowanej tekstury 4x4
  let noiseScale = camera.resolution / vec2<f32>(4.0, 4.0);
  let noiseSample = textureSampleLevel(tNoise, sLinear, in.uv * noiseScale, 0.0).xyz * 2.0 - 1.0;
  let randomVec = normalize(vec3<f32>(noiseSample.xy, 0.0));

  // Konstrukcja lokalnej ortonormalnej bazy TBN (Gram-Schmidt process)
  let tangent = normalize(randomVec - normal * dot(randomVec, normal));
  let bitangent = cross(normal, tangent);
  let tbn = mat3x3<f32>(tangent, bitangent, normal);

  var occlusion = 0.0;
  let sampleCount = 32u;

  for (var i = 0u; i < sampleCount; i = i + 1u) {
    let sampleDir = tbn * kernel.samples[i].xyz;
    let samplePos = viewPos + sampleDir * camera.radius;

    var offset = camera.projectionMatrix * vec4<f32>(samplePos, 1.0);
    offset = offset / offset.w;
    let sampleUv = vec2<f32>(
      offset.x * 0.5 + 0.5,
      1.0 - (offset.y * 0.5 + 0.5)
    );

    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
      continue;
    }

    let sampleDepth = textureSampleLevel(tDepth, sPoint, sampleUv, 0.0);
    let sampleGeomPos = getViewPosition(sampleUv, sampleDepth);

    let rangeCheck = smoothstep(0.0, 1.0, camera.radius / abs(viewPos.z - sampleGeomPos.z));

    if (sampleGeomPos.z >= samplePos.z + camera.bias) {
      occlusion = occlusion + rangeCheck;
    }
  }

  let aoFactor = 1.0 - (occlusion / f32(sampleCount));
  let finalAo = clamp(pow(aoFactor, camera.power) * camera.intensity, 0.0, 1.0);

  return vec4<f32>(vec3<f32>(finalAo), 1.0);
}
`;

// ============================================================================
// 2. GENERATORY PÓŁSFERY I SZUMU
// ============================================================================

export function generateSsaoKernel(sampleCount: number = 32): Float32Array {
  const kernel = new Float32Array(sampleCount * 3);

  for (let i = 0; i < sampleCount; i++) {
    const x = Math.random() * 2.0 - 1.0;
    const y = Math.random() * 2.0 - 1.0;
    const z = Math.random(); // Półsfera zorientowana wzdłuż osi normalnej

    const vec = new THREE.Vector3(x, y, z).normalize();

    // Kwadratowa koncentracja próbek blisko powierzchni (contact shadows)
    let scale = i / sampleCount;
    scale = THREE.MathUtils.lerp(0.1, 1.0, scale * scale);
    vec.multiplyScalar(scale);

    kernel[i * 3 + 0] = vec.x;
    kernel[i * 3 + 1] = vec.y;
    kernel[i * 3 + 2] = vec.z;
  }

  return kernel;
}

export function generateNoiseTexture(): THREE.DataTexture {
  const size = 4;
  const data = new Float32Array(size * size * 4);

  for (let i = 0; i < size * size; i++) {
    const x = Math.random() * 2.0 - 1.0;
    const y = Math.random() * 2.0 - 1.0;
    const len = Math.hypot(x, y) || 1.0;

    data[i * 4 + 0] = x / len;
    data[i * 4 + 1] = y / len;
    data[i * 4 + 2] = 0.0;
    data[i * 4 + 3] = 1.0;
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

// ============================================================================
// 3. SHADERY THREE.JS POST-PROCESSINGU
// ============================================================================

export const SSAOShader = {
  name: 'SSAOShader',
  uniforms: {
    tDepth: { value: null as THREE.Texture | null },
    tNoise: { value: null as THREE.DataTexture | null },
    uKernel: { value: [] as THREE.Vector3[] },
    uKernelSize: { value: 32 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNoiseScale: { value: new THREE.Vector2(1, 1) },
    uRadius: { value: 0.85 },
    uBias: { value: 0.02 },
    uIntensity: { value: 1.6 },
    uPower: { value: 1.8 },
    uNear: { value: 0.1 },
    uFar: { value: 800.0 },
    projectionMatrix: { value: new THREE.Matrix4() },
    inverseProjectionMatrix: { value: new THREE.Matrix4() },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <common>
    varying vec2 vUv;

    uniform sampler2D tDepth;
    uniform sampler2D tNoise;
    uniform vec3 uKernel[32];
    uniform int uKernelSize;
    uniform vec2 uResolution;
    uniform vec2 uNoiseScale;
    uniform float uRadius;
    uniform float uBias;
    uniform float uIntensity;
    uniform float uPower;
    uniform float uNear;
    uniform float uFar;
    uniform mat4 projectionMatrix;
    uniform mat4 inverseProjectionMatrix;

    // Rekonstrukcja współrzędnych przestrzeni widoku z bufora głębi
    vec3 getViewPosition(const in vec2 screenPosition, const in float depth) {
      vec4 clip = vec4(screenPosition * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 view = inverseProjectionMatrix * clip;
      return view.xyz / view.w;
    }

    // Rekonstrukcja wektora normalnego z pochodnych dFdx/dFdy
    vec3 reconstructNormal(const in vec3 viewPos) {
      vec3 dPdx = dFdx(viewPos);
      vec3 dPdy = dFdy(viewPos);
      return normalize(cross(dPdx, dPdy));
    }

    void main() {
      float depth = texture2D(tDepth, vUv).r;

      // Pominięcie tła nieba
      if (depth >= 0.99999) {
        gl_FragColor = vec4(1.0);
        return;
      }

      vec3 viewPos = getViewPosition(vUv, depth);
      vec3 normal = reconstructNormal(viewPos);

      // Losowy wektor rotacji z tekstury szumu 4x4
      vec3 randomVec = normalize(texture2D(tNoise, vUv * uNoiseScale).xyz * 2.0 - 1.0);
      randomVec.z = 0.0;

      // Konstrukcja bazy TBN (Gram-Schmidt)
      vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
      vec3 bitangent = cross(normal, tangent);
      mat3 tbn = mat3(tangent, bitangent, normal);

      float occlusion = 0.0;
      int validSamples = 0;

      for (int i = 0; i < 32; i++) {
        if (i >= uKernelSize) break;

        vec3 sampleDir = tbn * uKernel[i];
        vec3 samplePos = viewPos + sampleDir * uRadius;

        vec4 offset = projectionMatrix * vec4(samplePos, 1.0);
        offset.xyz /= offset.w;
        vec2 sampleUv = offset.xy * 0.5 + 0.5;

        if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
          continue;
        }

        float sampleDepth = texture2D(tDepth, sampleUv).r;
        vec3 geomPos = getViewPosition(sampleUv, sampleDepth);

        // Range-Check: płynne tłumienie okluzji dla odległych fragmentów
        float rangeCheck = smoothstep(0.0, 1.0, uRadius / abs(viewPos.z - geomPos.z));

        // Test okluzji z zabezpieczeniem przed shadow acne
        if (geomPos.z >= samplePos.z + uBias) {
          occlusion += rangeCheck;
        }
        validSamples++;
      }

      float totalSamples = max(float(validSamples), 1.0);
      float ao = 1.0 - (occlusion / totalSamples);
      ao = clamp(pow(ao, uPower) * uIntensity, 0.0, 1.0);

      gl_FragColor = vec4(vec3(ao), 1.0);
    }
  `,
};

export const SSAOBlurShader = {
  name: 'SSAOBlurShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 800.0 },
    uDepthThreshold: { value: 0.012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uResolution;
    uniform float uDepthThreshold;

    void main() {
      vec2 texelSize = 1.0 / uResolution;
      float centerDepth = texture2D(tDepth, vUv).r;
      float result = 0.0;
      float weightSum = 0.0;

      // 4x4 Bilateral Edge-Preserving Blur
      for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
          vec2 offset = vec2(float(x), float(y)) * texelSize;
          vec2 sampleUv = vUv + offset;

          float sampleDepth = texture2D(tDepth, sampleUv).r;
          float ao = texture2D(tDiffuse, sampleUv).r;

          float depthDiff = abs(centerDepth - sampleDepth);
          float depthWeight = smoothstep(uDepthThreshold, 0.0, depthDiff);
          float spatialWeight = exp(-float(x * x + y * y) / 4.0);
          float weight = depthWeight * spatialWeight;

          result += ao * weight;
          weightSum += weight;
        }
      }

      float finalAo = (weightSum > 0.0001) ? (result / weightSum) : texture2D(tDiffuse, vUv).r;
      gl_FragColor = vec4(vec3(finalAo), 1.0);
    }
  `,
};

export const SSAOCompositeShader = {
  name: 'SSAOCompositeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tSSAO: { value: null as THREE.Texture | null },
    uEnabled: { value: 1.0 },
    uAmbientStrength: { value: 0.85 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tSSAO;
    uniform float uEnabled;
    uniform float uAmbientStrength;

    void main() {
      vec4 sceneColor = texture2D(tDiffuse, vUv);

      if (uEnabled > 0.5) {
        float ao = texture2D(tSSAO, vUv).r;
        float occlusionMod = mix(1.0, ao, uAmbientStrength);
        sceneColor.rgb *= occlusionMod;
      }

      gl_FragColor = sceneColor;
    }
  `,
};

// ============================================================================
// 4. KLASA SSAOPostProcessPass (INTEGRACJA Z THREE.JS EFFECT COMPOSER)
// ============================================================================

export class SSAOPostProcessPass extends Pass {
  public depthTexture: THREE.DepthTexture | null = null;
  public camera: THREE.PerspectiveCamera;
  public radius: number = 0.85;
  public intensity: number = 1.6;
  public ambientStrength: number = 0.85;

  private noiseTexture: THREE.DataTexture;
  private ssaoRenderTarget: THREE.WebGLRenderTarget;
  private blurRenderTarget: THREE.WebGLRenderTarget;

  private ssaoMaterial: THREE.ShaderMaterial;
  private blurMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;

  private fsQuad: FullScreenQuad;
  private kernelVectors: THREE.Vector3[] = [];

  constructor(
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    depthTexture: THREE.DepthTexture | null = null
  ) {
    super();

    this.camera = camera;
    this.depthTexture = depthTexture;
    this.needsSwap = true;

    // Szum rotacyjny 4x4
    this.noiseTexture = generateNoiseTexture();

    // Wektory próbkowania półsferycznego
    const rawKernel = generateSsaoKernel(32);
    for (let i = 0; i < 32; i++) {
      this.kernelVectors.push(
        new THREE.Vector3(
          rawKernel[i * 3 + 0],
          rawKernel[i * 3 + 1],
          rawKernel[i * 3 + 2]
        )
      );
    }

    // Bufory pośrednie dla SSAO i Bilateral Blur
    this.ssaoRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      stencilBuffer: false,
    });

    this.blurRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      stencilBuffer: false,
    });

    // Materiały shaderów
    this.ssaoMaterial = new THREE.ShaderMaterial({
      name: SSAOShader.name,
      vertexShader: SSAOShader.vertexShader,
      fragmentShader: SSAOShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(SSAOShader.uniforms),
      depthTest: false,
      depthWrite: false,
    });

    this.ssaoMaterial.uniforms.tDepth.value = this.depthTexture;
    this.ssaoMaterial.uniforms.tNoise.value = this.noiseTexture;
    this.ssaoMaterial.uniforms.uKernel.value = this.kernelVectors;
    this.ssaoMaterial.uniforms.uResolution.value.set(width, height);
    this.ssaoMaterial.uniforms.uNoiseScale.value.set(width / 4, height / 4);
    this.ssaoMaterial.uniforms.uNear.value = camera.near;
    this.ssaoMaterial.uniforms.uFar.value = camera.far;
    this.ssaoMaterial.uniforms.uRadius.value = this.radius;
    this.ssaoMaterial.uniforms.uIntensity.value = this.intensity;

    this.blurMaterial = new THREE.ShaderMaterial({
      name: SSAOBlurShader.name,
      vertexShader: SSAOBlurShader.vertexShader,
      fragmentShader: SSAOBlurShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(SSAOBlurShader.uniforms),
      depthTest: false,
      depthWrite: false,
    });

    this.blurMaterial.uniforms.tDepth.value = this.depthTexture;
    this.blurMaterial.uniforms.tDiffuse.value = this.ssaoRenderTarget.texture;
    this.blurMaterial.uniforms.uResolution.value.set(width, height);
    this.blurMaterial.uniforms.uNear.value = camera.near;
    this.blurMaterial.uniforms.uFar.value = camera.far;

    this.compositeMaterial = new THREE.ShaderMaterial({
      name: SSAOCompositeShader.name,
      vertexShader: SSAOCompositeShader.vertexShader,
      fragmentShader: SSAOCompositeShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(SSAOCompositeShader.uniforms),
      depthTest: false,
      depthWrite: false,
    });

    this.fsQuad = new FullScreenQuad(this.ssaoMaterial);
  }

  public render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ) {
    if (!this.enabled) {
      if (this.renderToScreen) {
        this.fsQuad.material = this.compositeMaterial;
        this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
        this.compositeMaterial.uniforms.uEnabled.value = 0.0;
        this.fsQuad.render(renderer);
      }
      return;
    }

    // Użyj depthTexture z bufora kompozytora jeśli nie została wcześniej jawnie podana
    const activeDepth = this.depthTexture || readBuffer.depthTexture;
    if (!activeDepth) {
      return;
    }

    // Aktualizacja macierzy kamery
    this.ssaoMaterial.uniforms.tDepth.value = activeDepth;
    this.ssaoMaterial.uniforms.projectionMatrix.value.copy(this.camera.projectionMatrix);
    this.ssaoMaterial.uniforms.inverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    this.ssaoMaterial.uniforms.uRadius.value = this.radius;
    this.ssaoMaterial.uniforms.uIntensity.value = this.intensity;

    this.blurMaterial.uniforms.tDepth.value = activeDepth;

    // 1. Krok: Wyliczenie SSAO do ssaoRenderTarget
    this.fsQuad.material = this.ssaoMaterial;
    renderer.setRenderTarget(this.ssaoRenderTarget);
    this.fsQuad.render(renderer);

    // 2. Krok: Edge-Preserving Bilateral Blur do blurRenderTarget
    this.fsQuad.material = this.blurMaterial;
    this.blurMaterial.uniforms.tDiffuse.value = this.ssaoRenderTarget.texture;
    renderer.setRenderTarget(this.blurRenderTarget);
    this.fsQuad.render(renderer);

    // 3. Krok: Złożenie z kanałem koloru sceny do writeBuffer lub ekranu
    this.fsQuad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tSSAO.value = this.blurRenderTarget.texture;
    this.compositeMaterial.uniforms.uEnabled.value = 1.0;
    this.compositeMaterial.uniforms.uAmbientStrength.value = this.ambientStrength;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      this.fsQuad.render(renderer);
    }
  }

  public setSize(width: number, height: number) {
    this.ssaoRenderTarget.setSize(width, height);
    this.blurRenderTarget.setSize(width, height);

    this.ssaoMaterial.uniforms.uResolution.value.set(width, height);
    this.ssaoMaterial.uniforms.uNoiseScale.value.set(width / 4, height / 4);
    this.blurMaterial.uniforms.uResolution.value.set(width, height);
  }

  public dispose() {
    this.noiseTexture.dispose();
    this.ssaoRenderTarget.dispose();
    this.blurRenderTarget.dispose();
    this.ssaoMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.fsQuad.dispose();
  }
}
