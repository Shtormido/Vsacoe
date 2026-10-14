import * as THREE from 'three';

/**
 * Мех из «оболочек» (shell fur): одна и та же поверхность рисуется N раз,
 * каждый слой сдвинут вдоль нормали; фрагментный шейдер вырезает «волоски»
 * по 3D-шуму. Состояние шерсти хранится в атрибутах вершин и меняется
 * инструментами в реальном времени:
 *   aState  = (длина, грязь, колтуны, шампунь)
 *   aState2 = (влажность, целевая длина или -1, 0, 0)
 *   color   = (маска вторичного цвета, маска тёмного цвета, рост шерсти)
 */

const vertex = /* glsl */ `
  attribute vec4 aState;
  attribute vec2 aState2;
  attribute float aShell;

  uniform float uFurMax;
  uniform float uDroop;
  uniform vec3 uDown;
  uniform float uTime;
  uniform float uShake;

  varying vec3 vBase;
  varying vec3 vMasks;
  varying vec4 vState;
  varying vec2 vState2;
  varying float vH;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    float h = aShell;
    float growth = color.b;
    float len = clamp(aState.x, 0.0, 1.2) * growth;
    float wet = aState2.x;
    float mats = aState.z;
    float furLen = uFurMax * len * (1.0 - 0.5 * wet) * (1.0 - 0.25 * mats);
    vec3 p = position + normal * furLen * h;
    // провисание под собственным весом (сильнее у мокрой и длинной шерсти)
    p += uDown * furLen * h * h * (uDroop + wet * 0.8);
    // лёгкое колыхание
    p += normal * sin(uTime * 3.0 + position.x * 40.0 + position.y * 30.0) * 0.0008 * h * len;
    p += vec3(sin(uTime * 41.0), 0.0, cos(uTime * 37.0)) * uShake * 0.004 * h;

    vBase = position;
    vMasks = color.rgb;
    vState = aState;
    vState2 = aState2;
    vH = h;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColC;
  uniform vec3 uSkin;
  uniform float uDensity;
  uniform float uCurl;
  uniform float uThick;
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uSky;
  uniform vec3 uGround;
  uniform float uGuide;
  uniform vec3 uCursor;
  uniform float uCursorR;
  uniform vec3 uCursorColor;
  uniform float uTime;
  uniform float uSparkle;

  varying vec3 vBase;
  varying vec3 vMasks;
  varying vec4 vState;
  varying vec2 vState2;
  varying float vH;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i), n100 = hash13(i + vec3(1,0,0));
    float n010 = hash13(i + vec3(0,1,0)), n110 = hash13(i + vec3(1,1,0));
    float n001 = hash13(i + vec3(0,0,1)), n101 = hash13(i + vec3(1,0,1));
    float n011 = hash13(i + vec3(0,1,1)), n111 = hash13(i + vec3(1,1,1));
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
               mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
  }

  void main() {
    float h = vH;
    float growth = vMasks.b;
    float len = vState.x * growth;
    float dirt = vState.y;
    float mats = vState.z;
    float soap = vState.w;
    float wet = vState2.x;

    // --- волоски
    vec3 q = vBase * uDensity;
    float curl = uCurl + mats * 0.6;
    q += vec3(sin(h * 9.0 + q.y * 0.7), cos(h * 8.0 + q.z * 0.7), sin(h * 7.0 + q.x * 0.7)) * curl * h;
    // колтуны: волоски слипаются в крупные пучки
    q = mix(q, q * 0.45, smoothstep(0.2, 0.8, mats));
    vec3 cell = floor(q);
    vec3 f = fract(q);
    vec3 c = hash33(cell) * 0.5 + 0.25;
    float rnd = hash13(cell + 17.0);
    float d = length(f - c);
    float strandLen = mix(0.55, 1.0, rnd);
    float rel = h / strandLen;
    float radius = (1.0 - rel) * uThick * (1.0 + wet * 0.35);
    bool strand = h < 0.001 || (len > 0.03 && rel <= 1.0 && d < radius);

    // --- пена
    bool bubble = false;
    float foamLight = 0.0;
    if (soap > 0.04) {
      vec3 qb = vBase * 160.0 + vec3(0.0, uTime * 0.05, 0.0);
      vec3 cb = floor(qb);
      vec3 fb = fract(qb) - (hash33(cb) * 0.6 + 0.2);
      float db = length(fb);
      float shellBand = 1.0 - abs(h - 0.65) * 1.6;
      float r = soap * 0.62 * shellBand * (0.6 + hash13(cb) * 0.6);
      bubble = db < r && h > 0.1;
      foamLight = 1.0 - db / max(r, 0.001);
    }
    if (!strand && !bubble) discard;

    // --- цвет
    vec3 base = mix(uColA, uColB, smoothstep(0.25, 0.75, vMasks.r));
    base = mix(base, uColC, smoothstep(0.25, 0.75, vMasks.g));
    if (h < 0.001 && len < 0.03) base = uSkin;
    base *= mix(0.86, 1.12, rnd);
    base = mix(base, base * 1.18, h * 0.6);       // кончики светлее
    float dn = vnoise(vBase * 55.0) * 0.7 + vnoise(vBase * 140.0) * 0.3;
    float dirtAmt = clamp(dirt * 1.3 - (1.0 - dn) * 0.55, 0.0, 1.0);
    base = mix(base, vec3(0.30, 0.22, 0.14), dirtAmt * 0.85);
    base *= 1.0 - mats * 0.22;
    base *= 1.0 - wet * 0.38;

    vec3 N = normalize(vNormalW);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float ndl = dot(N, L);
    float diff = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
    vec3 amb = mix(uGround, uSky, N.y * 0.5 + 0.5);
    float ao = mix(0.42, 1.0, pow(h, 0.8));
    vec3 col = base * (amb + uLightColor * diff) * ao;
    // анизотропный блик (Kajiya-Kay)
    vec3 Hh = normalize(L + V);
    float th = dot(N, Hh);
    float spec = pow(sqrt(max(0.0, 1.0 - th * th)), 48.0) * (0.06 + wet * 0.35) * h;
    col += uLightColor * spec;
    // контровой свет
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += uSky * rim * 0.25 * h;

    if (bubble && (!strand || h > 0.3)) {
      vec3 foam = vec3(0.96, 0.97, 1.0) * (amb * 0.6 + uLightColor * diff * 0.7);
      foam += vec3(0.25, 0.15, 0.35) * pow(foamLight, 4.0);   // радужный отлив
      col = foam;
    }

    // искорки после парфюма
    if (uSparkle > 0.01) {
      float sp = hash13(floor(vBase * 300.0 + floor(uTime * 6.0)));
      if (sp > 0.995 - uSparkle * 0.01) col += vec3(1.0, 0.85, 0.95) * uSparkle * 1.6;
    }

    // подсказка длины: красный — длиннее нужного, синий — короче
    float target = vState2.y;
    if (uGuide > 0.5 && target >= 0.0 && growth > 0.08) {
      float dl = vState.x - target;
      vec3 gc = dl > 0.0 ? vec3(1.0, 0.25, 0.3) : vec3(0.25, 0.55, 1.0);
      float k = smoothstep(0.04, 0.25, abs(dl));
      col = mix(col, gc * (0.6 + 0.4 * diff), k * 0.65);
    }

    // круг кисти
    if (uCursorR > 0.0) {
      float cd = length(vWorldPos - uCursor);
      float ring = smoothstep(uCursorR * 0.08, 0.0, abs(cd - uCursorR));
      float inside = step(cd, uCursorR);
      col = mix(col, uCursorColor, ring * 0.7 + inside * 0.07);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Общие для всего меха настройки освещения (меняются по сцене). */
export const furLighting = {
  uLightDir: { value: new THREE.Vector3(0.4, 1.0, 0.6).normalize() },
  uLightColor: { value: new THREE.Color(1.0, 0.95, 0.88) },
  uSky: { value: new THREE.Color(0.55, 0.58, 0.68) },
  uGround: { value: new THREE.Color(0.32, 0.27, 0.26) },
  uTime: { value: 0 },
};

/** Общие для одного питомца униформы (окрас, параметры породы, курсор). */
export function createPetUniforms(breed, palette) {
  return {
    uColA: { value: new THREE.Color(palette.a) },
    uColB: { value: new THREE.Color(palette.b) },
    uColC: { value: new THREE.Color(palette.c) },
    uSkin: { value: new THREE.Color(palette.skin || '#e8b9a8') },
    uFurMax: { value: breed.furMax },
    uDroop: { value: breed.droop },
    uDensity: { value: breed.density },
    uCurl: { value: breed.curl },
    uThick: { value: breed.thick },
    uGuide: { value: 0 },
    uCursor: { value: new THREE.Vector3() },
    uCursorR: { value: 0 },
    uCursorColor: { value: new THREE.Color('#ffffff') },
    uShake: { value: 0 },
    uSparkle: { value: 0 },
  };
}

export function createFurMaterial(petUniforms) {
  const uniforms = {
    ...furLighting,
    ...petUniforms,
    uDown: { value: new THREE.Vector3(0, -1, 0) }, // своё у каждого меша
  };
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    vertexColors: true,
    side: THREE.FrontSide,
  });
  return m;
}

/**
 * Превращает обычную геометрию в инстансированную: каждый инстанс — слой.
 * Атрибуты состояния общие с исходной геометрией (одни и те же объекты),
 * поэтому обновление needsUpdate сразу видно во всех слоях.
 */
export function createShellGeometry(geom, shells) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = geom.index;
  for (const name of Object.keys(geom.attributes)) g.setAttribute(name, geom.attributes[name]);
  const shell = new Float32Array(shells);
  for (let i = 0; i < shells; i++) shell[i] = i / (shells - 1);
  g.setAttribute('aShell', new THREE.InstancedBufferAttribute(shell, 1));
  g.instanceCount = shells;
  g.boundingSphere = geom.boundingSphere ? geom.boundingSphere.clone() : null;
  return g;
}
