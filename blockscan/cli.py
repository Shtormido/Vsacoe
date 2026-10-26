"""Командная строка: python -m blockscan <команда>."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from blockscan import __version__, app, config, report, services, sources, zapret
from blockscan.analyze import AVAILABLE, STATUS_RU
from blockscan.services import CATEGORIES, Service, ServiceDB

ICON = {"blocked": "✖", "unstable": "≈", "error": "?", "available": "✔"}


def _setup_logging(verbose: bool) -> None:
    handlers: list[logging.Handler] = [logging.FileHandler(config.home_dir() / "blockscan.log", encoding="utf-8")]
    stderr = logging.StreamHandler()
    stderr.setLevel(logging.DEBUG if verbose else logging.WARNING)
    handlers.append(stderr)
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO, handlers=handlers,
                        format="%(asctime)s %(levelname)s %(message)s")


def _confirm(question: str) -> bool:
    try:
        return input(f"{question} [y/N] ").strip().lower() in ("y", "yes", "д", "да")
    except EOFError:
        return False


def _scan_id(storage, value: int | None, kind: str | None = "scan") -> int:
    sid = value or storage.last_scan_id(kind) or storage.last_scan_id()
    if not sid or not storage.scan(sid):
        raise SystemExit("Сканов ещё нет: запустите «blockscan scan».")
    return sid


def _apply_overrides(cfg: dict, args) -> dict:
    for key in ("threads", "rps", "timeout", "attempts"):
        if getattr(args, key, None) is not None:
            cfg[key] = getattr(args, key)
    if getattr(args, "no_quic", False):
        cfg["quic"] = False
    if getattr(args, "quic_all", False):
        cfg["quic"] = "all"
    return cfg


def _print_result(r: dict) -> None:
    types = "/".join(r["block_types"])
    line = f"{ICON.get(r['status'], ' ')} {r['domain']:<38} {STATUS_RU[r['status']]}" + (f" [{types}]" if types else "")
    if r["status"] != AVAILABLE and r["reasons"]:
        line += f"\n      {r['reasons'][0]}"
    print(line, flush=True)


# ---------------------------------------------------------------- команды
def cmd_scan(args) -> int:
    cfg = _apply_overrides(config.load(), args)
    db = ServiceDB.load()
    storage = app.open_storage()
    domains = list(args.domain or [])
    if args.file:
        domains += [i["domain"] for i in sources.from_file(Path(args.file), db)]
    try:
        targets = app.select_targets(db, storage, categories=args.category, services=args.service,
                                     domains=domains, use_services=args.services, use_targets=args.targets,
                                     target_source=args.source)
    except ValueError as e:
        raise SystemExit(str(e)) from None
    if not targets:
        raise SystemExit("Нет целей для проверки.")
    isp = args.isp or cfg.get("isp") or ""
    if args.detect_isp:
        try:
            isp = app.detect_isp()
        except OSError as e:
            print(f"Не удалось определить провайдера: {e}", file=sys.stderr)
    print(f"Целей: {len(targets)} · потоков: {cfg['threads']} · лимит: {cfg['rps']} запр/с · "
          f"попыток: {cfg['attempts']}")

    def baseline(b: dict) -> None:
        ctrl = ", ".join(f"{h}: {'ок' if ok else 'нет'}" for h, ok in b["control"].items())
        print(f"Эталонный DNS: {'ок' if b['reference_dns'] else 'НЕДОСТУПЕН'} · контроль: {ctrl} · "
              f"QUIC-контроль: {'ок' if b['quic_control'] else 'нет'}\n")

    try:
        sid = app.run_scan(cfg, storage, targets, isp=isp, note=args.note or "", on_result=_print_result,
                           on_baseline=baseline)
    except RuntimeError as e:
        raise SystemExit(f"Ошибка: {e}") from None
    except KeyboardInterrupt:
        print("\nПрервано. Частичные результаты сохранены.")
        return 130
    results = storage.results(sid)
    print("\n" + report.render_text(results, storage.scan(sid), only_problems=True))
    prev = storage.last_scan_id("scan", offset=1)
    if prev:
        old = {r["domain"]: r for r in storage.results(prev)}
        changes = report.diff([old[r["domain"]] for r in results if r["domain"] in old],
                              [r for r in results if r["domain"] in old])
        if changes:
            print(f"Изменения относительно скана #{prev}:")
            print(report.render_diff(changes))
    print(f"Скан #{sid} сохранён. Дальше: «blockscan recommend», «blockscan zapret suggest».")
    return 0


def cmd_import(args) -> int:
    db = ServiceDB.load()
    storage = app.open_storage()
    try:
        if args.source == "citizenlab":
            items, src = sources.citizenlab(db, args.country, args.include_global), f"citizenlab:{args.country}"
        elif args.source == "antifilter":
            items, src = sources.antifilter(db, args.limit), "antifilter"
        else:
            if not args.path:
                raise SystemExit("Укажите файл: blockscan import file список.txt")
            items, src = sources.from_file(Path(args.path), db, args.category or "other"), f"file:{Path(args.path).name}"
    except OSError as e:
        raise SystemExit(f"Не удалось загрузить список: {e}") from None
    if args.limit and args.source != "antifilter":
        items = items[: args.limit]
    added = storage.add_targets(items, src)
    print(f"Получено {len(items)} доменов, новых: {added} (источник {src}).")
    print("Проверить: blockscan scan --targets")
    return 0


def cmd_targets(args) -> int:
    storage = app.open_storage()
    if args.action == "clear":
        print(f"Удалено: {storage.clear_targets(args.source)}")
        return 0
    rows = storage.targets(args.source)
    for r in rows:
        print(f"{r['domain']:<40} {CATEGORIES.get(r['category'] or 'other', r['category']):<18} "
              f"{r['service'] or '':<20} {r['source']}")
    print(f"Всего: {len(rows)}")
    return 0


def cmd_services(args) -> int:
    db = ServiceDB.load()
    if args.action == "list":
        for cat, title in CATEGORIES.items():
            if args.category and cat != args.category:
                continue
            svcs = db.by_category(cat)
            if not svcs:
                continue
            print(title)
            for s in svcs:
                extra = (" · IP: " + str(len(s.endpoints))) if s.endpoints else ""
                print(f"  {s.name:<26} {', '.join(s.domains[:4])}{' …' if len(s.domains) > 4 else ''}{extra}")
        return 0
    if args.action == "show":
        s = db.get(args.name or "")
        if not s:
            raise SystemExit("Сервис не найден.")
        print(f"{s.name} ({CATEGORIES.get(s.category, s.category)})\n  домены: {', '.join(s.domains)}\n"
              f"  проверяются: {', '.join(s.probe_hosts)}\n  IP: {', '.join(s.endpoints) or '—'}\n"
              f"  QUIC: {'да' if s.quic else 'нет'}")
        return 0
    if args.action == "edit":
        print(f"Редактируемая база сервисов: {services.ensure_user_copy()}")
        print("Записи из этого файла заменяют встроенные с тем же именем.")
        return 0
    if args.action == "add":
        if not args.name or not args.domain:
            raise SystemExit("Нужны имя и хотя бы один --domain.")
        if args.category not in CATEGORIES:
            raise SystemExit(f"Категория должна быть одной из: {', '.join(CATEGORIES)}")
        old = db.get(args.name)
        svc = Service(args.name, args.category,
                      sorted(set((old.domains if old else []) + [d.lower() for d in args.domain])),
                      args.probe or (old.probe if old else []), args.endpoint or (old.endpoints if old else []),
                      args.quic or (old.quic if old else False))
        services.save_user_service(svc)
        print(f"Сохранено: {svc.name} → {', '.join(svc.domains)}")
        return 0
    return 1


def cmd_history(args) -> int:
    storage = app.open_storage()
    for s in storage.scans(args.limit):
        kind = "проверка" if s["kind"] == "verify" else "скан"
        print(f"#{s['id']:<4} {s['started_at']}  {kind:<8} всего {s['total']:<4} блок {s['blocked']:<4} "
              f"нестаб {s['unstable']:<3} {s['isp'] or ''} {s['note'] or ''}")
    return 0


def cmd_show(args) -> int:
    storage = app.open_storage()
    sid = _scan_id(storage, args.scan, None)
    print(report.render_text(storage.results(sid), storage.scan(sid), only_problems=not args.all,
                             verbose=args.verbose))
    return 0


def cmd_diff(args) -> int:
    storage = app.open_storage()
    new = args.new or storage.last_scan_id()
    old = args.old or (storage.last_scan_id(offset=1) if new == storage.last_scan_id() else new - 1)
    if not old or not new:
        raise SystemExit("Нужно минимум два скана.")
    print(f"Было: скан #{old} → стало: скан #{new}")
    print(report.render_diff(report.diff(storage.results(old), storage.results(new))))
    return 0


def cmd_export(args) -> int:
    storage = app.open_storage()
    sid = _scan_id(storage, args.scan, None)
    results, scan = storage.results(sid), storage.scan(sid)
    fmt = args.format or (Path(args.output).suffix.lstrip(".") if args.output else "html")
    if fmt == "csv":
        text = report.render_csv(results)
    elif fmt == "json":
        text = report.render_json(results, scan, with_details=not args.brief)
    elif fmt == "html":
        text = report.render_html(results, scan)
    else:
        raise SystemExit("Формат: csv, json или html")
    out = Path(args.output or f"blockscan-{sid}.{fmt}")
    # utf-8-sig для CSV — чтобы Excel на Windows открыл кириллицу без «кракозябр».
    out.write_text(text, encoding="utf-8-sig" if fmt == "csv" else "utf-8")
    print(f"Сохранено: {out.resolve()}")
    return 0


def cmd_recommend(args) -> int:
    storage = app.open_storage()
    sid = _scan_id(storage, args.scan)
    recs = zapret.recommendations(storage.results(sid))
    if not recs:
        print("Блокировок не найдено — рекомендовать нечего.")
        return 0
    hostlist = (config.load().get("zapret") or {}).get("hostlist_path") or "zapret-all.txt"
    for r in recs:
        print(f"■ {r['title']} — доменов: {len(r['domains'])}")
        print(f"  {', '.join(r['domains'][:8])}{' …' if len(r['domains']) > 8 else ''}")
        print(f"  {r['advice']}")
        for ex in r["examples"]:
            print(f"    nfqws/winws {ex.format(hostlist=hostlist)}")
        print()
    print("Стратегии — стартовые варианты. Под конкретного провайдера рабочую подберите\n"
          "утилитой blockcheck из комплекта zapret (blockcheck.sh / blockcheck.cmd).")
    return 0


def cmd_zapret(args) -> int:
    cfg = config.load()
    db = ServiceDB.load()
    storage = app.open_storage()
    act = args.action

    if act == "suggest":
        sid = _scan_id(storage, args.scan)
        added, skipped = zapret.suggest(storage, sid, db, cfg)
        print(f"Новых предложений: {added}" + (f", исключено белым списком: {skipped}" if skipped else ""))
        print("Просмотреть и подтвердить: blockscan zapret review")
        return 0

    if act == "list":
        rows = storage.suggestions(args.state)
        for s in rows:
            print(f"{s['state']:<9} {s['domain']:<36} {s['service'] or '':<22} {'/'.join(s['block_types'])}")
        print(f"Всего: {len(rows)}")
        return 0

    if act == "review":
        pending = storage.suggestions("pending")
        if not pending:
            print("Нет ожидающих предложений. Сначала: blockscan zapret suggest")
            return 0
        groups: dict[str, list[dict]] = {}
        for s in pending:
            groups.setdefault(s["service"] or s["domain"], []).append(s)
        print("Подтвердите добавление в hostlist zapret: y — да, n — нет, s — пропустить, q — выход.\n")
        for name, items in groups.items():
            ds = [i["domain"] for i in items]
            kinds = sorted({k for i in items for k in i["block_types"]})
            print(f"{name} [{'/'.join(kinds)}]: {', '.join(ds)}")
            try:
                ans = input("  добавить? [y/n/s/q] ").strip().lower()
            except EOFError:
                ans = "q"
            if ans in ("q", "й"):
                break
            if ans in ("y", "д", "да", "yes"):
                storage.set_suggestion_state(ds, "accepted")
            elif ans in ("n", "н", "нет", "no"):
                storage.set_suggestion_state(ds, "rejected")
        acc = storage.suggestions("accepted")
        print(f"\nПринято к добавлению: {len(acc)}. Записать: blockscan zapret apply")
        return 0

    if act in ("accept", "reject"):
        if not args.domains:
            raise SystemExit("Укажите домены.")
        storage.set_suggestion_state(args.domains, "accepted" if act == "accept" else "rejected")
        print(f"Отмечено: {len(args.domains)}")
        return 0

    if act == "apply":
        accepted = [s["domain"] for s in storage.suggestions("accepted")]
        if not accepted:
            print("Нет подтверждённых доменов. Сначала: blockscan zapret review")
            return 0
        target = (cfg.get("zapret") or {}).get("hostlist_path")
        if not target:
            raise SystemExit("Не задан hostlist zapret. Например:\n"
                             "  Linux:   blockscan config set zapret.hostlist_path /opt/zapret/ipset/zapret-hosts-user.txt\n"
                             "  Windows: blockscan config set zapret.hostlist_path C:\\zapret\\lists\\list-general.txt")
        print(f"Будет дописано в {target}:\n  " + "\n  ".join(accepted))
        if not args.yes and not _confirm("Записать?"):
            print("Отменено.")
            return 0
        new, backup = zapret.apply(storage, cfg, accepted)
        print(f"Добавлено новых строк: {len(new)}" + (f" · резервная копия: {backup}" if backup else ""))
        print("Перезапустите zapret (Linux: systemctl restart zapret; Windows: перезапуск winws/службы),\n"
              "затем проверьте результат: blockscan zapret verify")
        return 0

    if act == "export":
        sid = _scan_id(storage, args.scan)
        out = Path(args.output or "zapret-lists")
        written = zapret.export_hostlists(storage.results(sid), db, out, args.by, cfg.get("exclude"))
        if not written:
            print("Нет доменов, которые обходятся zapret (SNI/DPI, HTTP, QUIC).")
            return 0
        for name, entries in written.items():
            print(f"{out / name}: {len(entries)}")
        return 0

    if act == "verify":
        base = _scan_id(storage, args.scan)
        domains = zapret.verify_domains(storage, base)
        if not domains:
            print("Нет применённых записей, покрывающих домены последнего скана.")
            return 0
        cfg = _apply_overrides(cfg, args)
        targets = app.select_targets(db, storage, domains=domains)
        print(f"Перепроверка {len(targets)} доменов после изменения hostlist…")
        sid = app.run_scan(cfg, storage, targets, kind="verify", note=f"после скана #{base}",
                           on_result=_print_result)
        before = [r for r in storage.results(base) if r["domain"] in set(domains)]
        changes = report.diff(before, storage.results(sid))
        print(f"\nБыло (скан #{base}) → стало (проверка #{sid}):")
        print(report.render_diff(changes))
        still = [r["domain"] for r in storage.results(sid) if r["status"] != AVAILABLE]
        if still:
            print("Не помогло для: " + ", ".join(still) + "\nПопробуйте другую стратегию (blockscan recommend).")
        return 0
    return 1


def cmd_lists(args) -> int:
    cfg = config.load()
    key = args.which
    items = cfg.setdefault(key, [])
    name = "Белый список (не добавлять)" if key == "exclude" else "Чёрный список (добавлять всегда)"
    if args.action == "add":
        for d in args.domains:
            if d.lower() not in items:
                items.append(d.lower())
        config.save(cfg)
    elif args.action == "remove":
        cfg[key] = [d for d in items if d not in {x.lower() for x in args.domains}]
        config.save(cfg)
    print(f"{name}: {', '.join(cfg[key]) or 'пусто'}")
    return 0


def cmd_config(args) -> int:
    import json
    cfg = config.load()
    if args.action == "path":
        print(config.home_dir())
    elif args.action == "set":
        config.set_value(cfg, args.key, args.value)
        config.save(cfg)
        print(f"{args.key} = {args.value}")
    else:
        print(json.dumps(cfg, ensure_ascii=False, indent=2))
    return 0


def cmd_web(args) -> int:
    from blockscan import web
    web.serve(args.host, args.port, open_browser=not args.no_browser)
    return 0


# ---------------------------------------------------------------- парсер
def _scan_opts(p: argparse.ArgumentParser) -> None:
    p.add_argument("--threads", type=int, help="число потоков")
    p.add_argument("--rps", type=float, help="лимит запросов в секунду")
    p.add_argument("--timeout", type=float, help="таймаут одной проверки, с")
    p.add_argument("--attempts", type=int, help="попыток для подозрительных доменов")
    p.add_argument("--no-quic", action="store_true", help="не проверять QUIC")
    p.add_argument("--quic-all", action="store_true", help="проверять QUIC для всех доменов")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="blockscan", description="Сканер блокировок провайдера и списков для zapret")
    p.add_argument("--version", action="version", version=f"blockscan {__version__}")
    p.add_argument("-v", "--verbose", action="store_true", help="подробный лог")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("scan", help="проверить домены")
    s.add_argument("-c", "--category", action="append", choices=list(CATEGORIES), help="категория из базы")
    s.add_argument("-s", "--service", action="append", help="сервис из базы (например, Telegram)")
    s.add_argument("-d", "--domain", action="append", help="домен вручную")
    s.add_argument("-f", "--file", help="файл со списком доменов (txt/csv)")
    s.add_argument("--services", action="store_true", help="все сервисы из базы")
    s.add_argument("--targets", action="store_true", help="импортированные цели")
    s.add_argument("--source", help="только цели из этого источника")
    s.add_argument("--isp", help="подпись провайдера для отчёта")
    s.add_argument("--detect-isp", action="store_true", help="определить провайдера через ipinfo.io (уйдёт ваш IP)")
    s.add_argument("--note", help="заметка к скану")
    _scan_opts(s)
    s.set_defaults(func=cmd_scan)

    s = sub.add_parser("import", help="импорт списков целей")
    s.add_argument("source", choices=["citizenlab", "antifilter", "file"])
    s.add_argument("path", nargs="?", help="путь к файлу (для file)")
    s.add_argument("--country", default="ru", help="код страны для Citizen Lab")
    s.add_argument("--global", dest="include_global", action="store_true", help="плюс глобальный список Citizen Lab")
    s.add_argument("--category", choices=list(CATEGORIES), help="категория для доменов из файла")
    s.add_argument("--limit", type=int, help="не больше N доменов")
    s.set_defaults(func=cmd_import)

    s = sub.add_parser("targets", help="импортированные цели")
    s.add_argument("action", nargs="?", default="list", choices=["list", "clear"])
    s.add_argument("--source")
    s.set_defaults(func=cmd_targets)

    s = sub.add_parser("services", help="база сервисов")
    s.add_argument("action", nargs="?", default="list", choices=["list", "show", "edit", "add"])
    s.add_argument("name", nargs="?")
    s.add_argument("--category", default=None)
    s.add_argument("--domain", action="append")
    s.add_argument("--probe", action="append")
    s.add_argument("--endpoint", action="append", help="ip:port")
    s.add_argument("--quic", action="store_true")
    s.set_defaults(func=cmd_services)

    s = sub.add_parser("history", help="история сканов")
    s.add_argument("--limit", type=int, default=30)
    s.set_defaults(func=cmd_history)

    s = sub.add_parser("show", help="дерево результатов")
    s.add_argument("scan", nargs="?", type=int)
    s.add_argument("-a", "--all", action="store_true", help="включая доступные")
    s.add_argument("--verbose", action="store_true", help="все причины")
    s.set_defaults(func=cmd_show)

    s = sub.add_parser("diff", help="сравнение «было → стало»")
    s.add_argument("old", nargs="?", type=int)
    s.add_argument("new", nargs="?", type=int)
    s.set_defaults(func=cmd_diff)

    s = sub.add_parser("export", help="экспорт отчёта")
    s.add_argument("scan", nargs="?", type=int)
    s.add_argument("-f", "--format", choices=["csv", "json", "html"])
    s.add_argument("-o", "--output")
    s.add_argument("--brief", action="store_true", help="JSON без сырых данных проверок")
    s.set_defaults(func=cmd_export)

    s = sub.add_parser("recommend", help="рекомендации по обходу")
    s.add_argument("scan", nargs="?", type=int)
    s.set_defaults(func=cmd_recommend)

    s = sub.add_parser("zapret", help="hostlist для zapret")
    s.add_argument("action", choices=["suggest", "list", "review", "accept", "reject", "apply", "export", "verify"])
    s.add_argument("domains", nargs="*")
    s.add_argument("--scan", type=int)
    s.add_argument("--state", choices=["pending", "accepted", "rejected", "applied"])
    s.add_argument("--by", choices=["category", "service"], default="category")
    s.add_argument("-o", "--output")
    s.add_argument("--yes", action="store_true", help="не переспрашивать перед записью уже подтверждённых доменов")
    _scan_opts(s)
    s.set_defaults(func=cmd_zapret)

    s = sub.add_parser("lists", help="белый/чёрный списки исключений")
    s.add_argument("which", choices=["exclude", "include"])
    s.add_argument("action", nargs="?", default="show", choices=["show", "add", "remove"])
    s.add_argument("domains", nargs="*")
    s.set_defaults(func=cmd_lists)

    s = sub.add_parser("config", help="настройки")
    s.add_argument("action", nargs="?", default="show", choices=["show", "set", "path"])
    s.add_argument("key", nargs="?")
    s.add_argument("value", nargs="?")
    s.set_defaults(func=cmd_config)

    s = sub.add_parser("web", help="веб-интерфейс на localhost")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8765)
    s.add_argument("--no-browser", action="store_true")
    s.set_defaults(func=cmd_web)
    return p


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # консоль Windows
        except (AttributeError, ValueError):
            pass
    if argv is None:
        argv = sys.argv[1:]
    if not argv and getattr(sys, "frozen", False):
        # blockscan.exe запущен двойным щелчком — открываем веб-интерфейс.
        argv = ["web"]
    args = build_parser().parse_args(argv)
    _setup_logging(args.verbose)
    return args.func(args)
