"""
Gera ferramentas/amostras-teste.json: um recorte do conjunto de TESTE do
MNIST (nunca visto no treino) usado por testar-reconhecimento.html para
medir, dentro do próprio navegador, a taxa de acerto do reconhecimento
(Critério de Aceitação: mínimo de 80%).

  cd math-kids/ferramentas
  python gerar_amostras_teste.py
"""
import base64
import json
import os

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
NPZ = os.path.join(AQUI, ".cache", "mnist.npz")
SAIDA = os.path.join(AQUI, "amostras-teste.json")
QTD = 600

if not os.path.exists(NPZ):
    raise SystemExit("Rode treinar_modelo.py antes (ele baixa o MNIST para .cache/).")

with np.load(NPZ) as d:
    x_te, y_te = d["x_test"], d["y_test"]

rng = np.random.default_rng(7)
idx = rng.choice(len(x_te), size=QTD, replace=False)
imgs = x_te[idx].astype(np.uint8)          # (QTD, 28, 28)
labels = y_te[idx].astype(np.uint8)

payload = {
    "n": QTD,
    "lado": 28,
    "labels": "".join(str(int(v)) for v in labels),
    "dados_b64": base64.b64encode(imgs.tobytes()).decode("ascii"),
    "fonte": "MNIST test split (holdout) — proxy automatizado; complementar com teste manual com crianças",
}
with open(SAIDA, "w", encoding="utf-8") as f:
    json.dump(payload, f, separators=(",", ":"))
print(f"OK -> {os.path.relpath(SAIDA, AQUI)}  ({os.path.getsize(SAIDA)/1024:.0f} KB, {QTD} amostras)")
