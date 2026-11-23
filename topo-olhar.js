// Quem Somos — o rosto em retícula olha para onde está o mouse (ou o dedo).
import * as THREE from 'three';

const palco = document.getElementById('palco-olhar');
const canvas = document.getElementById('rosto');
const POSES = window.POSES_OLHAR;
const N = POSES.length;
const quadro = i => `olhar/f_${String(i + 1).padStart(3, '0')}.jpg`;
const celular = () => matchMedia('(max-width: 760px)').matches;
const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;

const MOV = {
  suavidade: 5,
  troca: 0.14,
  ocioso: 4,
  alcanceX: 0.95,
  alcanceY: 0.95
};

// ---------- carregamento ----------
const imgs = new Array(N);
function carregar(i) {
  if (imgs[i]) return imgs[i];
  const im = new Image(); im.decoding = 'async'; im.src = quadro(i); imgs[i] = im; return im;
}
const pronto = im => im && im.complete && im.naturalWidth > 0;
const centro = POSES.reduce((m, p, i) => (Math.hypot(p[0], p[1]) < Math.hypot(POSES[m][0], POSES[m][1]) ? i : m), 0);
carregar(centro);
setTimeout(() => { for (let i = 0; i < N; i++) carregar(i); }, 200);

// ---------- cena ----------
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true });
renderer.setClearColor(0x000000, 0);
const cena = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const texAtual = new THREE.Texture(), texAntes = new THREE.Texture();
[texAtual, texAntes].forEach(t => { t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; });

const material = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  uniforms: {
    uAtual: { value: texAtual }, uAntes: { value: texAntes }, uMistura: { value: 1 },
    uRet: { value: new THREE.Vector4(0, 0, 1, 1) },
    uAlt: { value: 1 }, uCel: { value: 10 }, uEntrada: { value: 0 },
    uMouse: { value: new THREE.Vector2(-9999, -9999) }, uLuz: { value: 0 }, uLuzRaio: { value: 300 }
  },
  vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D uAtual, uAntes;
    uniform float uMistura, uAlt, uCel, uEntrada, uLuz, uLuzRaio;
    uniform vec4 uRet;
    uniform vec2 uMouse;
    float lum(vec2 p) {
      vec2 uv = (p - uRet.xy) / uRet.zw;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
      uv.y = 1.0 - uv.y;
      return mix(texture2D(uAntes, uv).r, texture2D(uAtual, uv).r, uMistura);
    }
    void main() {
      vec2 p = vec2(gl_FragCoord.x, uAlt - gl_FragCoord.y);
      vec2 c = (floor(p / uCel) + 0.5) * uCel;
      float L = lum(c);
      float m = smoothstep(0.03, 0.09, L);
      if (m <= 0.0) discard;
      float t = min(1.0, pow(L, 1.25) * 1.2);
      float r = uCel * (0.16 + 0.30 * t) * mix(0.6, 1.0, uEntrada);
      float d = distance(p, c);
      float aa = 0.7;
      float largura = max(0.8, uCel * 0.075);
      float anel = 1.0 - smoothstep(largura * 0.5 - aa * 0.5, largura * 0.5 + aa * 0.5, abs(d - r));
      float dentro = 1.0 - smoothstep(r - largura * 0.5 - aa, r - largura * 0.5, d);
      float dl = distance(p, uMouse);
      float luz = uLuz * exp(-(dl * dl) / (uLuzRaio * uLuzRaio));
      vec3 cor = mix(vec3(0.76, 0.73, 0.71), vec3(1.0, 0.25, 0.18), luz);
      float aAnel = anel * mix(0.75, 1.0, luz) * m * uEntrada;
      float aFundo = 0.72 * m * uEntrada * (1.0 - dentro) * (1.0 - anel);
      float a = aAnel + aFundo;
      gl_FragColor = vec4(cor * aAnel, a);
    }`
});
cena.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

function arrumar() {
  if (!palco) return;
  const W = palco.clientWidth, H = palco.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const cw = W * dpr, ch = H * dpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);

  // Mantém a proporção original do quadro (16:9) centralizada no palco
  const im0 = imgs[centro];
  const aspectQuadro = (im0 && im0.naturalWidth && im0.naturalHeight)
    ? (im0.naturalWidth / im0.naturalHeight)
    : (16 / 9);
  const aspectCaixa = cw / ch;
  const zoom = celular() ? 1.35 : 1.22;

  let rw, rh;
  if (aspectCaixa > aspectQuadro) {
    rw = cw * zoom;
    rh = rw / aspectQuadro;
  } else {
    rh = ch * zoom;
    rw = rh * aspectQuadro;
  }

  const rx = (cw - rw) * 0.5;
  const ry = (ch - rh) * 0.52;

  material.uniforms.uRet.value.set(rx, ry, rw, rh);
  material.uniforms.uAlt.value = ch;
  material.uniforms.uCel.value = (celular() ? 7.5 : 9.5) * dpr;
  material.uniforms.uLuzRaio.value = cw * 0.35;
}
arrumar();
addEventListener('resize', arrumar);

// ---------- olhar segue o ponteiro ----------
const alvo = { x: 0, y: 0 }, olhar = { x: 0, y: 0 };
const luz = { x: -9999, y: -9999, f: 0, alvo: 0 };
let ultimoMov = -1e9;
function apontar(cx, cy) {
  if (!palco) return;
  const r = palco.getBoundingClientRect();
  const hx = r.left + r.width * 0.5;
  const hy = r.top + r.height * 0.5;
  alvo.x = Math.max(-1, Math.min(1, (cx - hx) / (r.width * 0.45))) * MOV.alcanceX;
  alvo.y = Math.max(-1, Math.min(1, -(cy - hy) / (r.height * 0.45))) * MOV.alcanceY;
  const dpr = renderer.getPixelRatio();
  luz.x = (cx - r.left) * dpr;
  luz.y = (cy - r.top) * dpr;
  luz.alvo = (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) ? 1 : 0;
  ultimoMov = performance.now();
}
addEventListener('pointermove', e => apontar(e.clientX, e.clientY), { passive: true });
addEventListener('touchmove', e => apontar(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
document.addEventListener('pointerleave', () => { luz.alvo = 0; });

let visivel = true;
if (palco) {
  new IntersectionObserver(es => { visivel = es[0].isIntersecting; }).observe(palco);
}

// ---------- caminho em círculo ----------
const angQuadro = POSES.map(p => Math.atan2(p[1], p[0]));
const difAng = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function quadroDoAngulo(a) {
  let melhor = 0, dm = 1e9;
  for (let i = 0; i < N; i++) { const d = Math.abs(difAng(angQuadro[i], a)); if (d < dm) { dm = d; melhor = i; } }
  return melhor;
}
const modN = i => ((i % N) + N) % N;
let posLaco = quadroDoAngulo(Math.atan2(0.45, -0.55));
let carregadoA = -1, carregadoB = -1;
function mostrarPos(p) {
  const a = modN(Math.floor(p)), b = modN(a + 1), f = p - Math.floor(p);
  carregar(a); carregar(b);
  if (!pronto(imgs[a]) || !pronto(imgs[b])) return false;
  if (a !== carregadoA) { texAntes.image = imgs[a]; texAntes.needsUpdate = true; carregadoA = a; }
  if (b !== carregadoB) { texAtual.image = imgs[b]; texAtual.needsUpdate = true; carregadoB = b; }
  material.uniforms.uMistura.value = f;
  return true;
}

const inicio = performance.now();
let antes = inicio;
function laco(agora) {
  requestAnimationFrame(laco);
  if (!visivel) { antes = agora; return; }
  const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
  const t = (agora - inicio) / 1000;

  const ocioso = !reduzir && agora - ultimoMov > MOV.ocioso * 1000;
  luz.f += ((ocioso ? 0 : luz.alvo) - luz.f) * (1 - Math.exp(-6 * dt));

  if (ocioso) {
    posLaco += dt * N / 14;
  } else if (!reduzir) {
    const f = 1 - Math.exp(-MOV.suavidade * dt);
    olhar.x += (alvo.x - olhar.x) * f; olhar.y += (alvo.y - olhar.y) * f;
    if (Math.hypot(olhar.x, olhar.y) > 0.18) {
      const destino = quadroDoAngulo(Math.atan2(olhar.y, olhar.x));
      let delta = destino - modN(posLaco);
      if (delta > N / 2) delta -= N; if (delta < -N / 2) delta += N;
      const maxVel = N * 0.9;
      const passo = Math.max(-maxVel * dt, Math.min(maxVel * dt, delta * (1 - Math.exp(-MOV.suavidade * dt))));
      posLaco += passo;
    }
  }
  if (!mostrarPos(posLaco)) { renderer.render(cena, camera); return; }

  const u = material.uniforms;
  u.uEntrada.value = reduzir ? 1 : 1 - Math.pow(1 - Math.min(1, t / 1.2), 3);
  u.uMouse.value.set(luz.x, luz.y);
  u.uLuz.value = luz.f * 0.9;
  renderer.render(cena, camera);
}
requestAnimationFrame(laco);