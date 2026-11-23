// Quem Somos — composição interativa em retícula nítida que acompanha o cursor.
const palco = document.getElementById('palco-olhar');
const canvas = document.getElementById('rosto');
const ctx = canvas ? canvas.getContext('2d') : null;

const POSES = Array.isArray(window.POSES_OLHAR) && window.POSES_OLHAR.length
  ? window.POSES_OLHAR
  : Array.from({ length: 160 }, (_, i) => {
      const ang = (i / 160) * Math.PI * 2;
      return [Math.cos(ang), Math.sin(ang)];
    });

const N = POSES.length;
const quadro = i => `olhar/f_${String(i + 1).padStart(3, '0')}.jpg`;
const celular = () => matchMedia('(max-width: 760px)').matches;
const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Buffer offscreen em alta resolução para captar detalhes do rosto e do olhar
const off = document.createElement('canvas');
const offCtx = off.getContext('2d', { willReadFrequently: true });
off.width = 480;
off.height = 270;

const imgs = new Array(N);
const pixelCache = new Map();

function carregar(i) {
  if (imgs[i]) return imgs[i];
  const im = new Image();
  im.decoding = 'async';
  im.addEventListener('load', () => {
    pixelCache.delete(i);
    arrumar();
  }, { once: true });
  im.src = quadro(i);
  imgs[i] = im;
  return im;
}

const pronto = im => im && im.complete && im.naturalWidth > 0;
const centro = POSES.reduce((m, p, i) => (Math.hypot(p[0], p[1]) < Math.hypot(POSES[m][0], POSES[m][1]) ? i : m), 0);

carregar(centro);
setTimeout(() => {
  for (let i = 0; i < N; i++) carregar(i);
}, 120);

let larguraCss = 480;
let alturaCss = 420;
let dpr = 1;

function arrumar() {
  if (!palco || !canvas || !ctx) return;
  larguraCss = palco.clientWidth || palco.parentElement?.clientWidth || 480;
  alturaCss = palco.clientHeight || 420;
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.max(1, Math.round(larguraCss * dpr));
  canvas.height = Math.max(1, Math.round(alturaCss * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

arrumar();
window.addEventListener('resize', arrumar);

const alvo = { x: 0, y: 0 };
const olhar = { x: 0, y: 0 };
const ponteiro = { x: -9999, y: -9999, ativo: false, f: 0 };
let ultimoMov = -1e9;

function apontar(cx, cy) {
  if (!palco) return;
  const r = palco.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const hx = r.left + r.width * 0.5;
  const hy = r.top + r.height * 0.5;

  alvo.x = Math.max(-1, Math.min(1, (cx - hx) / (r.width * 0.45))) * 0.95;
  alvo.y = Math.max(-1, Math.min(1, -(cy - hy) / (r.height * 0.45))) * 0.95;

  ponteiro.x = cx - r.left;
  ponteiro.y = cy - r.top;
  ponteiro.ativo = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  ultimoMov = performance.now();
}

window.addEventListener('pointermove', e => apontar(e.clientX, e.clientY), { passive: true });
window.addEventListener('touchmove', e => {
  if (e.touches && e.touches[0]) apontar(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
document.addEventListener('pointerleave', () => { ponteiro.ativo = false; });

let visivel = true;
if (palco && 'IntersectionObserver' in window) {
  new IntersectionObserver(es => {
    visivel = es[0].isIntersecting;
    if (visivel) arrumar();
  }).observe(palco);
}

const angQuadro = POSES.map(p => Math.atan2(p[1], p[0]));
const difAng = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

function quadroDoAngulo(a) {
  let melhor = 0;
  let menor = 1e9;
  for (let i = 0; i < N; i++) {
    const d = Math.abs(difAng(angQuadro[i], a));
    if (d < menor) {
      menor = d;
      melhor = i;
    }
  }
  return melhor;
}

const modN = i => ((i % N) + N) % N;
let posLaco = quadroDoAngulo(Math.atan2(0.45, -0.55));

function obterGradeLuminancia(idx) {
  if (pixelCache.has(idx)) return pixelCache.get(idx);
  const im = imgs[idx];
  if (!pronto(im) || !offCtx) return null;

  try {
    offCtx.clearRect(0, 0, off.width, off.height);
    offCtx.drawImage(im, 0, 0, off.width, off.height);
    const data = offCtx.getImageData(0, 0, off.width, off.height).data;
    const grid = new Float32Array(off.width * off.height);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // Curva nítida: preserva sombras profundas e valoriza médios/altos tons
      const nitidez = Math.min(1, Math.max(0, (Math.pow(lum, 0.58) - 0.08) * 1.45));
      grid[p] = nitidez;
    }

    pixelCache.set(idx, grid);
    return grid;
  } catch (_) {
    return null;
  }
}

function desenharComposicao() {
  if (!ctx) return;
  ctx.clearRect(0, 0, larguraCss, alturaCss);

  const idxA = modN(Math.floor(posLaco));
  const idxB = modN(idxA + 1);
  const mistura = posLaco - Math.floor(posLaco);

  carregar(idxA);
  carregar(idxB);

  const gridA = obterGradeLuminancia(idxA) || obterGradeLuminancia(centro);
  const gridB = obterGradeLuminancia(idxB) || gridA;

  const passo = celular() ? 4.5 : 5;
  const margem = 18;
  const areaW = Math.max(120, larguraCss - margem * 2);
  const areaH = Math.max(120, alturaCss - margem * 2);

  const amostra = pronto(imgs[centro]) ? imgs[centro] : imgs.find(pronto);
  const aspectImg = amostra ? amostra.naturalWidth / amostra.naturalHeight : 16 / 9;
  const aspectArea = areaW / areaH;

  let drawW, drawH;
  if (aspectArea > aspectImg) {
    drawH = areaH * 0.92;
    drawW = drawH * aspectImg;
  } else {
    drawW = areaW * 0.95;
    drawH = drawW / aspectImg;
  }

  const offsetX = (larguraCss - drawW) * 0.5;
  const offsetY = (alturaCss - drawH) * 0.5;
  const raioLuz = Math.min(larguraCss, alturaCss) * 0.34;

  for (let y = offsetY; y <= offsetY + drawH; y += passo) {
    const v = (y - offsetY) / drawH;
    const py = Math.min(off.height - 1, Math.max(0, Math.floor(v * off.height)));

    for (let x = offsetX; x <= offsetX + drawW; x += passo) {
      const u = (x - offsetX) / drawW;
      const px = Math.min(off.width - 1, Math.max(0, Math.floor(u * off.width)));
      const pIndex = py * off.width + px;

      let intensidade = 0.12;
      if (gridA && gridB) {
        intensidade = gridA[pIndex] * (1 - mistura) + gridB[pIndex] * mistura;
      } else {
        const dx = (u - 0.5 + olhar.x * 0.08) * 2.2;
        const dy = (v - 0.48 - olhar.y * 0.08) * 2.2;
        intensidade = Math.max(0.08, 1 - Math.hypot(dx, dy) * 0.72);
      }

      if (intensidade < 0.09) continue;

      const distMouse = Math.hypot(x - ponteiro.x, y - ponteiro.y);
      const focoMouse = ponteiro.f * Math.exp(-(distMouse * distMouse) / (raioLuz * raioLuz));

      // Raio nítido proporcional ao brilho para definir contornos e traços faciais
      const raio = Math.max(0.75, passo * (0.08 + 0.34 * intensidade) * (1 + focoMouse * 0.25));
      const alfa = Math.min(0.98, 0.24 + intensidade * 0.74);

      ctx.beginPath();
      ctx.arc(x, y, raio, 0, Math.PI * 2);

      if (focoMouse > 0.14) {
        ctx.fillStyle = `rgba(255, 58, 42, ${Math.min(0.98, 0.42 + focoMouse * 0.56)})`;
      } else {
        ctx.fillStyle = `rgba(244, 241, 234, ${alfa.toFixed(3)})`;
      }
      ctx.fill();
    }
  }
}

const inicio = performance.now();
let antes = inicio;

function laco(agora) {
  requestAnimationFrame(laco);
  if (!visivel) {
    antes = agora;
    return;
  }

  const dt = Math.min(0.05, (agora - antes) / 1000);
  antes = agora;
  const tempoSeg = (agora - inicio) / 1000;

  const ocioso = !reduzir && agora - ultimoMov > 3500;
  ponteiro.f += ((ocioso ? 0 : ponteiro.ativo ? 1 : 0) - ponteiro.f) * (1 - Math.exp(-7 * dt));

  if (ocioso) {
    posLaco += dt * N / 14;
    olhar.x = Math.cos(tempoSeg * 0.7) * 0.45;
    olhar.y = Math.sin(tempoSeg * 0.7) * 0.45;
  } else if (!reduzir) {
    const suav = 1 - Math.exp(-6 * dt);
    olhar.x += (alvo.x - olhar.x) * suav;
    olhar.y += (alvo.y - olhar.y) * suav;

    if (Math.hypot(olhar.x, olhar.y) > 0.15) {
      const destino = quadroDoAngulo(Math.atan2(olhar.y, olhar.x));
      let delta = destino - modN(posLaco);
      if (delta > N / 2) delta -= N;
      if (delta < -N / 2) delta += N;
      const maxVel = N * 1.1;
      const passo = Math.max(-maxVel * dt, Math.min(maxVel * dt, delta * suav));
      posLaco += passo;
    }
  }

  desenharComposicao();
}

requestAnimationFrame(laco);