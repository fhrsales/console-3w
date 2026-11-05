"""Monta a frota offshore a partir de dados abertos da ANP (fase de desenvolvimento e produção).

Entradas (data/raw-anp):
  - producao-mar-AAAA.csv     Produção mensal por poço no mar, com a instalação (volumes do mês, m³ e mil m³).
  - plataformas-operacao.csv  Plataformas em operação: posição, tipo, operador, lâmina d'água e capacidade.
  - tabela-pocos.csv          Acervo do BDEP: coordenadas dos poços (só para instalações fora da lista acima).

Saída: web/data/frota.json com uma entrada por instalação marítima no último mês do arquivo.
Não há horas de produção nos dados novos; a referência de cada poço e de cada instalação é a própria média
diária dos meses anteriores do ano ("normal"). Assim:
  - disponibilidade   = produção do mês / média dos meses anteriores (em barris de óleo equivalente por dia);
  - pocos_com_parada  = poços abaixo de 70% da própria média;
  - pior_poco         = poço mais abaixo da própria média.

Fontes: https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/fase-de-desenvolvimento-e-producao
Uso: .venv/bin/python -I scripts/anp.py data/raw-anp web/data
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd

M3_BBL = 6.2898  # barris por metro cúbico
LIMIAR = 0.7     # poço "abaixo do normal" quando produz menos de 70% da própria média


def chave(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]", "", s)


def num(s):
    return pd.to_numeric(s.fillna("").str.replace(".", "", regex=False).str.replace(",", ".", regex=False), errors="coerce").fillna(0.0)


def num1(v):
    return float(num(pd.Series([v]))[0])


def ler(path, sep=","):
    df = pd.read_csv(path, sep=sep, encoding="utf-8-sig", dtype=str, low_memory=False)
    df.columns = [c.strip().strip("[]") for c in df.columns]
    return df


def tipo_curto(c):
    c = (c or "").strip()
    if "FPSO" in c: return "FPSO"
    if "Fixa" in c or "Jaqueta" in c: return "Plataforma fixa"
    if "Semi" in c: return "Semissubmersível"
    if "Tension" in c or "TLP" in c: return "TLP"
    return c or "Instalação"


def main(raw, out):
    raw, out = Path(raw), Path(out)
    arq = sorted(raw.glob("producao-mar-*.csv"))[-1]
    p = ler(arq)
    p["mes"] = pd.PeriodIndex(pd.to_datetime(p["Mês/Ano"], format="%m/%Y"), freq="M")
    dias = p["mes"].dt.days_in_month
    p["oleo"] = (num(p["Produção de Óleo (m³)"]) + num(p["Produção de Condensado (m³)"])) * M3_BBL / dias
    p["gas"] = (num(p["Produção de Gás Associado (Mm³)"]) + num(p["Produção de Gás Não Associado (Mm³)"])) / dias
    p["agua"] = num(p["Produção de Água (m³)"]) * M3_BBL / dias
    p["boe"] = p["oleo"] + p["gas"] * M3_BBL  # mil m³ de gás ≈ 1 m³ de óleo equivalente
    p = p[p["Instalação"].notna()]

    ultimo = p["mes"].max()
    atual = p[p["mes"] == ultimo]
    antes = p[p["mes"] < ultimo]

    # Normal de cada poço: média diária nos meses anteriores em que ele aparece.
    normal_poco = antes.groupby("Poço")["boe"].mean()
    # Normal da instalação: média dos totais diários dos meses anteriores.
    normal_inst = antes.groupby(["Instalação", "mes"])["boe"].sum().groupby("Instalação").mean()

    lista = ler(raw / "plataformas-operacao.csv")
    lista["k"] = lista["NOME DA INSTALAÇÃO"].map(chave)
    lista = lista.drop_duplicates("k").set_index("k")

    pocos_geo = None
    if (raw / "tabela-pocos.csv").exists():
        for enc in ("utf-8-sig", "latin1"):
            try:
                pocos_geo = pd.read_csv(raw / "tabela-pocos.csv", sep=";", encoding=enc, dtype=str, low_memory=False)
                break
            except UnicodeDecodeError:
                continue
        pocos_geo.columns = [c.strip().lstrip("\ufeff").lstrip("ï»¿") for c in pocos_geo.columns]
        for c, d in (("LATITUDE_BASE_DD", "lat"), ("LONGITUDE_BASE_DD", "lon")):
            pocos_geo[d] = pd.to_numeric(pocos_geo[c].str.replace(",", ".", regex=False), errors="coerce")
        pocos_geo = pocos_geo.dropna(subset=["lat", "lon"]).drop_duplicates("POCO").set_index("POCO")[["lat", "lon"]]

    frota = []
    for inst, g in atual.groupby("Instalação"):
        k = chave(inst)
        info = lista.loc[k] if k in lista.index else None
        if info is not None:
            lat, lon = num1(info["LATITUDE"]), num1(info["LONGITUDE"])
        elif pocos_geo is not None:
            geo = pocos_geo.reindex(g["Poço"].unique()).dropna()
            if geo.empty:
                continue
            lat, lon = float(geo["lat"].median()), float(geo["lon"].median())
        else:
            continue
        por_poco = g.groupby("Poço")["boe"].sum()
        ref_poco = normal_poco.reindex(por_poco.index)
        razao = (por_poco / ref_poco)[ref_poco > 0]
        oleo, agua, gas = g["oleo"].sum(), g["agua"].sum(), g["gas"].sum()
        ref = normal_inst.get(inst)
        desempenho = float(g["boe"].sum() / ref) if ref and ref > 0 else None
        pior = razao.idxmin() if len(razao) and razao.min() < LIMIAR else None
        cap = num1(info["CAPACIDADE DE PRODUÇÃO DE PETRÓLEO (bbl/d)"]) if info is not None else 0
        lamina = num1(info["LÂMINA D'ÁGUA (m)"]) if info is not None else 0
        ano = str(info["ANO DE INÍCIO DE OPERAÇÃO"]).strip() if info is not None else ""
        frota.append({
            "instalacao": inst.strip(),
            "tipo": tipo_curto(info["CLASSIFICAÇÃO"] if info is not None else ""),
            "operador": (info["OPERADOR"].split(" - ")[-1].strip().title() if info is not None else "—"),
            "bacia": g["Bacia"].mode().iloc[0].strip(),
            "campos": sorted({c.strip() for c in g["Campo"].dropna()}),
            "lat": round(lat, 4), "lon": round(lon, 4),
            "lamina_m": int(lamina) if lamina > 0 else None,
            "inicio": int(ano) if ano.isdigit() else None,
            "capacidade_bbl_d": int(cap) if cap > 0 else None,
            "pocos": int(len(por_poco)),
            "pocos_com_parada": int((razao < LIMIAR).sum()),
            "oleo_bbl_d": round(float(oleo)), "gas_mil_m3_d": round(float(gas), 1), "agua_bbl_d": round(float(agua)),
            "bsw": round(float(agua / (agua + oleo)), 3) if oleo + agua > 0 else None,
            "disponibilidade": round(desempenho, 3) if desempenho is not None else None,
            "pior_poco": None if pior is None else {"poco": str(pior).strip(), "razao": round(float(razao[pior]), 3)},
        })
    frota.sort(key=lambda f: -f["oleo_bbl_d"])
    periodo = str(ultimo)
    ref_txt = f"{antes['mes'].min().strftime('%m/%Y')} a {antes['mes'].max().strftime('%m/%Y')}" if len(antes) else None
    (out / "frota.json").write_text(json.dumps({
        "periodo": periodo, "referencia": ref_txt, "limiar_normal": LIMIAR,
        "fonte": "ANP – produção por poço no mar (fase de desenvolvimento e produção) e plataformas em operação",
        "instalacoes": frota}, ensure_ascii=False))
    print(periodo, "ref", ref_txt, "|", len(frota), "instalações;", sum(f["oleo_bbl_d"] for f in frota), "bbl/d")
    for f in frota[:10]:
        print(f["instalacao"], "|", f["operador"], f["tipo"], f["lat"], f["lon"], f["oleo_bbl_d"], f["pocos"], f["pocos_com_parada"], f["disponibilidade"], f["capacidade_bbl_d"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
