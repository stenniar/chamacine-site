// Topo — o rosto em retícula olha para onde está o mouse (ou o dedo).
// Base: vídeo do Magnific em que só a cabeça se mexe para todos os lados.
// Cada quadro tem a sua direção de olhar (olhar/poses.js); o mouse escolhe o quadro mais próximo
// e a troca entre quadros é uma transição suave. A retícula de pontos é desenhada pela placa de vídeo.
import * as THREE from 'three';

const topo = document.getElementById('topo');
const canvas = document.getElementById('rosto');
const POSES = window.POSES_OLHAR;
const N = POSES.length;
const quadro = i => `olhar/f_${String(i + 1).padStart(3, '0')}.jpg`;
const celular = () => matchMedia('(max-width: 760px)').matches;
const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mesmo enquadramento do layout (px do layout)
const ROSTO = { x: 54, y: -127, w: 1774 };
const ROSTO_CEL = { x: -40, y: 90, w: 840 };
// tamanho da célula da retícula (px do layout) — pontos finos, como na arte de referência
const CELULA = 13, CELULA_CEL = 9;

const MOV = {
  suavidade: 5,       // quanto maior, mais rápido o olhar segue o mouse
  troca: 0.14,        // segundos da transição entre quadros
  ocioso: 4,          // segundos sem mexer até ele olhar em volta sozinho
  alcanceX: 0.95,     // quanto do lado ele chega a olhar
  alcanceY: 0.95
};

// ---------- carregamento ----------
const imgs = new Array(N);
function carregar(i) {
  if (imgs[i]) return imgs[i];
  const im = new Image(); im.decoding = 'async'; im.src = quadro(i); imgs[i] = im; return im;
}
const pronto = im => im && im.complete && im.naturalWidth > 0;
// começa pelo quadro olhando para a frente, depois carrega o resto
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
    uRet: { value: new THREE.Vector4(0, 0, 1, 1) },   // x, y, largura, altura do rosto (px do canvas, y para baixo)
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
    // Retícula igual à do layout (PSD): grade reta de anéis cinza finos e vazados.
    // Dentro do rosto o título fica escurecido e só aparece vermelho por dentro dos anéis.
    float lum(vec2 p) {
      vec2 uv = (p - uRet.xy) / uRet.zw;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
      uv.y = 1.0 - uv.y;
      return mix(texture2D(uAntes, uv).r, texture2D(uAtual, uv).r, uMistura);
    }
    void main() {
      vec2 p = vec2(gl_FragCoord.x, uAlt - gl_FragCoord.y);          // px, y para baixo
      vec2 c = (floor(p / uCel) + 0.5) * uCel;                      // centro da célula
      float L = lum(c);
      float m = smoothstep(0.03, 0.09, L);                          // máscara do rosto (fundo preto)
      if (m <= 0.0) discard;
      // raio do anel: pequeno no escuro, grande no claro (mesma regra do layout)
      float t = min(1.0, pow(L, 1.25) * 1.2);
      float r = uCel * (0.16 + 0.30 * t) * mix(0.6, 1.0, uEntrada);
      float d = distance(p, c);
      float aa = 0.7;
      float largura = max(0.8, uCel * 0.075);                       // traço fino
      float anel = 1.0 - smoothstep(largura * 0.5 - aa * 0.5, largura * 0.5 + aa * 0.5, abs(d - r));
      float dentro = 1.0 - smoothstep(r - largura * 0.5 - aa, r - largura * 0.5, d);
      // luz do cursor: anéis perto do mouse ficam mais claros
      float dl = distance(p, uMouse);
      float luz = uLuz * exp(-(dl * dl) / (uLuzRaio * uLuzRaio));
      vec3 cor = mix(vec3(0.59), vec3(1.0, 0.94, 0.88), luz);
      float aAnel = anel * mix(0.6, 1.0, luz) * m * uEntrada;
      // fora do anel: escurece 74% (o vermelho do título fica escuro); dentro do anel: transparente
      float aFundo = 0.74 * m * uEntrada * (1.0 - dentro) * (1.0 - anel);
      float a = aAnel + aFundo;
      gl_FragColor = vec4(cor * aAnel, a);
    }`
});
cena.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

function arrumar() {
  const W = topo.clientWidth, H = topo.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
  const base = celular() ? 760 : 1920, k = (W / base) * dpr;
  const r = celular() ? ROSTO_CEL : ROSTO;
  material.uniforms.uRet.value.set(r.x * k, r.y * k, r.w * k, r.w * k);
  material.uniforms.uAlt.value = H * dpr;
  material.uniforms.uCel.value = (celular() ? CELULA_CEL : CELULA) * k;
  material.uniforms.uLuzRaio.value = W * 0.14 * dpr;
}
arrumar();
addEventListener('resize', arrumar);

// ---------- olhar segue o ponteiro ----------
const alvo = { x: 0, y: 0 }, olhar = { x: 0, y: 0 };
const luz = { x: -9999, y: -9999, f: 0, alvo: 0 };
let ultimoMov = -1e9;
function apontar(cx, cy) {
  const r = topo.getBoundingClientRect();
  // o centro de referência é a cabeça (um pouco acima do meio do topo)
  const hx = r.left + r.width * 0.5, hy = r.top + Math.min(r.height * 0.42, innerHeight * 0.45);
  alvo.x = Math.max(-1, Math.min(1, (cx - hx) / (innerWidth * 0.42))) * MOV.alcanceX;
  alvo.y = Math.max(-1, Math.min(1, -(cy - hy) / (innerHeight * 0.42))) * MOV.alcanceY;
  const dpr = renderer.getPixelRatio();
  luz.x = (cx - r.left) * dpr; luz.y = (cy - r.top) * dpr;
  luz.alvo = (cy >= r.top && cy <= r.bottom) ? 1 : 0;
  ultimoMov = performance.now();
}
addEventListener('pointermove', e => apontar(e.clientX, e.clientY), { passive: true });
addEventListener('touchmove', e => apontar(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
document.addEventListener('pointerleave', () => { luz.alvo = 0; });

let visivel = true;
new IntersectionObserver(es => { visivel = es[0].isIntersecting; }).observe(topo);

// ---------- caminho em círculo ----------
// O vídeo é um laço: o olhar dá a volta completa e termina onde começou.
// Cada quadro tem um ângulo no círculo; o rosto ANDA pelo laço (quadro a quadro, pelo lado mais curto)
// até o ângulo do mouse, misturando dois quadros vizinhos — nunca pula.
const angQuadro = POSES.map(p => Math.atan2(p[1], p[0]));
const difAng = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function quadroDoAngulo(a) {
  let melhor = 0, dm = 1e9;
  for (let i = 0; i < N; i++) { const d = Math.abs(difAng(angQuadro[i], a)); if (d < dm) { dm = d; melhor = i; } }
  return melhor;
}
const modN = i => ((i % N) + N) % N;
let posLaco = quadroDoAngulo(Math.atan2(0.45, -0.55));    // começa olhando para cima-esquerda
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
    // sozinho: dá a volta no laço devagar, sempre no mesmo sentido
    posLaco += dt * N / 14;
  } else if (!reduzir) {
    const f = 1 - Math.exp(-MOV.suavidade * dt);
    olhar.x += (alvo.x - olhar.x) * f; olhar.y += (alvo.y - olhar.y) * f;
    // mouse muito perto do centro: mantém a pose (não fica indeciso entre lados opostos)
    if (Math.hypot(olhar.x, olhar.y) > 0.18) {
      const destino = quadroDoAngulo(Math.atan2(olhar.y, olhar.x));
      let delta = destino - modN(posLaco);
      if (delta > N / 2) delta -= N; if (delta < -N / 2) delta += N;   // caminho mais curto no laço
      const maxVel = N * 0.9;                                         // quadros por segundo, no máximo
      const passo = Math.max(-maxVel * dt, Math.min(maxVel * dt, delta * (1 - Math.exp(-MOV.suavidade * dt))));
      posLaco += passo;
    }
  }
  if (!mostrarPos(posLaco)) { renderer.render(cena, camera); return; }

  const u = material.uniforms;
  u.uEntrada.value = reduzir ? 1 : 1 - Math.pow(1 - Math.min(1, t / 1.2), 3);
  u.uMouse.value.set(luz.x, luz.y);
  u.uLuz.value = luz.f * 0.85;
  renderer.render(cena, camera);
}
requestAnimationFrame(laco);
