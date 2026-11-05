"""Servidor do protótipo: entrega web/ e guarda o retorno do operador em feedback.jsonl.

Uso: .venv/bin/python -I server.py [porta]
"""
import json
import sys
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
FEEDBACK = ROOT / "feedback.jsonl"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(WEB), **k)

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _all(self):
        if not FEEDBACK.exists():
            return []
        return [json.loads(l) for l in FEEDBACK.read_text().splitlines() if l.strip()]

    def do_GET(self):
        if self.path.startswith("/api/feedback"):
            return self._json(200, self._all())
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/api/feedback"):
            return self._json(404, {"erro": "rota não encontrada"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(min(n, 10_000)))
            item = {
                "instancia": str(data["instancia"])[:60], "alerta_t": str(data["alerta_t"])[:30],
                "veredito": data["veredito"] if data.get("veredito") in ("confirmado", "falso") else "falso",
                "evento": str(data.get("evento") or "")[:60], "nota": str(data.get("nota") or "")[:500],
                "em": datetime.now().isoformat(timespec="seconds"),
            }
        except (ValueError, KeyError, TypeError):
            return self._json(400, {"erro": "dados inválidos"})
        rest = [f for f in self._all() if not (f["instancia"] == item["instancia"] and f["alerta_t"] == item["alerta_t"])]
        FEEDBACK.write_text("".join(json.dumps(f, ensure_ascii=False) + "\n" for f in rest + [item]))
        return self._json(200, item)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8737
    print(f"Console 3W em http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
