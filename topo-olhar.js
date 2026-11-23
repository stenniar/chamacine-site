// Quem Somos — composição animada e interativa que acompanha o cursor.
(() => {
  const palco = document.getElementById('palco-olhar');
  const canvas = document.getElementById('rosto');
  if (!palco || !canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const POSES = Array.isArray(window.POSES_OLHAR) && window.POSES_OLHAR.length
    ? window.POSES_OLHAR
    : Array.from({ length: 160 }, (_, i) => {
        const ang = (i / 160) * Math.PI * 2;
        return [Math.cos(ang), Math.sin(ang)];
      });

  const N = POSES.length;
  const quadro = i => `olhar/f_${String(i + 1).padStart(3, '0')}.jpg`;
  const celular = () => window.matchMedia('(max-width: 760px)').matches;
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d', { willReadFrequently: true });
  if (offCtx) {
    off.width = 240;
    off.height = 180;
  }

  const imgs = new Array(N);
  const pixelCache = new Map();
  let framesCarregados = 0;

  function carregar(i) {
    if (imgs[i]) return imgs[i];
    const im = new Image();
    im.decoding = 'async';
    im.addEventListener('load', () => {
      if (im.naturalWidth > 0) {
        framesCarregados++;
        pixelCache.delete(i);
      }
    }, { once: true });
    im.addEventListener('error', () => {
      imgs[i] = null;
    }, { once: true });
    im.src = quadro(i);
    imgs[i] = im;
    return im;
  }

  const pronto = im => Boolean(im && im.complete && im.naturalWidth > 0);
  const centro = POSES.reduce(
    (m, p, i) => (Math.hypot(p[0], p[1]) < Math.hypot(POSES[m][0], POSES[m][1]) ? i : m),
    0
  );

  carregar(centro);
  window.setTimeout(() => {
    for (let i = 0; i < N; i++) carregar(i);
  }, 150);

  let larguraCss = 480;
  let alturaCss = 400;
  let dpr = 1;

  function arrumar() {
    const rect = palco.getBoundingClientRect();
    larguraCss = Math.max(240, Math.round(rect.width || palco.clientWidth || 480));
    alturaCss = Math.max(240, Math.round(rect.height || palco.clientHeight || 400));
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.style.width = `${larguraCss}px`;
    canvas.style.height = `${alturaCss}px`;
    canvas.width = Math.max(1, Math.round(larguraCss * dpr));
    canvas.height = Math.max(1, Math.round(alturaCss * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  arrumar();
  window.addEventListener('resize', arrumar);
  window.addEventListener('load', arrumar);

  const alvo = { x: 0, y: 0 };
  const olhar = { x: 0, y: 0 };
  const ponteiro = { x: larguraCss * 0.5, y: alturaCss * 0.45, ativo: false, f: 0 };
  let ultimoMov = performance.now() - 5000;

  function apontar(cx, cy) {
    const r = palco.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const hx = r.left + r.width * 0.5;
    const hy = r.top + r.height * 0.48;

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
  document.addEventListener('pointerleave', () => {
    ponteiro.ativo = false;
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) arrumar();
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
    let menor = Infinity;
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
        const lum = 0.299 * (data[i] / 255) + 0.587 * (data[i + 1] / 255) + 0.114 * (data[i + 2] / 255);
        grid[p] = Math.min(1, Math.max(0, (Math.pow(lum, 0.55) - 0.06) * 1.55));
      }

      pixelCache.set(idx, grid);
      return grid;
    } catch (_) {
      return null;
    }
  }

  function intensidadeFallback(u, v, tempoSeg) {
    const cx = 0.5 + olhar.x * 0.06;
    const cy = 0.44 - olhar.y * 0.05;

    // Cabeça / busto estilizado nítido
    const dxCab = (u - cx) / 0.19;
    const dyCab = (v - (cy - 0.05)) / 0.23;
    const cabeca = Math.max(0, 1 - Math.hypot(dxCab, dyCab));

    const dxBusto = (u - cx) / 0.34;
    const dyBusto = (v - (cy + 0.29)) / 0.18;
    const busto = v > cy + 0.09 ? Math.max(0, 1 - Math.hypot(dxBusto, dyBusto)) * 0.72 : 0;

    // Olhos que acompanham o olhar
    const olhoShiftX = olhar.x * 0.032;
    const olhoShiftY = -olhar.y * 0.025;
    const olhoEsq = Math.exp(-((u - (cx - 0.065 + olhoShiftX)) ** 2 + (v - (cy - 0.06 + olhoShiftY)) ** 2) / 0.0009);
    const olhoDir = Math.exp(-((u - (cx + 0.065 + olhoShiftX)) ** 2 + (v - (cy - 0.06 + olhoShiftY)) ** 2) / 0.0009);

    const pulso = 0.92 + 0.08 * Math.sin(tempoSeg * 2.4 + u * 8 + v * 6);
    return Math.min(1, (cabeca * 0.85 + busto + (olhoEsq + olhoDir) * 0.95) * pulso);
  }

  function desenhar(tempoSeg) {
    if (larguraCss < 10 || alturaCss < 10) arrumar();
    ctx.clearRect(0, 0, larguraCss, alturaCss);

    const idxA = modN(Math.floor(posLaco));
    const idxB = modN(idxA + 1);
    const mistura = posLaco - Math.floor(posLaco);

    carregar(idxA);
    carregar(idxB);

    const gridA = obterGradeLuminancia(idxA) || obterGradeLuminancia(centro);
    const gridB = obterGradeLuminancia(idxB) || gridA;
    const temImagemReal = framesCarregados > 0 && Boolean(gridA && gridB);

    const passo = celular() ? 5.5 : 6;
    const margem = 18;
    const areaW = Math.max(120, larguraCss - margem * 2);
    const areaH = Math.max(120, alturaCss - margem * 2);

    const amostra = pronto(imgs[centro]) ? imgs[centro] : imgs.find(pronto);
    const aspectImg = amostra ? amostra.naturalWidth / amostra.naturalHeight : 4 / 3;
    const aspectArea = areaW / areaH;

    let drawW, drawH;
    if (aspectArea > aspectImg) {
      drawH = areaH * 0.9;
      drawW = drawH * aspectImg;
    } else {
      drawW = areaW * 0.92;
      drawH = drawW / aspectImg;
    }

    const offsetX = (larguraCss - drawW) * 0.5;
    const offsetY = (alturaCss - drawH) * 0.5;
    const raioLuz = Math.min(larguraCss, alturaCss) * 0.32;

    for (let y = offsetY; y <= offsetY + drawH; y += passo) {
      const v = (y - offsetY) / drawH;
      const py = offCtx ? Math.min(off.height - 1, Math.max(0, Math.floor(v * off.height))) : 0;

      for (let x = offsetX; x <= offsetX + drawW; x += passo) {
        const u = (x - offsetX) / drawW;

        let intensidade;
        if (temImagemReal && offCtx) {
          const px = Math.min(off.width - 1, Math.max(0, Math.floor(u * off.width)));
          const pIndex = py * off.width + px;
          intensidade = gridA[pIndex] * (1 - mistura) + gridB[pIndex] * mistura;
        } else {
          intensidade = intensidadeFallback(u, v, tempoSeg);
        }

        if (intensidade < 0.14) continue;

        const distMouse = Math.hypot(x - ponteiro.x, y - ponteiro.y);
        const focoMouse = ponteiro.f * Math.exp(-(distMouse * distMouse) / (raioLuz * raioLuz));

        const raio = Math.max(1.1, passo * (0.1 + 0.34 * intensidade) * (1 + focoMouse * 0.3));
        const alfa = Math.min(0.98, 0.28 + intensidade * 0.7);

        ctx.beginPath();
        ctx.arc(x, y, raio, 0, Math.PI * 2);

        if (focoMouse > 0.14) {
          ctx.fillStyle = `rgba(230, 35, 20, ${Math.min(0.98, 0.45 + focoMouse * 0.53)})`;
        } else {
          ctx.fillStyle = `rgba(244, 241, 234, ${alfa.toFixed(3)})`;
        }
        ctx.fill();
      }
    }

    // Anel indicador sutil acompanhando o olhar/cursor
    const anelX = larguraCss * 0.5 + olhar.x * (larguraCss * 0.22);
    const anelY = alturaCss * 0.46 - olhar.y * (alturaCss * 0.22);
    ctx.beginPath();
    ctx.arc(anelX, anelY, 18 + Math.sin(tempoSeg * 3) * 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(230, 35, 20, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const inicio = performance.now();
  let antes = inicio;

  function laco(agora) {
    requestAnimationFrame(laco);
    const dt = Math.min(0.05, Math.max(0.001, (agora - antes) / 1000));
    antes = agora;
    const tempoSeg = (agora - inicio) / 1000;

    const ocioso = !reduzir && agora - ultimoMov > 2500;
    ponteiro.f += ((ocioso ? 0.35 : ponteiro.ativo ? 1 : 0.25) - ponteiro.f) * (1 - Math.exp(-7 * dt));

    if (ocioso && !reduzir) {
      posLaco += dt * N / 12;
      olhar.x = Math.cos(tempoSeg * 0.85) * 0.55;
      olhar.y = Math.sin(tempoSeg * 0.85) * 0.45;
    } else if (!reduzir) {
      const suav = 1 - Math.exp(-7 * dt);
      olhar.x += (alvo.x - olhar.x) * suav;
      olhar.y += (alvo.y - olhar.y) * suav;

      if (Math.hypot(olhar.x, olhar.y) > 0.12) {
        const destino = quadroDoAngulo(Math.atan2(olhar.y, olhar.x));
        let delta = destino - modN(posLaco);
        if (delta > N / 2) delta -= N;
        if (delta < -N / 2) delta += N;
        const maxVel = N * 1.25;
        posLaco += Math.max(-maxVel * dt, Math.min(maxVel * dt, delta * suav));
      }
    }

    desenhar(tempoSeg);
  }

  requestAnimationFrame(laco);
})();