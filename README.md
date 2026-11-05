# Console 3W

Sala de alarmes inteligente para poços offshore, construída sobre a base aberta **3W** da Petrobras e os **dados abertos de produção por poço da ANP**. Protótipo apresentado ao **Radar de Soluções – Petrobras (Conexões para Inovação)**.

- **Protótipo on-line:** https://fhrsales.github.io/console-3w/
- **Vídeo de demonstração (1min27s):** https://fhrsales.github.io/console-3w/demo.html

## O que faz

1. **Frota** — globo 3D com as 76 instalações de produção no mar, percorrido de norte a sul. Cada instalação é uma coluna com altura igual ao petróleo por dia; a ficha mostra petróleo e água (BSW), produção contra o próprio normal, uso da capacidade e poços abaixo do normal.
2. **Sala de alarmes** — replay de casos reais do 3W, dos mais recentes (2023) aos mais antigos, com o tempo contado a partir do início do caso (T+hh:mm:ss). Quando o poço sai do próprio comportamento normal, o console alerta e explica:
   - **por que alertou** (quais sinais mudaram e quanto);
   - **o que pode ser** (eventos mais prováveis da taxonomia do 3W) e casos parecidos no histórico.
3. **Retorno do operador** — confirma o evento ou marca alarme falso; a resposta vira rótulo para o próximo treino.

No celular, o globo fica de fundo em tela cheia e os capítulos viram um cartão por vez (setas, pontos ou deslizar para o lado), com "Ver detalhes" para abrir barras e listas.

## Como o detector funciona

Sinais reamostrados a 10 s; linha de base de cada poço nos primeiros 20 min; janelas de 5 min com desvio, oscilação e tendência por variável; alerta quando o índice passa de 3 e se mantém por 3 janelas. A sugestão de evento vem de uma floresta aleatória treinada só em janelas de evento, sempre deixando de fora o caso em replay (sem vazamento). É uma amostra pequena (33 casos reais de 2013 a 2023, 14 poços, 9 tipos de evento; casos longos viram uma janela de 6 h que começa 100 min antes do evento): serve para demonstrar o fluxo, não para medir desempenho.

## Rodar localmente

```bash
python3 -m venv .venv && .venv/bin/pip install pandas pyarrow scikit-learn
.venv/bin/python scripts/prepare.py data/raw web/data      # casos do 3W (parquet em data/raw)
.venv/bin/python scripts/anp.py data/raw-anp web/data      # frota (ANP)
.venv/bin/python server.py 8737                            # http://localhost:8737
```

Com o `server.py`, o retorno do operador vai para `feedback.jsonl`. No site estático (GitHub Pages), fica guardado no navegador.

## Fontes

- **3W Dataset 2.0**, Petrobras — https://github.com/petrobras/3W (dados CC-BY 4.0).
- **ANP**, dados abertos (fase de desenvolvimento e produção) — produção por poço no mar (set/2026, último mês publicado; o "normal" de cada poço e unidade é a média de jan a ago/2026) e plataformas em operação (posição, tipo, capacidade).
- Globo: MapLibre GL JS; mapa base Esri, HERE, Garmin, © OpenStreetMap.
- Logotipo Petrobras via Wikimedia Commons, usado só para identificar a quem a proposta se destina.

Fabio Sales Consultoria
