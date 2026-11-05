"""Monta a frota offshore a partir de dados abertos da ANP.

Entradas (data/raw-anp):
  - tabela-pocos.csv              Acervo de dados técnicos (BDEP): coordenadas de cada poço (SIRGAS2000).
  - prod/AAAA_MM_producao_Mar.csv Produção mensal por poço no mar, com a instalação de destino.

Saída: web/data/frota.json com uma entrada por instalação de produção marítima:
  posição aproximada (mediana das coordenadas dos poços que produzem para ela), operador, bacia,
  campos, número de poços, óleo, gás e água por dia, BSW e horas produzidas no mês.

Uso: .venv/bin/python -I scripts/anp.py data/raw-anp web/data
"""
import json
import sys
from pathlib import Path

import pandas as pd


def ler(path):
    for enc in ("utf-8-sig", "latin1"):
        try:
            return pd.read_csv(path, sep=";", encoding=enc, dtype=str, low_memory=False)
        except UnicodeDecodeError:
            continue
    raise SystemExit(f"não consegui ler {path}")


def num(s):
    return pd.to_numeric(s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False), errors="coerce").fillna(0)


def main(raw, out):
    raw, out = Path(raw), Path(out)
    pocos = ler(raw / "tabela-pocos.csv")
    pocos["lat"] = num(pocos["LATITUDE_BASE_DD"].fillna("").str.replace(".", ",", regex=False)).where(lambda x: x != 0)
    pocos["lon"] = num(pocos["LONGITUDE_BASE_DD"].fillna("").str.replace(".", ",", regex=False)).where(lambda x: x != 0)
    pocos = pocos[["POCO", "lat", "lon", "LAMINA_D_AGUA_M"]].dropna(subset=["lat", "lon"])

    arq = sorted((raw / "prod").glob("*_producao_Mar.csv"))[-1]
    periodo = arq.name[:7].replace("_", "-")
    p = ler(arq)
    col = {c: c.strip() for c in p.columns}
    p = p.rename(columns=col)
    p["oleo"] = num(p["Petróleo (bbl/dia)"])
    p["gas"] = num(p["Gás Natural (Mm³/dia) Total"])
    p["agua"] = num(p["Água (bbl/dia)"])
    p["horas"] = num(p["Tempo de Produção (hs por mês)"])
    p = p[p["Instalação Destino"].notna() & (p["horas"] > 0)]
    # Um poço pode ter mais de uma linha por instalação (contratos/correntes): soma volumes, fica com as horas máximas.
    chave = ["Instalação Destino", "Nome Poço ANP"]
    extra = p.groupby(chave, as_index=False).agg({c: "first" for c in ["Tipo Instalação", "Operador", "Bacia", "Campo"]})
    p = p.groupby(chave, as_index=False).agg(oleo=("oleo", "sum"), gas=("gas", "sum"), agua=("agua", "sum"), horas=("horas", "max")).merge(extra, on=chave)
    p = p.merge(pocos, left_on="Nome Poço ANP", right_on="POCO", how="left")
    p["lamina"] = num(p["LAMINA_D_AGUA_M"].fillna("0"))

    dias = pd.Period(periodo).days_in_month
    frota = []
    for inst, g in p.groupby("Instalação Destino"):
        geo = g.dropna(subset=["lat", "lon"])
        if geo.empty:
            continue
        oleo, agua = g["oleo"].sum(), g["agua"].sum()
        disp = (g["horas"] / (dias * 24)).clip(upper=1)
        frota.append({
            "instalacao": inst.strip(), "tipo": (g["Tipo Instalação"].mode().iloc[0] if g["Tipo Instalação"].notna().any() else "").strip(),
            "operador": g["Operador"].mode().iloc[0].strip(), "bacia": g["Bacia"].mode().iloc[0].strip(),
            "campos": sorted({c.strip() for c in g["Campo"].dropna()}),
            "lat": round(float(geo["lat"].median()), 4), "lon": round(float(geo["lon"].median()), 4),
            "lamina_m": int(geo["lamina"].median()) if geo["lamina"].median() > 0 else None,
            "pocos": int(g["Nome Poço ANP"].nunique()),
            "pocos_com_parada": int((disp < 0.9).sum()),
            "oleo_bbl_d": round(float(oleo)), "gas_mil_m3_d": round(float(g["gas"].sum()), 1), "agua_bbl_d": round(float(agua)),
            "bsw": round(float(agua / (agua + oleo)), 3) if oleo + agua > 0 else None,
            "disponibilidade": round(float(disp.mean()), 3),
            "pior_poco": None if disp.min() >= 0.9 else {
                "poco": g.loc[disp.idxmin(), "Nome Poço ANP"].strip(), "horas": int(g.loc[disp.idxmin(), "horas"])},
        })
    frota.sort(key=lambda f: -f["oleo_bbl_d"])
    (out / "frota.json").write_text(json.dumps({"periodo": periodo, "fonte": "ANP – produção por poço (mar) e tabela de poços do BDEP",
                                                "instalacoes": frota}, ensure_ascii=False))
    print(periodo, len(frota), "instalações;", sum(f["oleo_bbl_d"] for f in frota), "bbl/d")
    for f in frota[:8]:
        print(f["instalacao"], f["operador"], f["lat"], f["lon"], f["oleo_bbl_d"], f["pocos"], f["disponibilidade"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
