// Nossos projetos — roda de pôsteres presos num eixo brilhante (estilo "Axle Bloom", HorizonX).
import * as THREE from 'three';

const AJ = {
  cartoes: 6,
  proporcao: 720 / 1023,
  canto: 0.035,
  tamanho: 1.0,
  giro: -38,
  inclinacao: 10,
  distancia: 5,
  folgaEixo: 0.012,
  autoplay: true,
  sentido: 1,
  segPorCartao: 1.5,
  pausa: 0.8,
  assentar: 8,
  arrasto: 1,
  brilho: 0.5,
  luzEixo: 1,
  sombraChao: 0.5,
  fundoTras: 0.12,
  borrao: 0.7,
  franja: 0.6,
  clarao: 0.8
};

const P = Array.isArray(window.PROJETOS) && window.PROJETOS.length > 0 ? window.PROJETOS : [];
const N = P.length;
const ChamaAPI = window.Chama || {
  mostrar() {},
  abrir() {}
};
const { mostrar, abrir } = ChamaAPI;

const roda = document.getElementById('roda');
const canvas = document.getElementById('palco');
const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (roda && canvas && N > 0) {
  roda.style.setProperty('--sombra', AJ.sombraChao);

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

  const loader = new THREE.TextureLoader();
  const aniso = Math.min(renderer.capabilities.getMaxAnisotropy() || 1, 8);
  const texturas = P.map(p => {
    const t = loader.load(
      `img/posters/${p.id}.jpg`,
      undefined,
      undefined,
      () => {}
    );
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
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
      vec2 p = (vUv - 0.5) * vec2(uAspecto, 1.0);
      float d = caixa(p, vec2(uAspecto, 1.0) * 0.5, uCanto);
      float bordaAA = fwidth(d);
      float alfa = 1.0 - smoothstep(-bordaAA, bordaAA, d);
      if (alfa <= 0.0) discard;
      float v = clamp(uVel, -4.0, 4.0);
      float raio = vUv.y;
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
      float luz = mix(0.78, 1.0, smoothstep(0.0, 0.9, abs(uFrente)));
      if (!gl_FrontFacing) luz *= 0.9;
      cor *= luz;
      float faixa = exp(-pow(vUv.x * 0.55 + vUv.y - (0.9 + uAngulo * 1.1), 2.0) * 9.0);
      cor = mix(cor, vec3(1.0), faixa * uBrilho * 0.22);
      float borda = 1.0 - smoothstep(0.0, 0.018, -d);
      cor = mix(cor, vec3(1.0, 0.97, 0.92), borda * (0.25 + uClarao * min(1.0, abs(v) * 0.8)) * 0.8);
      cor = mix(cor, vec3(0.93), uAtras * uFundoTras);
      gl_FragColor = vec4(cor, alfa);
      #include <colorspace_fragment>
    }`;

  const geo = new THREE.PlaneGeometry(W, H, 1, 1);
  geo.translate(0, AJ.folgaEixo + H / 2, 0);
  const cartoes = [];
  for (let s = 0; s < AJ.cartoes; s++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      uniforms: {
        uMapa: { value: texturas[0] },
        uVel: { value: 0 },
        uAspecto: { value: AJ.proporcao },
        uCanto: { value: AJ.canto },
        uBorrao: { value: AJ.borrao },
        uFranja: { value: AJ.franja },
        uClarao: { value: AJ.clarao },
        uBrilho: { value: AJ.brilho },
        uFrente: { value: 1 },
        uAtras: { value: 0 },
        uFundoTras: { value: AJ.fundoTras },
        uAngulo: { value: 0 }
      }
    });
    const pivo = new THREE.Group();
    const malha = new THREE.Mesh(geo, mat);
    pivo.add(malha);
    eixo.add(pivo);
    cartoes.push({ pivo, malha, mat, g: null });
  }

  const barra = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, W * 1.04, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  barra.rotation.z = Math.PI / 2;
  eixo.add(barra);

  const brilhoTex = (() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 64;
    const x = c.getContext('2d');
    const gv = x.createLinearGradient(0, 0, 0, 64);
    gv.addColorStop(0, 'rgba(255,255,255,0)');
    gv.addColorStop(0.5, 'rgba(255,250,240,1)');
    gv.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gv;
    x.fillRect(0, 0, 512, 64);
    x.globalCompositeOperation = 'destination-in';
    const gh = x.createLinearGradient(0, 0, 512, 0);
    gh.addColorStop(0, 'rgba(0,0,0,0)');
    gh.addColorStop(0.12, 'rgba(0,0,0,1)');
    gh.addColorStop(0.88, 'rgba(0,0,0,1)');
    gh.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gh;
    x.fillRect(0, 0, 512, 64);
    return new THREE.CanvasTexture(c);
  })();

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.2, 0.06),
    new THREE.MeshBasicMaterial({
      map: brilhoTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.55 * AJ.luzEixo
    })
  );
  halo.renderOrder = 999;
  eixo.add(halo);

  function arrumar() {
    const w = roda.clientWidth || canvas.clientWidth;
    const h = roda.clientHeight || canvas.clientHeight;
    if (!w || !h) return;

    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.clearViewOffset();

    const alturaVisivel = 2 * AJ.distancia * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const larguraVisivel = alturaVisivel * camera.aspect;

    const escalaVertical = (alturaVisivel * 0.90) / 1.95;
    const escalaHorizontal = (larguraVisivel * 0.92) / 1.35;
    const escala = Math.max(0.45, Math.min(escalaVertical, escalaHorizontal));

    eixo.scale.setScalar(escala * AJ.tamanho);
    eixo.position.set(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  arrumar();
  addEventListener('resize', arrumar);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(arrumar).observe(roda);
  }

  let pos = 0, alvo = 0, vel = 0, ultimaInteracao = -1e9, proximoPasso = performance.now() + AJ.segPorCartao * 1000;
  const mod = (a, n) => ((a % n) + n) % n;

  function irPara(delta) {
    alvo = Math.round(alvo) + delta;
    ultimaInteracao = performance.now();
    if (reduzir) pos = alvo;
  }

  document.getElementById('proximo')?.addEventListener('click', () => irPara(AJ.sentido));
  document.getElementById('anterior')?.addEventListener('click', () => irPara(-AJ.sentido));
  document.getElementById('ver-ficha')?.addEventListener('click', () => abrir(mod(Math.round(alvo), N)));

  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { irPara(1); e.preventDefault(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { irPara(-1); e.preventDefault(); }
    if (e.key === 'Enter' || e.key === ' ') { abrir(mod(Math.round(alvo), N)); e.preventDefault(); }
  });

  let arrastando = false, inicioY = 0, inicioPos = 0, moveu = 0, ultY = 0, ultX = 0, ultT = 0, velArrasto = 0;
  const raio = new THREE.Raycaster(), ponteiro = new THREE.Vector2();

  canvas.addEventListener('pointerdown', e => {
    arrastando = true;
    moveu = 0;
    inicioY = ultY = e.clientY;
    ultX = e.clientX;
    ultT = performance.now();
    inicioPos = pos;
    velArrasto = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('arrastando');
    ultimaInteracao = performance.now();
  });

  canvas.addEventListener('pointermove', e => {
    if (!arrastando) return;
    const h = roda.clientHeight || 1;
    moveu = Math.max(moveu, Math.abs(e.clientY - inicioY));
    pos = inicioPos + ((e.clientY - inicioY) / (h * 0.42)) * AJ.arrasto;
    alvo = pos;
    const agora = performance.now();
    velArrasto = ((e.clientY - ultY) / (h * 0.42)) / Math.max(0.008, (agora - ultT) / 1000);
    ultY = e.clientY;
    ultT = agora;
    ultimaInteracao = agora;
  });

  function soltar() {
    if (!arrastando) return;
    arrastando = false;
    canvas.classList.remove('arrastando');
    if (moveu < 6) {
      const r = canvas.getBoundingClientRect();
      ponteiro.set(((ultX - r.left) / r.width) * 2 - 1, -((ultY - r.top) / r.height) * 2 + 1);
      raio.setFromCamera(ponteiro, camera);
      const hit = raio.intersectObjects(cartoes.map(c => c.malha), false)[0];
      if (hit) {
        const alvoCartao = cartoes.find(c => c.malha === hit.object);
        if (alvoCartao && typeof alvoCartao.g === 'number') {
          abrir(mod(alvoCartao.g, N));
        }
      }
      return;
    }
    alvo = Math.round(pos + Math.max(-2, Math.min(2, velArrasto * 0.18)));
    ultimaInteracao = performance.now();
  }

  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);

  let acumulado = 0;
  canvas.addEventListener('wheel', e => {
    const dx = e.shiftKey ? e.deltaY : e.deltaX;
    if (Math.abs(dx) < Math.abs(e.deltaY) && !e.shiftKey) return;
    e.preventDefault();
    acumulado += dx;
    if (Math.abs(acumulado) > 60) {
      irPara(Math.sign(acumulado));
      acumulado = 0;
    }
  }, { passive: false });

  let naTela = true;
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(es => { naTela = es[0].isIntersecting; }).observe(roda);
  }

  const camVec = new THREE.Vector3(), normal = new THREE.Vector3(), centro = new THREE.Vector3(), q = new THREE.Quaternion();
  let antes = performance.now(), mostradoAgora = -1;

  mostrar(0);
  mostradoAgora = 0;

  function quadro(agora) {
    requestAnimationFrame(quadro);
    const dt = Math.min(0.05, (agora - antes) / 1000);
    antes = agora;

    if (!naTela) {
      proximoPasso = agora + AJ.segPorCartao * 1000;
      return;
    }

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
    if (atual !== mostradoAgora) {
      mostradoAgora = atual;
      mostrar(atual);
    }

    const base = Math.floor(pos);
    camera.getWorldPosition(camVec);
    for (let g = base - 2; g <= base + 3; g++) {
      const c = cartoes[mod(g, AJ.cartoes)];
      const ang = (pos - g) * passo;
      c.pivo.rotation.x = ang;
      if (c.g !== g) {
        c.g = g;
        c.mat.uniforms.uMapa.value = texturas[mod(g, N)];
      }
      c.malha.getWorldQuaternion(q);
      normal.set(0, 0, 1).applyQuaternion(q);
      c.malha.getWorldPosition(centro);
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
}