// Nossos projetos — roda de pôsteres presos num eixo brilhante (estilo "Axle Bloom", HorizonX).
// Os cartões giram como um fichário (rolodex), param em cada pôster e, enquanto giram,
// borram no sentido do movimento com uma franja de cor e bordas que acendem.
import * as THREE from 'three';

// ---------- Ajustes (valores do editor do Axle Bloom) ----------
const AJ = {
  cartoes: 6,            // cartões na roda
  proporcao: 720 / 1023, // largura/altura dos pôsteres da Chama (o padrão do componente é 0.8; usamos a do pôster para não cortar a arte)
  canto: 0.035,          // raio do canto (fração da altura)
  tamanho: 1.0,          // 100%
  giro: -38,             // graus (vira a roda de lado)
  inclinacao: 10,        // graus
  distancia: 5,          // distância da câmera
  folgaEixo: 0.012,
  autoplay: true,
  sentido: 1,            // 1 = para baixo
  segPorCartao: 1.5,
  pausa: 0.8,
  assentar: 8,
  arrasto: 1,
  brilho: 0.5,           // sheen
  luzEixo: 1,            // axle glow
  sombraChao: 0.5,
  fundoTras: 0.12,       // back fade
  borrao: 0.7,           // motion smear
  franja: 0.6,           // colour fringe
  clarao: 0.8            // edge flare
};

const P = window.PROJETOS;
const N = P.length;
const { mostrar, abrir } = window.Chama;
const roda = document.getElementById('roda');
const canvas = document.getElementById('palco');
const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
roda.style.setProperty('--sombra', AJ.sombraChao);

// ---------- Cena ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const cena = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 0, AJ.distancia);

const eixo = new THREE.Group();
eixo.rotation.order = 'YXZ';
eixo.rotation.y = THREE.MathUtils.degToRad(AJ.giro);
eixo.rotation.x = THREE.MathUtils.degToRad(AJ.inclinacao);
cena.add(eixo);

const H = 1, W = H * AJ.proporcao;
const passo = (Math.PI * 2) / AJ.cartoes;

// texturas dos pôsteres
const loader = new THREE.TextureLoader();
const aniso = renderer.capabilities.getMaxAnisotropy();
const texturas = P.map(p => {
  const t = loader.load(`img/posters/${p.id}.jpg`);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
});

const vert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const frag = /* glsl */`
  precision highp float;
  uniform sampler2D uMapa;
  uniform float uVel, uAspecto, uCanto, uBorrao, uFranja, uClarao, uBrilho, uFrente, uAtras, uFundoTras, uAngulo;
  varying vec2 vUv;
  float caixa(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    vec2 uv = vUv;
    if (!gl_FrontFacing) uv.x = 1.0 - uv.x;
    // cantos arredondados
    vec2 p = (vUv - 0.5) * vec2(uAspecto, 1.0);
    float d = caixa(p, vec2(uAspecto, 1.0) * 0.5, uCanto);
    float bordaAA = fwidth(d);
    float alfa = 1.0 - smoothstep(-bordaAA, bordaAA, d);
    if (alfa <= 0.0) discard;
    // borrão no sentido do giro (mais forte longe do eixo, que gira mais rápido) + franja de cor
    float v = clamp(uVel, -4.0, 4.0);
    float raio = vUv.y;                                  // 0 no eixo, 1 na ponta do cartão
    float quanto = abs(v) * uBorrao * 0.055 * (0.35 + raio);
    float fr = v * uFranja * 0.010 * (0.4 + raio);
    vec3 cor = vec3(0.0);
    for (int i = 0; i < 13; i++) {
      float t = (float(i) / 12.0 - 0.5) * quanto;
      cor.r += texture2D(uMapa, uv + vec2(0.0, t + fr)).r;
      cor.g += texture2D(uMapa, uv + vec2(0.0, t)).g;
      cor.b += texture2D(uMapa, uv + vec2(0.0, t - fr)).b;
    }
    cor /= 13.0;
    // luz suave: quase tudo claro, só um leve sombreado quando o cartão fica de lado
    float luz = mix(0.78, 1.0, smoothstep(0.0, 0.9, abs(uFrente)));
    if (!gl_FrontFacing) luz *= 0.9;
    cor *= luz;
    // reflexo (sheen): faixa diagonal suave que corre com o ângulo
    float faixa = exp(-pow(vUv.x * 0.55 + vUv.y - (0.9 + uAngulo * 1.1), 2.0) * 9.0);
    cor = mix(cor, vec3(1.0), faixa * uBrilho * 0.22);
    // bordas acendem enquanto gira (clarão)
    float borda = 1.0 - smoothstep(0.0, 0.018, -d);
    cor = mix(cor, vec3(1.0, 0.97, 0.92), borda * (0.25 + uClarao * min(1.0, abs(v) * 0.8)) * 0.8);
    // os de trás desbotam de leve (back fade)
    cor = mix(cor, vec3(0.93), uAtras * uFundoTras);
    gl_FragColor = vec4(cor, alfa);
    #include <colorspace_fragment>
  }`;

const geo = new THREE.PlaneGeometry(W, H, 1, 1);
geo.translate(0, AJ.folgaEixo + H / 2, 0);
const cartoes = [];
for (let s = 0; s < AJ.cartoes; s++) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: false, depthWrite: true, depthTest: true, side: THREE.DoubleSide,
    alphaToCoverage: true,   // cantos arredondados suaves com o antialias, sem precisar de transparência
    uniforms: {
      uMapa: { value: texturas[0] }, uVel: { value: 0 }, uAspecto: { value: AJ.proporcao }, uCanto: { value: AJ.canto },
      uBorrao: { value: AJ.borrao }, uFranja: { value: AJ.franja }, uClarao: { value: AJ.clarao }, uBrilho: { value: AJ.brilho },
      uFrente: { value: 1 }, uAtras: { value: 0 }, uFundoTras: { value: AJ.fundoTras }, uAngulo: { value: 0 }
    }
  });
  const pivo = new THREE.Group();
  const malha = new THREE.Mesh(geo, mat);
  pivo.add(malha); eixo.add(pivo);
  cartoes.push({ pivo, malha, mat, g: null });
}

// eixo: um fio fino e claro, com um brilho estreito em volta
const barra = new THREE.Mesh(
  new THREE.CylinderGeometry(0.006, 0.006, W * 1.04, 16),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
barra.rotation.z = Math.PI / 2;
eixo.add(barra);
const brilhoTex = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const x = c.getContext('2d');
  const gv = x.createLinearGradient(0, 0, 0, 64);
  gv.addColorStop(0, 'rgba(255,255,255,0)'); gv.addColorStop(0.5, 'rgba(255,250,240,1)'); gv.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gv; x.fillRect(0, 0, 512, 64);
  x.globalCompositeOperation = 'destination-in';
  const gh = x.createLinearGradient(0, 0, 512, 0);
  gh.addColorStop(0, 'rgba(0,0,0,0)'); gh.addColorStop(0.12, 'rgba(0,0,0,1)'); gh.addColorStop(0.88, 'rgba(0,0,0,1)'); gh.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gh; x.fillRect(0, 0, 512, 64);
  return new THREE.CanvasTexture(c);
})();
const halo = new THREE.Mesh(
  new THREE.PlaneGeometry(W * 1.2, 0.06),
  new THREE.MeshBasicMaterial({ map: brilhoTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 * AJ.luzEixo })
);
halo.renderOrder = 999;
eixo.add(halo);

// ---------- Tamanho ----------
function arrumar() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Onde fica o centro da roda e qual altura ela deve ocupar (em px de tela).
  // Computador: a tela de desenho cobre a seção toda e a roda fica à direita (data-cx/cy/h, em px do layout).
  // Celular: a roda fica no meio da caixa dela, que é menor que a tela de desenho.
  let cx = w / 2, cy = h / 2, alturaRoda = h, larguraRoda = w;
  if (!matchMedia('(max-width: 760px)').matches) {
    const k = w / 1920;
    cx = +roda.dataset.cx * k; cy = +roda.dataset.cy * k; alturaRoda = +roda.dataset.h * k; larguraRoda = 1000 * k;
  } else {
    alturaRoda = roda.clientHeight; larguraRoda = roda.clientWidth;
    cy = h / 2;
  }
  const alturaVisivel = 2 * AJ.distancia * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const mundoPorPx = alturaVisivel / h;
  // diâmetro da roda ≈ 1,95 cartão de altura; na largura cabe ≈ 1,42
  const escala = Math.min((alturaRoda * mundoPorPx) / 1.95, (larguraRoda * mundoPorPx) / 1.42);
  eixo.scale.setScalar(escala * AJ.tamanho);
  camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
  camera.updateProjectionMatrix();
}
arrumar();
addEventListener('resize', arrumar);

// ---------- Movimento ----------
let pos = 0, alvo = 0, vel = 0, ultimaInteracao = -1e9, proximoPasso = performance.now() + AJ.segPorCartao * 1000;
const mod = (a, n) => ((a % n) + n) % n;
function irPara(delta) { alvo = Math.round(alvo) + delta; ultimaInteracao = performance.now(); if (reduzir) pos = alvo; }
document.getElementById('proximo').addEventListener('click', () => irPara(AJ.sentido));
document.getElementById('anterior').addEventListener('click', () => irPara(-AJ.sentido));
document.getElementById('ver-ficha').addEventListener('click', () => abrir(mod(Math.round(alvo), N)));
canvas.tabIndex = 0;
canvas.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { irPara(1); e.preventDefault(); }
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { irPara(-1); e.preventDefault(); }
  if (e.key === 'Enter' || e.key === ' ') { abrir(mod(Math.round(alvo), N)); e.preventDefault(); }
});

// arrastar (para cima/baixo gira a roda) — clique sem arrastar abre a ficha
let arrastando = false, inicioY = 0, inicioPos = 0, moveu = 0, ultY = 0, ultX = 0, ultT = 0, velArrasto = 0;
const raio = new THREE.Raycaster(), ponteiro = new THREE.Vector2();
canvas.addEventListener('pointerdown', e => {
  arrastando = true; moveu = 0; inicioY = ultY = e.clientY; ultX = e.clientX; ultT = performance.now(); inicioPos = pos; velArrasto = 0;
  canvas.setPointerCapture(e.pointerId); canvas.classList.add('arrastando'); ultimaInteracao = performance.now();
});
canvas.addEventListener('pointermove', e => {
  if (!arrastando) return;
  const h = roda.clientHeight;
  moveu = Math.max(moveu, Math.abs(e.clientY - inicioY));
  pos = inicioPos + ((e.clientY - inicioY) / (h * 0.42)) * AJ.arrasto;
  alvo = pos;
  const agora = performance.now();
  velArrasto = ((e.clientY - ultY) / (h * 0.42)) / Math.max(0.008, (agora - ultT) / 1000);
  ultY = e.clientY; ultT = agora; ultimaInteracao = agora;
});
function soltar() {
  if (!arrastando) return;
  arrastando = false; canvas.classList.remove('arrastando');
  if (moveu < 6) {
    // clique sem arrastar: abre o projeto do cartão clicado (clicar no vazio não faz nada)
    const r = canvas.getBoundingClientRect();
    ponteiro.set(((ultX - r.left) / r.width) * 2 - 1, -((ultY - r.top) / r.height) * 2 + 1);
    raio.setFromCamera(ponteiro, camera);
    const hit = raio.intersectObjects(cartoes.map(c => c.malha), false)[0];
    if (hit) abrir(mod(cartoes.find(c => c.malha === hit.object).g, N));
    return;
  }
  alvo = Math.round(pos + Math.max(-2, Math.min(2, velArrasto * 0.18)));
  ultimaInteracao = performance.now();
}
canvas.addEventListener('pointerup', soltar);
canvas.addEventListener('pointercancel', soltar);

// rolagem lateral (trackpad / shift + rodinha) gira a roda; a rolagem vertical continua descendo a página
let acumulado = 0;
canvas.addEventListener('wheel', e => {
  const dx = e.shiftKey ? e.deltaY : e.deltaX;
  if (Math.abs(dx) < Math.abs(e.deltaY) && !e.shiftKey) return;
  e.preventDefault();
  acumulado += dx;
  if (Math.abs(acumulado) > 60) { irPara(Math.sign(acumulado)); acumulado = 0; }
}, { passive: false });

let naTela = false;
new IntersectionObserver(es => { naTela = es[0].isIntersecting; }).observe(roda);

const camVec = new THREE.Vector3(), normal = new THREE.Vector3(), centro = new THREE.Vector3(), q = new THREE.Quaternion();
let antes = performance.now(), mostradoAgora = -1;
function quadro(agora) {
  requestAnimationFrame(quadro);
  const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
  if (!naTela) { proximoPasso = agora + AJ.segPorCartao * 1000; return; }

  // autoplay: um cartão a cada 1,5 s; para 4 s depois de qualquer interação
  if (AJ.autoplay && !reduzir && !arrastando && agora - ultimaInteracao > 4000 && agora >= proximoPasso) {
    alvo = Math.round(alvo) + AJ.sentido;
    proximoPasso = agora + AJ.segPorCartao * 1000;
  }
  if (agora - ultimaInteracao <= 4000) proximoPasso = agora + AJ.segPorCartao * 1000 * AJ.pausa;

  const antesPos = pos;
  if (!arrastando) pos += (alvo - pos) * (reduzir ? 1 : 1 - Math.exp(-AJ.assentar * dt));
  const velInst = (pos - antesPos) / Math.max(dt, 1e-3);
  vel += (velInst - vel) * (1 - Math.exp(-14 * dt));

  const atual = mod(Math.round(pos), N);
  if (atual !== mostradoAgora) { mostradoAgora = atual; mostrar(atual); }

  // cada cartão "g" fica no ângulo (pos - g) × passo; os 6 lugares da roda vão trocando de pôster
  const base = Math.floor(pos);
  camera.getWorldPosition(camVec);
  for (let g = base - 2; g <= base + 3; g++) {
    const c = cartoes[mod(g, AJ.cartoes)];
    const ang = (pos - g) * passo;
    c.pivo.rotation.x = ang;
    if (c.g !== g) { c.g = g; c.mat.uniforms.uMapa.value = texturas[mod(g, N)]; }
    c.malha.getWorldQuaternion(q);
    normal.set(0, 0, 1).applyQuaternion(q);
    c.malha.getWorldPosition(centro);
    centro.y += 0;
    const frente = normal.dot(camVec.clone().sub(centro).normalize());
    const u = c.mat.uniforms;
    u.uFrente.value = Math.abs(frente) * Math.sign(Math.cos(ang) + 0.35);
    u.uAtras.value = THREE.MathUtils.clamp((1 - Math.cos(ang)) / 2, 0, 1);
    u.uVel.value = reduzir ? 0 : vel;
    u.uAngulo.value = ang / passo;
    c.malha.renderOrder = Math.round(100 - u.uAtras.value * 50 + Math.cos(ang) * 10);
  }
  renderer.render(cena, camera);
}
requestAnimationFrame(quadro);
