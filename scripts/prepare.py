"""Prepara os dados do console a partir de instâncias reais do 3W (Petrobras, CC-BY 4.0).

Para cada instância:
  1. reamostra a 10 s as variáveis-chave;
  2. calcula, em janelas de 5 min, a assinatura do poço em relação à própria linha de base
     (primeiros 20 min): deslocamento (z), oscilação (razão de desvio) e tendência;
  3. dispara alerta quando a anomalia combinada fica acima do limiar por 3 janelas seguidas;
  4. sugere o tipo de evento com um modelo treinado SEM aquela instância (leave-one-out)
     e lista os eventos mais parecidos da biblioteca (vizinhos mais próximos).

Uso: .venv/bin/python -I scripts/prepare.py data/raw web/data
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.neighbors import NearestNeighbors

VARS = ["P-PDG", "T-PDG", "P-TPT", "T-TPT", "P-ANULAR", "P-MON-CKP", "T-JUS-CKP", "P-JUS-CKGL", "QGL", "ABER-CKP"]
NAMES = {
    "P-PDG": "Pressão de fundo (PDG)", "T-PDG": "Temperatura de fundo (PDG)",
    "P-TPT": "Pressão na árvore (TPT)", "T-TPT": "Temperatura na árvore (TPT)",
    "P-ANULAR": "Pressão no anular", "P-MON-CKP": "Pressão antes do choke",
    "T-JUS-CKP": "Temperatura depois do choke", "P-JUS-CKGL": "Pressão do gas lift",
    "QGL": "Vazão de gas lift", "ABER-CKP": "Abertura do choke de produção",
}
UNITS = {v: ("°C" if v.startswith("T-") else "%" if v.startswith("ABER") else "m³/s" if v == "QGL" else "bar") for v in VARS}
EVENTS = {
    0: "Operação normal", 1: "Aumento abrupto de BSW", 2: "Fechamento espúrio da DHSV",
    3: "Golfada severa", 4: "Instabilidade de fluxo", 5: "Perda rápida de produtividade",
    6: "Restrição rápida no choke", 7: "Incrustação no choke", 8: "Hidrato na linha de produção",
    9: "Hidrato na linha de serviço",
}
STEP = "10s"
WIN = 30            # 30 amostras de 10 s = 5 min
BASE = 120          # 20 min de linha de base
THRESH = 3.0
SUSTAIN = 3
MAX_PASSOS = 2160   # 6 h em passos de 10 s


def load(path):
    d = pd.read_parquet(path)
    d = d[~d.index.duplicated()].sort_index()
    out = pd.DataFrame(index=d.resample(STEP).mean(numeric_only=True).index)
    for v in VARS:
        if v in d and d[v].notna().mean() > 0.9 and d[v].std() > 0:
            s = d[v].resample(STEP).mean()
            out[v] = s / 1e5 if UNITS[v] == "bar" else s
    out = out.ffill().bfill()
    out["label"] = d["class"].astype("float").resample(STEP).max()
    # Casos longos (dias) viram uma janela de 6 h: começa 100 min antes do primeiro rótulo de evento,
    # para o detector ver o trecho normal e depois o evento, sem arquivos de vários MB no navegador.
    if len(out) > MAX_PASSOS:
        ev = np.flatnonzero(out["label"].fillna(0).values % 100 > 0)
        ini = max(0, (ev[0] if len(ev) else 0) - 600)
        ini = min(ini, len(out) - MAX_PASSOS)
        out = out.iloc[ini:ini + MAX_PASSOS]
    return out


def signature(df, i):
    """Assinatura da janela que termina em i, relativa à linha de base do próprio poço."""
    base, win = df.iloc[:BASE], df.iloc[max(0, i - WIN):i]
    feats, contrib = [], {}
    for v in VARS:
        if v not in df:
            feats += [0.0, 0.0, 0.0]
            continue
        mu, sd = base[v].mean(), base[v].std()
        sd = sd if sd > 1e-9 else max(abs(mu) * 0.01, 1e-6)
        shift = (win[v].mean() - mu) / sd
        osc = np.log((win[v].std() + 1e-9) / sd)
        slope = np.polyfit(np.arange(len(win)), win[v].values, 1)[0] * WIN / sd if len(win) > 2 else 0.0
        f = [float(np.clip(shift, -50, 50)), float(np.clip(osc, -5, 5)), float(np.clip(slope, -50, 50))]
        feats += f
        contrib[v] = {"desvio": f[0], "oscilacao": f[1], "tendencia": f[2]}
    return np.array(feats), contrib


def score_of(contrib):
    return max([max(abs(c["desvio"]), abs(c["tendencia"]) * 0.7, max(c["oscilacao"], 0) * 2.5) for c in contrib.values()] or [0])


def main(raw, out):
    raw, out = Path(raw), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    files = sorted(raw.glob("*/*.parquet"))
    inst = []
    for f in files:
        df = load(f)
        well, stamp = f.stem.split("_")
        cls = int(f.parent.name)
        sigs = []
        for i in range(BASE + WIN, len(df), WIN // 3):
            s, c = signature(df, i)
            lab = df["label"].iloc[max(0, i - WIN):i]
            lab = lab[lab.notna()]
            y = int(lab.mode().iloc[0]) % 100 if len(lab) else None
            sigs.append({"i": i, "x": s, "c": c, "score": score_of(c), "y": y})
        inst.append({"id": f"{well}_{stamp}", "well": well, "stamp": stamp, "cls": cls, "df": df, "sigs": sigs})
        print("ok", f.name, len(df), "janelas", len(sigs))

    index = []
    for k, it in enumerate(inst):
        # Biblioteca: janelas rotuladas como evento (não normais) de TODAS as outras instâncias,
        # inclusive do mesmo poço, como seria o histórico da sala de controle. A instância em replay fica de fora.
        lib = [(o, s) for o in inst if o["id"] != it["id"] for s in o["sigs"] if s["y"] not in (None, 0) and s["score"] >= THRESH / 2]
        X = np.array([s["x"] for _, s in lib])
        y = np.array([s["y"] for _, s in lib])
        clf = RandomForestClassifier(n_estimators=150, max_depth=8, random_state=0, class_weight="balanced").fit(X, y)
        nn = NearestNeighbors(n_neighbors=min(40, len(X))).fit(X)

        alerts, run = [], 0
        for s in it["sigs"]:
            run = run + 1 if s["score"] >= THRESH else 0
            if run == SUSTAIN and (not alerts or s["i"] - alerts[-1]["i"] > WIN * 4):
                p = clf.predict_proba([s["x"]])[0]
                order = np.argsort(p)[::-1][:3]
                sugest = [{"evento": EVENTS[int(clf.classes_[j])], "codigo": int(clf.classes_[j]), "prob": round(float(p[j]), 2)} for j in order]
                _, idx = nn.kneighbors([s["x"]])
                seen, similares = set(), []
                for j in idx[0]:
                    o, ss = lib[j]
                    if o["id"] in seen:
                        continue
                    seen.add(o["id"])
                    similares.append({"instancia": o["id"], "poco": o["well"], "evento": EVENTS[ss["y"]],
                                      "quando": str(o["df"].index[ss["i"] - 1])[:16]})
                    if len(similares) == 4:
                        break
                motivos = sorted(
                    [{"var": v, "nome": NAMES[v], **{k2: round(v2, 2) for k2, v2 in c.items()},
                      "peso": round(max(abs(c["desvio"]), abs(c["tendencia"]) * 0.7, max(c["oscilacao"], 0) * 2.5), 2)}
                     for v, c in s["c"].items()], key=lambda m: -m["peso"])[:4]
                alerts.append({"i": s["i"], "t": str(it["df"].index[s["i"] - 1]), "score": round(s["score"], 1),
                               "sugestao": sugest, "motivos": motivos, "similares": similares, "rotulo_real": s["y"]})

        df = it["df"]
        series = {v: [None if pd.isna(x) else round(float(x), 4) for x in df[v]] for v in VARS if v in df}
        scores = [None] * len(df)
        for s in it["sigs"]:
            scores[s["i"] - 1] = round(s["score"], 2)
        payload = {
            "id": it["id"], "poco": it["well"], "inicio": str(df.index[0]), "passo_s": 10,
            "evento_rotulado": EVENTS[it["cls"]], "codigo_rotulado": it["cls"],
            "variaveis": [{"var": v, "nome": NAMES[v], "unidade": UNITS[v]} for v in series],
            "series": series, "score": scores, "limiar": THRESH,
            "rotulo": [None if pd.isna(x) else int(x) % 100 for x in df["label"]],
            "alertas": alerts,
        }
        (out / f"{it['id']}.json").write_text(json.dumps(payload, ensure_ascii=False))
        index.append({"id": it["id"], "poco": it["well"], "inicio": str(df.index[0])[:16], "duracao_min": round(len(df) / 6),
                      "evento_rotulado": EVENTS[it["cls"]], "codigo_rotulado": it["cls"], "alertas": len(alerts),
                      "primeiro_alerta": alerts[0]["sugestao"][0]["evento"] if alerts else None})
        print("pronto", it["id"], "alertas", len(alerts), [a["sugestao"][0]["evento"] for a in alerts])
    (out / "index.json").write_text(json.dumps({"eventos": EVENTS, "instancias": index}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
