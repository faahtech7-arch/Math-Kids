/*
  =========================================================================
  Math Kids — Reconhecimento de dígitos desenhados à mão (0–9)
  =========================================================================
  Requisito Funcional: "Reconhecimento de escrita (dígitos desenhados à mão)".
  Requisito Não Funcional: taxa mínima de acerto de 80%.

  Como funciona (100% no navegador, sem biblioteca externa, roda em PC e
  celular):
    1. O traço da criança é lido de um <canvas>.
    2. Pré-processamento igual ao do MNIST: recorta o dígito, redimensiona
       para caber numa caixa de 20px, centraliza numa tela 28x28 pelo
       centro de massa e suaviza levemente.
    3. Inferência de uma MLP 784->128->10 (pesos em js/modelo-mnist.json,
       quantizados em int8). Ver ferramentas/treinar_modelo.py.

  API:
    const rec = await criarReconhecedor("js/modelo-mnist.json");
    const r = rec.classificar(canvas);
    // r = { digito, confianca, margem, incerto, vazio, probs }
  =========================================================================
*/

const LIMIAR_TINTA = 28;      // alpha mínimo p/ considerar "tem traço"
const CONF_MIN = 0.60;        // abaixo disso pedimos p/ reescrever
const MARGEM_MIN = 0.14;      // diferença mínima entre 1º e 2º palpite

function base64ParaInt8(b64) {
  const bin = atob(b64);
  const arr = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) << 24 >> 24;
  return arr;
}

function relu(v) { return v > 0 ? v : 0; }

class Reconhecedor {
  constructor(modelo) {
    this.modelo = modelo;
    this.camadas = modelo.camadas.map((c) => ({
      in: c.in,
      out: c.out,
      ativacao: c.ativacao,
      escala: c.w_escala,
      w: base64ParaInt8(c.w_b64),   // int8, layout [in, out] linha-a-linha
      b: Float32Array.from(c.b),
    }));
    // canvas auxiliares reaproveitados a cada classificação
    this._c1 = document.createElement("canvas");
    this._c2 = document.createElement("canvas");
  }

  /* ---- extrai a matriz de "tinta" (0..255) e a caixa que a contém ---- */
  _lerTinta(fonte) {
    const w = fonte.width, h = fonte.height;
    this._c1.width = w; this._c1.height = h;
    const ctx = this._c1.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(fonte, 0, 0);
    const px = ctx.getImageData(0, 0, w, h).data;

    const tinta = new Float32Array(w * h);
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = px[i + 3];
        // traço escuro sobre fundo transparente/claro: usa alpha e escuridão
        const escuro = a === 0 ? 0 : (255 - (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]));
        const v = Math.max(a, escuro * (a / 255));
        tinta[y * w + x] = v;
        if (v > LIMIAR_TINTA) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    return { tinta, w, h, minX, minY, maxX, maxY, vazio: maxX < 0 };
  }

  /* ---- pré-processa p/ o vetor 784 no formato MNIST ---- */
  _preprocessar(fonte) {
    const t = this._lerTinta(fonte);
    if (t.vazio) return null;

    const caixa = this.modelo.preprocess?.caixa ?? 20;
    const tela = this.modelo.preprocess?.tela ?? 28;

    const larg = t.maxX - t.minX + 1;
    const alt = t.maxY - t.minY + 1;
    const escala = caixa / Math.max(larg, alt);
    const dw = Math.max(1, Math.round(larg * escala));
    const dh = Math.max(1, Math.round(alt * escala));

    // recorta a caixa da tinta para um canvas e deixa o browser reamostrar
    const rec = document.createElement("canvas");
    rec.width = larg; rec.height = alt;
    const rctx = rec.getContext("2d");
    const img = rctx.createImageData(larg, alt);
    for (let y = 0; y < alt; y++) {
      for (let x = 0; x < larg; x++) {
        const v = t.tinta[(t.minY + y) * t.w + (t.minX + x)];
        const j = (y * larg + x) * 4;
        img.data[j] = img.data[j + 1] = img.data[j + 2] = 255;
        img.data[j + 3] = v;                    // tinta vira alpha
      }
    }
    rctx.putImageData(img, 0, 0);

    this._c2.width = dw; this._c2.height = dh;
    const sctx = this._c2.getContext("2d", { willReadFrequently: true });
    sctx.clearRect(0, 0, dw, dh);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(rec, 0, 0, dw, dh);
    const sd = sctx.getImageData(0, 0, dw, dh).data;

    // grade dw x dh de tinta reamostrada
    const peq = new Float32Array(dw * dh);
    let somaMassa = 0, comX = 0, comY = 0;
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const v = sd[(y * dw + x) * 4 + 3];
        peq[y * dw + x] = v;
        somaMassa += v; comX += v * x; comY += v * y;
      }
    }
    comX = somaMassa ? comX / somaMassa : dw / 2;
    comY = somaMassa ? comY / somaMassa : dh / 2;

    // cola em 28x28 centralizado pelo centro de massa (convenção MNIST)
    const grade = new Float32Array(tela * tela);
    const offX = Math.round(tela / 2 - comX);
    const offY = Math.round(tela / 2 - comY);
    for (let y = 0; y < dh; y++) {
      const gy = y + offY;
      if (gy < 0 || gy >= tela) continue;
      for (let x = 0; x < dw; x++) {
        const gx = x + offX;
        if (gx < 0 || gx >= tela) continue;
        grade[gy * tela + gx] = peq[y * dw + x];
      }
    }

    // suavização 3x3 leve (aproxima o antialiasing das amostras MNIST)
    if (this.modelo.preprocess?.blur) {
      const k = [1, 2, 1, 2, 4, 2, 1, 2, 1], soma = 16;
      const out = new Float32Array(tela * tela);
      for (let y = 0; y < tela; y++) {
        for (let x = 0; x < tela; x++) {
          let acc = 0, ki = 0;
          for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++, ki++) {
              const yy = y + j, xx = x + i;
              if (yy < 0 || yy >= tela || xx < 0 || xx >= tela) { continue; }
              acc += grade[yy * tela + xx] * k[ki];
            }
          }
          out[y * tela + x] = acc / soma;
        }
      }
      grade.set(out);
    }

    const escEnt = this.modelo.preprocess?.escala_entrada ?? 255;
    const vet = new Float32Array(tela * tela);
    for (let i = 0; i < vet.length; i++) vet[i] = grade[i] / escEnt;
    return vet;
  }

  _forward(entrada) {
    let a = entrada;
    for (const c of this.camadas) {
      const z = new Float32Array(c.out);
      for (let j = 0; j < c.out; j++) z[j] = c.b[j];
      for (let i = 0; i < c.in; i++) {
        const ai = a[i];
        if (ai === 0) continue;
        const linha = i * c.out;
        for (let j = 0; j < c.out; j++) z[j] += ai * c.w[linha + j] * c.escala;
      }
      if (c.ativacao === "relu") {
        for (let j = 0; j < c.out; j++) z[j] = relu(z[j]);
        a = z;
      } else { // softmax
        let mx = -Infinity;
        for (let j = 0; j < c.out; j++) if (z[j] > mx) mx = z[j];
        let s = 0;
        for (let j = 0; j < c.out; j++) { z[j] = Math.exp(z[j] - mx); s += z[j]; }
        for (let j = 0; j < c.out; j++) z[j] /= s;
        a = z;
      }
    }
    return a;
  }

  /* ---- API pública ---- */
  classificar(fonte) {
    const entrada = this._preprocessar(fonte);
    if (!entrada) return { digito: null, vazio: true, confianca: 0, margem: 0, incerto: true, probs: null };

    const probs = this._forward(entrada);
    // 1º palpite (argmax) e 2º palpite (melhor dos demais). i2 começa em -1 pra
    // nunca colidir com i1: se começasse em 0, um dígito lido como 0 ficava com
    // i2 === i1, margem fixa em 0 e caía sempre no "incerto" (o 0 nunca entrava).
    let i1 = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[i1]) i1 = i;
    let i2 = -1;
    for (let i = 0; i < probs.length; i++) {
      if (i === i1) continue;
      if (i2 < 0 || probs[i] > probs[i2]) i2 = i;
    }
    const confianca = probs[i1];
    const margem = confianca - probs[i2];
    return {
      digito: i1,
      confianca,
      margem,
      incerto: confianca < CONF_MIN || margem < MARGEM_MIN,
      vazio: false,
      probs: Array.from(probs),
    };
  }
}

export async function criarReconhecedor(url = "js/modelo-mnist.json") {
  const resp = await fetch(url, { cache: "force-cache" });
  if (!resp.ok) throw new Error("Falha ao carregar o modelo de reconhecimento (" + resp.status + ")");
  const modelo = await resp.json();
  return new Reconhecedor(modelo);
}
