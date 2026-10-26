"""Простой веб-интерфейс (только localhost): запуск сканов, отчёты, подтверждение списков zapret."""

from __future__ import annotations

import html
import json
import secrets
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlsplit

from blockscan import app, config, report, zapret
from blockscan.analyze import STATUS_RU
from blockscan.scanner import Scanner
from blockscan.services import CATEGORIES, ServiceDB

TOKEN = secrets.token_urlsafe(16)  # защита POST-запросов от чужих страниц в браузере
e = html.escape

EXTRA_STYLE = """
nav{display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap}nav a{color:inherit;font-weight:600}
form.card,.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:12px 0}
label{display:inline-block;margin:3px 12px 3px 0}textarea,input[type=text]{width:100%;font:inherit;
padding:6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
button{font:inherit;padding:6px 14px;border-radius:8px;border:1px solid var(--line);background:var(--fg);
color:var(--bg);cursor:pointer;margin:6px 6px 0 0}button.secondary{background:transparent;color:var(--fg)}
.muted{color:var(--muted)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}
"""


class ScanJob:
    def __init__(self):
        self.lock = threading.Lock()
        self.running = False
        self.total = 0
        self.done = 0
        self.scan_id: int | None = None
        self.error: str | None = None
        self.recent: list[str] = []
        self.scanner: Scanner | None = None

    def snapshot(self) -> dict:
        with self.lock:
            return {"running": self.running, "total": self.total, "done": self.done,
                    "scan_id": self.scan_id, "error": self.error, "recent": self.recent[-15:]}


JOB = ScanJob()


def _start_scan(params: dict, kind: str = "scan", domains_only: list[str] | None = None, note: str = "") -> str | None:
    with JOB.lock:
        if JOB.running:
            return "скан уже идёт"
        JOB.running, JOB.done, JOB.error, JOB.recent, JOB.scan_id = True, 0, None, [], None
    cfg = config.load()
    db = ServiceDB.load()
    storage = app.open_storage()
    try:
        if domains_only is not None:
            targets = app.select_targets(db, storage, domains=domains_only)
        else:
            targets = app.select_targets(
                db, storage, categories=params.get("category") or None,
                domains=[d for d in (params.get("domains", [""])[0]).split() if d],
                use_targets="targets" in params,
                use_services="all" in params)
    except ValueError as ex:
        with JOB.lock:
            JOB.running = False
        return str(ex)
    if not targets:
        with JOB.lock:
            JOB.running = False
        return "нет целей"
    JOB.total = len(targets)
    isp = (params.get("isp", [""])[0]).strip()

    def on_result(r: dict) -> None:
        with JOB.lock:
            JOB.done += 1
            types = "/".join(r["block_types"])
            JOB.recent.append(f"{r['domain']} — {STATUS_RU[r['status']]}{' [' + types + ']' if types else ''}")

    def hook(sc: Scanner) -> None:
        JOB.scanner = sc

    def work() -> None:
        try:
            sid = app.run_scan(cfg, storage, targets, isp=isp, kind=kind, note=note, on_result=on_result,
                               scanner_hook=hook)
            with JOB.lock:
                JOB.scan_id = sid
        except Exception as ex:  # noqa: BLE001
            with JOB.lock:
                JOB.error = str(ex)
        finally:
            with JOB.lock:
                JOB.running = False
                JOB.scanner = None

    threading.Thread(target=work, daemon=True).start()
    return None


def _page(title: str, body: str) -> str:
    return (f"<!doctype html><html lang='ru'><head><meta charset='utf-8'>"
            f"<meta name='viewport' content='width=device-width,initial-scale=1'><title>{e(title)}</title>"
            f"<style>{report.HTML_STYLE}{EXTRA_STYLE}</style></head><body><main>"
            f"<nav><a href='/'>Сканы</a><a href='/zapret'>zapret</a></nav>{body}</main></body></html>")


def _hidden() -> str:
    return f"<input type='hidden' name='token' value='{TOKEN}'>"


def page_index(msg: str = "") -> str:
    storage = app.open_storage()
    job = JOB.snapshot()
    cfg = config.load()
    parts = ["<h1>Сканер блокировок</h1>"]
    if msg:
        parts.append(f"<div class='card'>{e(msg)}</div>")
    if job["running"]:
        parts.append(f"<div class='card'><b>Идёт скан: {job['done']} из {job['total']}</b>"
                     f"<pre>{e(chr(10).join(job['recent']))}</pre>"
                     f"<form method='post' action='/cancel'>{_hidden()}<button class='secondary'>Остановить</button></form>"
                     "<script>setTimeout(()=>location.reload(),2000)</script></div>")
    elif job["error"]:
        parts.append(f"<div class='card s-blocked'>Ошибка скана: {e(job['error'])}</div>")
    cats = "".join(f"<label><input type='checkbox' name='category' value='{k}'> {e(v)}</label>"
                   for k, v in CATEGORIES.items())
    parts.append(
        f"<form class='card' method='post' action='/scan'>{_hidden()}<b>Новый скан</b><div>{cats}</div>"
        "<label><input type='checkbox' name='all'> все сервисы из базы</label>"
        "<label><input type='checkbox' name='targets'> импортированные списки</label>"
        "<p class='muted'>Если ничего не выбрано — проверяются все сервисы из базы.</p>"
        "<textarea name='domains' rows='3' placeholder='Свои домены через пробел или с новой строки'></textarea>"
        f"<p><input type='text' name='isp' placeholder='Провайдер (для отчёта)' value='{e(cfg.get('isp') or '')}'></p>"
        f"<button>Запустить</button> <span class='muted'>лимит {cfg['rps']} запр/с, потоков {cfg['threads']}</span></form>")
    rows = []
    for s in storage.scans(50):
        kind = "проверка" if s["kind"] == "verify" else "скан"
        rows.append(f"<tr><td><a href='/scan/{s['id']}'>#{s['id']}</a></td><td>{e(s['started_at'])}</td>"
                    f"<td>{kind}</td><td>{e(s['isp'] or '')}</td><td>{s['total']}</td>"
                    f"<td class='s-blocked'>{s['blocked']}</td><td class='s-unstable'>{s['unstable']}</td>"
                    f"<td><a href='/scan/{s['id']}.csv'>csv</a> · <a href='/scan/{s['id']}.json'>json</a> · "
                    f"<a href='/scan/{s['id']}.html'>html</a></td></tr>")
    if rows:
        parts.append("<div class='card'><b>История</b><table><tr class='muted'><td>№</td><td>дата</td><td>тип</td>"
                     "<td>провайдер</td><td>всего</td><td>блок</td><td>нестаб.</td><td>экспорт</td></tr>"
                     + "".join(rows) + "</table></div>")
    ids = [s["id"] for s in storage.scans(2)]
    if len(ids) == 2:
        changes = report.diff(storage.results(ids[1]), storage.results(ids[0]))
        parts.append(f"<div class='card'><b>Было #{ids[1]} → стало #{ids[0]}</b><pre>"
                     f"{e(report.render_diff(changes))}</pre></div>")
    return _page("Сканер блокировок", "".join(parts))


def page_zapret(msg: str = "") -> str:
    storage = app.open_storage()
    cfg = config.load()
    sid = storage.last_scan_id("scan")
    parts = ["<h1>Списки для zapret</h1>"]
    if msg:
        parts.append(f"<div class='card'>{e(msg)}</div>")
    target = (cfg.get("zapret") or {}).get("hostlist_path") or ""
    parts.append(f"<div class='card'>Hostlist: <b>{e(target) or 'не задан'}</b>"
                 f"<form method='post' action='/zapret/config'>{_hidden()}"
                 f"<input type='text' name='hostlist_path' value='{e(target)}' "
                 "placeholder='/opt/zapret/ipset/zapret-hosts-user.txt или C:\\zapret\\lists\\list-general.txt'>"
                 "<button class='secondary'>Сохранить путь</button></form></div>")
    if sid:
        parts.append(f"<form class='card' method='post' action='/zapret/suggest'>{_hidden()}"
                     f"Сформировать предложения по скану #{sid} <button>Сформировать</button></form>")
        recs = zapret.recommendations(storage.results(sid))
        if recs:
            items = []
            for r in recs:
                ex = "".join(f"<pre>{e(x.format(hostlist=target or 'zapret-all.txt'))}</pre>" for x in r["examples"])
                items.append(f"<details><summary>{e(r['title'])} — {len(r['domains'])}</summary>"
                             f"<p>{e(r['advice'])}</p>{ex}<p class='muted'>{e(', '.join(r['domains']))}</p></details>")
            parts.append("<div class='card'><b>Рекомендации</b>" + "".join(items) +
                         "<p class='muted'>Стратегии — стартовые; рабочую подберите blockcheck из комплекта zapret.</p></div>")

    def table(state: str, title: str, buttons: str) -> None:
        rows = storage.suggestions(state)
        if not rows:
            return
        trs = "".join(f"<tr><td><label><input type='checkbox' name='domain' value='{e(s['domain'])}' checked> "
                      f"{e(s['domain'])}</label></td><td>{e(s['service'] or '')}</td>"
                      f"<td>{e('/'.join(s['block_types']))}</td></tr>" for s in rows)
        parts.append(f"<form class='card' method='post' action='/zapret/decide'>{_hidden()}<b>{title}</b>"
                     f"<table>{trs}</table>{buttons}</form>")

    table("pending", "Предложено добавить (подтвердите)",
          "<button name='state' value='accepted'>Подтвердить отмеченные</button>"
          "<button class='secondary' name='state' value='rejected'>Отклонить отмеченные</button>")
    table("accepted", "Подтверждено — ещё не записано",
          "<button name='state' value='apply'>Записать в hostlist</button>"
          "<button class='secondary' name='state' value='pending'>Вернуть в предложения</button>")
    table("applied", "Записано в hostlist",
          "<button name='state' value='verify'>Перепроверить — помогло ли?</button>")
    table("rejected", "Отклонено", "<button class='secondary' name='state' value='pending'>Вернуть в предложения</button>")
    return _page("zapret", "".join(parts))


class Handler(BaseHTTPRequestHandler):
    server_version = "blockscan"

    def log_message(self, fmt, *args):  # тише в консоли
        pass

    def _send(self, body: str | bytes, ctype: str = "text/html; charset=utf-8", code: int = 200,
              extra: dict | None = None) -> None:
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Frame-Options", "DENY")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _redirect(self, to: str) -> None:
        self.send_response(303)
        self.send_header("Location", quote(to, safe="/?=&"))
        self.end_headers()

    def _host_ok(self) -> bool:
        # Защита от DNS-rebinding: принимаем только обращения к localhost.
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]")
        return host in ("127.0.0.1", "localhost", "::1")

    def do_GET(self):  # noqa: N802
        if not self._host_ok():
            return self._send("forbidden", "text/plain", 403)
        path = urlsplit(self.path).path
        qs = parse_qs(urlsplit(self.path).query)
        msg = qs.get("msg", [""])[0]
        if path == "/":
            return self._send(page_index(msg))
        if path == "/zapret":
            return self._send(page_zapret(msg))
        if path == "/progress":
            return self._send(json.dumps(JOB.snapshot(), ensure_ascii=False), "application/json")
        if path.startswith("/scan/"):
            return self._scan_page(path[len("/scan/"):])
        return self._send("not found", "text/plain", 404)

    def _scan_page(self, tail: str):
        sid_s, _, ext = tail.partition(".")
        if not sid_s.isdigit():
            return self._send("not found", "text/plain", 404)
        storage = app.open_storage()
        scan = storage.scan(int(sid_s))
        if not scan:
            return self._send("not found", "text/plain", 404)
        results = storage.results(scan["id"])
        name = f"blockscan-{scan['id']}"
        if ext == "csv":
            return self._send("\ufeff" + report.render_csv(results), "text/csv; charset=utf-8",
                              extra={"Content-Disposition": f"attachment; filename={name}.csv"})
        if ext == "json":
            return self._send(report.render_json(results, scan), "application/json; charset=utf-8",
                              extra={"Content-Disposition": f"attachment; filename={name}.json"})
        if ext == "html":
            return self._send(report.render_html(results, scan),
                              extra={"Content-Disposition": f"attachment; filename={name}.html"})
        page = report.render_html(results, scan, title=f"Скан #{scan['id']}")
        page = page.replace("<main>", "<main><nav><a href='/'>Сканы</a><a href='/zapret'>zapret</a></nav>", 1)
        return self._send(page)

    def do_POST(self):  # noqa: N802
        if not self._host_ok():
            return self._send("forbidden", "text/plain", 403)
        length = int(self.headers.get("Content-Length") or 0)
        form = parse_qs(self.rfile.read(min(length, 1_000_000)).decode("utf-8", "replace"))
        if form.get("token", [""])[0] != TOKEN:
            return self._send("bad token", "text/plain", 403)
        path = urlsplit(self.path).path
        if path == "/scan":
            err = _start_scan(form)
            return self._redirect("/?msg=" + (err or "скан запущен"))
        if path == "/cancel":
            if JOB.scanner:
                JOB.scanner.cancelled = True
            return self._redirect("/?msg=остановка…")
        storage = app.open_storage()
        cfg = config.load()
        if path == "/zapret/config":
            cfg.setdefault("zapret", {})["hostlist_path"] = form.get("hostlist_path", [""])[0].strip()
            config.save(cfg)
            return self._redirect("/zapret?msg=путь сохранён")
        if path == "/zapret/suggest":
            sid = storage.last_scan_id("scan")
            if not sid:
                return self._redirect("/zapret?msg=сканов нет")
            added, skipped = zapret.suggest(storage, sid, ServiceDB.load(), cfg)
            return self._redirect(f"/zapret?msg=новых предложений: {added}, исключено: {skipped}")
        if path == "/zapret/decide":
            domains = form.get("domain", [])
            state = form.get("state", [""])[0]
            if state in ("accepted", "rejected", "pending"):
                storage.set_suggestion_state(domains, state)
                return self._redirect(f"/zapret?msg=отмечено: {len(domains)}")
            if state == "apply":
                accepted = {s["domain"] for s in storage.suggestions("accepted")}
                chosen = [d for d in domains if d in accepted]
                try:
                    new, backup = zapret.apply(storage, cfg, chosen)
                except (ValueError, OSError) as ex:
                    return self._redirect(f"/zapret?msg=ошибка: {ex}")
                return self._redirect(f"/zapret?msg=записано строк: {len(new)}"
                                      + (f", копия: {backup}" if backup else "")
                                      + ". Перезапустите zapret и нажмите «Перепроверить».")
            if state == "verify":
                sid = storage.last_scan_id("scan")
                ds = zapret.verify_domains(storage, sid) if sid else []
                if not ds:
                    return self._redirect("/zapret?msg=нечего перепроверять")
                err = _start_scan({}, kind="verify", domains_only=ds, note=f"после скана #{sid}")
                return self._redirect("/?msg=" + (err or "перепроверка запущена"))
        return self._send("not found", "text/plain", 404)


def serve(host: str = "127.0.0.1", port: int = 8765, open_browser: bool = True) -> None:
    if host not in ("127.0.0.1", "localhost", "::1"):
        print("Внимание: интерфейс доступен не только с этого компьютера.")
    httpd = ThreadingHTTPServer((host, port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"Веб-интерфейс: {url}  (Ctrl+C — выход)")
    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
