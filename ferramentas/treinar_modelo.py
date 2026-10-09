"""
=========================================================================
Math Kids - Treino do modelo de reconhecimento de digitos (0-9)
=========================================================================
Gera o arquivo js/modelo-mnist.json usado pelo reconhecimento no navegador.

Requisitos (Requisito Nao Funcional - taxa minima de acerto de 80%):
  - MLP pequena (784 -> 128 -> 10) treinada no MNIST.
  - Precisao de teste tipica: ~97-98% (folga grande sobre os 80% exigidos).
  - Pesos exportados quantizados em int8 -> JSON leve (~130 KB), sem
    dependencia de runtime no front-end (inferencia e JS puro).

Como rodar (uma unica vez, ou quando quiser re-treinar):
  cd math-kids/ferramentas
  python -m pip install numpy
  python treinar_modelo.py

O MNIST (~11 MB) e baixado 1x para .cache/ ao lado deste script.
=========================================================================
"""

import base64
import gzip
import json
import os
import struct
import urllib.request

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(AQUI, ".cache")
SAIDA = os.path.join(AQUI, "..", "js", "modelo-mnist.json")

MNIST_URL = "https://storage.googleapis.com/tensorflow/tf-keras-datasets/mnist.npz"

RNG = np.random.default_rng(42)

# ---------------------------------------------------------------------------
# 1) Dados
# ---------------------------------------------------------------------------
def carregar_mnist():
    os.makedirs(CACHE, exist_ok=True)
    npz = os.path.join(CACHE, "mnist.npz")
    if not os.path.exists(npz):
        print("Baixando MNIST (~11 MB)...")
        urllib.request.urlretrieve(MNIST_URL, npz)
    with np.load(npz) as d:
        x_tr, y_tr = d["x_train"], d["y_train"]
        x_te, y_te = d["x_test"], d["y_test"]
    return x_tr, y_tr, x_te, y_te


def augmentar(imgs28):
    """Pequenas translacoes/rotacoes para aproximar da escrita real da crianca
    (traco grosso, digito nem sempre centralizado)."""
    n = imgs28.shape[0]
    out = np.empty_like(imgs28)
    for i in range(n):
        img = imgs28[i]
        # translacao +-2px
        dx, dy = RNG.integers(-2, 3, size=2)
        img = np.roll(img, (dy, dx), axis=(0, 1))
        if dy > 0: img[:dy, :] = 0
        elif dy < 0: img[dy:, :] = 0
        if dx > 0: img[:, :dx] = 0
        elif dx < 0: img[:, dx:] = 0
        # rotacao pequena +-12 graus (amostragem nearest, sem libs extras)
        ang = np.deg2rad(RNG.uniform(-12, 12))
        ca, sa = np.cos(ang), np.sin(ang)
        ys, xs = np.mgrid[0:28, 0:28].astype(np.float32)
        cy = cx = 13.5
        xr = ca * (xs - cx) - sa * (ys - cy) + cx
        yr = sa * (xs - cx) + ca * (ys - cy) + cy
        xr = np.clip(np.round(xr), 0, 27).astype(np.int32)
        yr = np.clip(np.round(yr), 0, 27).astype(np.int32)
        out[i] = img[yr, xr]
    return out


# ---------------------------------------------------------------------------
# 2) Modelo: MLP 784 -> 128 (ReLU) -> 10 (softmax), treino com Adam + dropout
# ---------------------------------------------------------------------------
class MLP:
    def __init__(self, ni=784, nh=128, no=10):
        self.W1 = (RNG.standard_normal((ni, nh)) * np.sqrt(2 / ni)).astype(np.float32)
        self.b1 = np.zeros(nh, np.float32)
        self.W2 = (RNG.standard_normal((nh, no)) * np.sqrt(2 / nh)).astype(np.float32)
        self.b2 = np.zeros(no, np.float32)
        self._m = {k: np.zeros_like(getattr(self, k)) for k in ("W1", "b1", "W2", "b2")}
        self._v = {k: np.zeros_like(getattr(self, k)) for k in ("W1", "b1", "W2", "b2")}
        self._t = 0

    def forward(self, x, treino=False, p_drop=0.15):
        z1 = x @ self.W1 + self.b1
        a1 = np.maximum(z1, 0)
        if treino:
            mask = (RNG.random(a1.shape) > p_drop).astype(np.float32) / (1 - p_drop)
            a1 *= mask
            self._mask = mask
        z2 = a1 @ self.W2 + self.b2
        z2 -= z2.max(axis=1, keepdims=True)
        e = np.exp(z2)
        sm = e / e.sum(axis=1, keepdims=True)
        self._cache = (x, z1, a1)
        return sm

    def backward(self, sm, y1h):
        x, z1, a1 = self._cache
        n = x.shape[0]
        dz2 = (sm - y1h) / n
        dW2 = a1.T @ dz2
        db2 = dz2.sum(0)
        da1 = dz2 @ self.W2.T
        da1 *= self._mask
        dz1 = da1 * (z1 > 0)
        dW1 = x.T @ dz1
        db1 = dz1.sum(0)
        return {"W1": dW1, "b1": db1, "W2": dW2, "b2": db2}

    def passo_adam(self, g, lr=1e-3, b1=0.9, b2=0.999, eps=1e-8, wd=1e-4):
        self._t += 1
        for k, gk in g.items():
            if k.startswith("W"):
                gk = gk + wd * getattr(self, k)  # weight decay
            self._m[k] = b1 * self._m[k] + (1 - b1) * gk
            self._v[k] = b2 * self._v[k] + (1 - b2) * (gk * gk)
            mhat = self._m[k] / (1 - b1 ** self._t)
            vhat = self._v[k] / (1 - b2 ** self._t)
            setattr(self, k, getattr(self, k) - lr * mhat / (np.sqrt(vhat) + eps))


def acuracia(modelo, x, y):
    pred = modelo.forward(x).argmax(1)
    return float((pred == y).mean())


# ---------------------------------------------------------------------------
# 3) Exportacao quantizada (int8) para JSON
# ---------------------------------------------------------------------------
def quantizar(W):
    escala = float(np.abs(W).max()) / 127.0 or 1.0
    q = np.clip(np.round(W / escala), -127, 127).astype(np.int8)
    b64 = base64.b64encode(q.tobytes()).decode("ascii")
    return escala, b64


def exportar(modelo, acc_teste):
    e1, w1 = quantizar(modelo.W1)
    e2, w2 = quantizar(modelo.W2)
    modelo_json = {
        "formato": "mlp-relu-softmax",
        "gerado_por": "ferramentas/treinar_modelo.py",
        "acuracia_teste": round(acc_teste, 4),
        "preprocess": {"caixa": 20, "tela": 28, "blur": True, "escala_entrada": 255.0},
        "camadas": [
            {"in": 784, "out": 128, "ativacao": "relu",
             "w_escala": e1, "w_b64": w1, "b": [float(v) for v in modelo.b1]},
            {"in": 128, "out": 10, "ativacao": "softmax",
             "w_escala": e2, "w_b64": w2, "b": [float(v) for v in modelo.b2]},
        ],
    }
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(modelo_json, f, separators=(",", ":"))
    kb = os.path.getsize(SAIDA) / 1024
    print(f"OK -> {os.path.relpath(SAIDA, AQUI)}  ({kb:.0f} KB)  acuracia_teste={acc_teste:.4f}")


# ---------------------------------------------------------------------------
def main():
    x_tr, y_tr, x_te, y_te = carregar_mnist()
    x_te_f = (x_te.reshape(-1, 784) / 255.0).astype(np.float32)

    modelo = MLP()
    epocas, lote = 18, 128
    idx = np.arange(len(x_tr))
    for ep in range(1, epocas + 1):
        RNG.shuffle(idx)
        for i in range(0, len(idx), lote):
            b = idx[i:i + lote]
            imgs = x_tr[b].astype(np.float32)
            if ep <= epocas - 3:                     # ultimas epocas sem augment
                imgs = augmentar(imgs.astype(np.int16)).astype(np.float32)
            xb = (imgs.reshape(-1, 784) / 255.0)
            y1h = np.eye(10, dtype=np.float32)[y_tr[b]]
            sm = modelo.forward(xb, treino=True)
            modelo.passo_adam(modelo.backward(sm, y1h),
                              lr=1e-3 if ep <= 12 else 3e-4)
        acc = acuracia(modelo, x_te_f, y_te)
        print(f"epoca {ep:2d}/{epocas}  acuracia_teste={acc:.4f}")

    acc = acuracia(modelo, x_te_f, y_te)
    if acc < 0.80:
        raise SystemExit(f"ERRO: acuracia {acc:.3f} abaixo do minimo de 0.80 exigido no escopo.")
    exportar(modelo, acc)


if __name__ == "__main__":
    main()
