"""Отчёты: дерево «категория → сервис → домены», CSV, JSON, HTML, сравнение сканов."""

from __future__ import annotations

import csv
import html
import io
import json
from collections import OrderedDict

from blockscan.analyze import AVAILABLE, BLOCKED, ERROR, STATUS_RU, UNSTABLE
from blockscan.services import CATEGORIES

_SECOND_LEVEL = {"co.uk", "com.au", "co.jp", "com.br", "com.ua", "org.uk", "com.tr", "co.kr", "com.cn", "msk.ru", "spb.ru"}
_STATUS_ORDER = {BLOCKED: 0, UNSTABLE: 1, ERROR: 2, AVAILABLE: 3}
_ICON = {BLOCKED: "✖", UNSTABLE: "≈", ERROR: "?", AVAILABLE: "✔"}


def base_domain(domain: str) -> str:
    parts = domain.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in _SECOND_LEVEL:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def worst(statuses) -> str:
    statuses = list(statuses)
    return min(statuses, key=lambda s: _STATUS_ORDER.get(s, 9)) if statuses else AVAILABLE


def build_tree(results: list[dict]) -> "OrderedDict[str, OrderedDict[str, list[dict]]]":
    tree: dict[str, dict[str, list[dict]]] = {}
    for r in results:
        cat = r.get("category") or "other"
        svc = r.get("service") or base_domain(r["domain"])
        tree.setdefault(cat, {}).setdefault(svc, []).append(r)
    ordered: OrderedDict = OrderedDict()
    for cat in list(CATEGORIES) + sorted(set(tree) - set(CATEGORIES)):
        if cat not in tree:
            continue
        services = sorted(tree[cat].items(),
                          key=lambda kv: (_STATUS_ORDER.get(worst(x["status"] for x in kv[1]), 9), kv[0].lower()))
        ordered[cat] = OrderedDict((k, sorted(v, key=lambda x: x["domain"])) for k, v in services)
    return ordered


def summary(results: list[dict]) -> dict:
    out = {s: 0 for s in (BLOCKED, UNSTABLE, ERROR, AVAILABLE)}
    by_type: dict[str, int] = {}
    for r in results:
        out[r["status"]] = out.get(r["status"], 0) + 1
        for t in r.get("block_types") or []:
            by_type[t] = by_type.get(t, 0) + 1
    out["total"] = len(results)
    out["by_type"] = by_type
    return out


def _label(r: dict) -> str:
    types = "/".join(r.get("block_types") or [])
    return STATUS_RU.get(r["status"], r["status"]) + (f" [{types}]" if types else "")


def render_text(results: list[dict], scan: dict | None = None, only_problems: bool = False,
                verbose: bool = False) -> str:
    lines = []
    if scan:
        lines.append(f"Скан #{scan['id']} · {scan['started_at']} · провайдер: {scan.get('isp') or 'не указан'}")
    s = summary(results)
    lines.append(f"Всего: {s['total']} · заблокировано: {s[BLOCKED]} · нестабильно: {s[UNSTABLE]} · "
                 f"неясно: {s[ERROR]} · доступно: {s[AVAILABLE]}")
    if s["by_type"]:
        lines.append("По типам: " + ", ".join(f"{k}: {v}" for k, v in sorted(s["by_type"].items())))
    lines.append("")
    for cat, services in build_tree(results).items():
        items = [(svc, rs) for svc, rs in services.items()
                 if not only_problems or worst(r["status"] for r in rs) != AVAILABLE]
        if not items:
            continue
        lines.append(f"{CATEGORIES.get(cat, cat)}")
        for i, (svc, rs) in enumerate(items):
            last_svc = i == len(items) - 1
            w = worst(r["status"] for r in rs)
            lines.append(f"{'└──' if last_svc else '├──'} {_ICON.get(w, ' ')} {svc}")
            pad = "    " if last_svc else "│   "
            shown = [r for r in rs if not only_problems or r["status"] != AVAILABLE]
            for j, r in enumerate(shown):
                last = j == len(shown) - 1
                lines.append(f"{pad}{'└──' if last else '├──'} {_ICON.get(r['status'], ' ')} {r['domain']} — {_label(r)}")
                if verbose or r["status"] != AVAILABLE:
                    for reason in r.get("reasons") or []:
                        lines.append(f"{pad}{'    ' if last else '│   '}   · {reason}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


CSV_FIELDS = ["category", "category_name", "service", "domain", "status", "status_ru", "block_types", "reasons", "checked_at"]


def render_csv(results: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CSV_FIELDS)
    w.writeheader()
    for r in results:
        w.writerow({
            "category": r.get("category"), "category_name": CATEGORIES.get(r.get("category") or "", ""),
            "service": r.get("service") or "", "domain": r["domain"], "status": r["status"],
            "status_ru": STATUS_RU.get(r["status"], ""), "block_types": "/".join(r.get("block_types") or []),
            "reasons": " | ".join(r.get("reasons") or []), "checked_at": r.get("checked_at"),
        })
    return buf.getvalue()


def render_json(results: list[dict], scan: dict | None = None, with_details: bool = True) -> str:
    rows = []
    for r in results:
        row = {k: r.get(k) for k in ("domain", "service", "category", "status", "block_types", "reasons", "checked_at")}
        if with_details:
            row["details"] = r.get("details")
        rows.append(row)
    meta = None
    if scan:
        meta = {k: scan.get(k) for k in ("id", "started_at", "finished_at", "isp", "kind", "note")}
    return json.dumps({"scan": meta, "summary": summary(results), "results": rows}, ensure_ascii=False, indent=2)


HTML_STYLE = """
:root{--bg:#f7f7f8;--fg:#1d1d1f;--muted:#6b6b70;--card:#fff;--line:#e3e3e6;
--blocked:#c62828;--unstable:#b26a00;--error:#6b6b70;--available:#2e7d32}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececee;--muted:#9a9aa0;--card:#1e1e21;
--line:#2e2e33;--blocked:#ef5350;--unstable:#ffb74d;--error:#9a9aa0;--available:#66bb6a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);
font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}
.meta{color:var(--muted);margin-bottom:16px}.stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 14px}
.stat b{font-size:20px;display:block}details{background:var(--card);border:1px solid var(--line);
border-radius:10px;margin:8px 0;padding:6px 12px}summary{cursor:pointer;font-weight:600;padding:4px 0}
details details{margin:6px 0 6px 8px}table{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}
td:first-child{width:32%}td:nth-child(2){width:24%}
td{padding:5px 6px;border-top:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
.s-blocked{color:var(--blocked)}.s-unstable{color:var(--unstable)}.s-error{color:var(--error)}
.s-available{color:var(--available)}.why{color:var(--muted);font-size:13px}
.tag{display:inline-block;border:1px solid currentColor;border-radius:6px;padding:0 5px;font-size:12px;margin-left:4px}
"""


def render_html(results: list[dict], scan: dict | None = None, title: str = "Отчёт о блокировках") -> str:
    e = html.escape
    s = summary(results)
    parts = [f"<!doctype html><html lang='ru'><head><meta charset='utf-8'>"
             f"<meta name='viewport' content='width=device-width,initial-scale=1'><title>{e(title)}</title>"
             f"<style>{HTML_STYLE}</style></head><body><main><h1>{e(title)}</h1>"]
    if scan:
        parts.append(f"<div class='meta'>Скан #{scan['id']} · {e(scan['started_at'])} · "
                     f"провайдер: {e(scan.get('isp') or 'не указан')}</div>")
    parts.append("<div class='stats'>")
    for key, label in ((BLOCKED, "заблокировано"), (UNSTABLE, "нестабильно"), (ERROR, "неясно"),
                       (AVAILABLE, "доступно"), ("total", "всего")):
        parts.append(f"<div class='stat s-{key}'><b>{s[key]}</b>{label}</div>")
    for t, n in sorted(s["by_type"].items()):
        parts.append(f"<div class='stat'><b>{n}</b>{e(t)}</div>")
    parts.append("</div>")
    for cat, services in build_tree(results).items():
        cat_rs = [r for rs in services.values() for r in rs]
        cw = worst(r["status"] for r in cat_rs)
        n_bad = sum(1 for r in cat_rs if r["status"] != AVAILABLE)
        parts.append(f"<details{' open' if cw != AVAILABLE else ''}><summary class='s-{cw}'>"
                     f"{e(CATEGORIES.get(cat, cat))} — проблем: {n_bad} из {len(cat_rs)}</summary>")
        for svc, rs in services.items():
            w = worst(r["status"] for r in rs)
            parts.append(f"<details{' open' if w != AVAILABLE else ''}><summary class='s-{w}'>"
                         f"{e(svc)} <span class='tag'>{e(STATUS_RU.get(w, w))}</span></summary><table>")
            for r in rs:
                tags = "".join(f"<span class='tag'>{e(t)}</span>" for t in r.get("block_types") or [])
                why = "<br>".join(e(x) for x in r.get("reasons") or [])
                parts.append(f"<tr><td>{e(r['domain'])}</td><td class='s-{r['status']}'>"
                             f"{e(STATUS_RU.get(r['status'], r['status']))}{tags}</td>"
                             f"<td class='why'>{why}</td></tr>")
            parts.append("</table></details>")
        parts.append("</details>")
    parts.append("</main></body></html>")
    return "".join(parts)


def diff(old: list[dict], new: list[dict]) -> list[dict]:
    """Изменения статуса между двумя сканами («было → стало»)."""
    before = {r["domain"]: r for r in old}
    after = {r["domain"]: r for r in new}
    changes = []
    for d in sorted(set(before) | set(after)):
        a, b = before.get(d), after.get(d)
        if a and b and a["status"] == b["status"] and a["block_types"] == b["block_types"]:
            continue
        changes.append({
            "domain": d, "service": (b or a).get("service"), "category": (b or a).get("category"),
            "before": _label(a) if a else "—", "after": _label(b) if b else "—",
            "before_status": a["status"] if a else None, "after_status": b["status"] if b else None,
        })
    return changes


def render_diff(changes: list[dict]) -> str:
    if not changes:
        return "Изменений нет.\n"
    width = max(len(c["domain"]) for c in changes)
    lines = []
    for c in changes:
        mark = "+" if c["after_status"] == AVAILABLE else ("-" if c["after_status"] == BLOCKED else "~")
        lines.append(f"{mark} {c['domain']:<{width}}  {c['before']}  →  {c['after']}")
    return "\n".join(lines) + "\n"
