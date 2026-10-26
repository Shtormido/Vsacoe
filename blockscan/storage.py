"""Локальное хранилище SQLite: сканирования, результаты, цели, предложения для zapret."""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    isp TEXT,
    kind TEXT NOT NULL DEFAULT 'scan',
    note TEXT,
    params TEXT
);
CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    service TEXT,
    category TEXT,
    status TEXT NOT NULL,
    block_types TEXT,
    reasons TEXT,
    details TEXT,
    checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS results_scan ON results(scan_id);
CREATE INDEX IF NOT EXISTS results_domain ON results(domain);
CREATE TABLE IF NOT EXISTS targets (
    domain TEXT PRIMARY KEY,
    category TEXT,
    service TEXT,
    source TEXT,
    added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL UNIQUE,
    service TEXT,
    category TEXT,
    block_types TEXT,
    state TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected | applied
    scan_id INTEGER,
    created_at TEXT NOT NULL,
    decided_at TEXT,
    applied_at TEXT
);
"""


def now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


class Storage:
    def __init__(self, path: Path | str):
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript(SCHEMA)
        self.lock = threading.Lock()

    def close(self) -> None:
        self.conn.close()

    def _exec(self, sql: str, args: tuple = ()) -> sqlite3.Cursor:
        with self.lock, self.conn:
            return self.conn.execute(sql, args)

    def _all(self, sql: str, args: tuple = ()) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(sql, args).fetchall()]

    # --- сканирования
    def start_scan(self, isp: str, params: dict, kind: str = "scan", note: str = "") -> int:
        cur = self._exec("INSERT INTO scans(started_at, isp, kind, note, params) VALUES (?,?,?,?,?)",
                         (now(), isp, kind, note, json.dumps(params, ensure_ascii=False)))
        return int(cur.lastrowid)

    def update_scan_params(self, scan_id: int, params: dict) -> None:
        self._exec("UPDATE scans SET params=? WHERE id=?", (json.dumps(params, ensure_ascii=False), scan_id))

    def finish_scan(self, scan_id: int) -> None:
        self._exec("UPDATE scans SET finished_at=? WHERE id=?", (now(), scan_id))

    def add_result(self, scan_id: int, r: dict) -> None:
        self._exec(
            "INSERT INTO results(scan_id, domain, service, category, status, block_types, reasons, details, checked_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (scan_id, r["domain"], r.get("service"), r.get("category"), r["status"],
             ",".join(r.get("block_types") or []), json.dumps(r.get("reasons") or [], ensure_ascii=False),
             json.dumps(r.get("details") or {}, ensure_ascii=False), r.get("checked_at") or now()))

    def scans(self, limit: int = 50) -> list[dict]:
        return self._all(
            "SELECT s.*, (SELECT COUNT(*) FROM results r WHERE r.scan_id=s.id) AS total,"
            " (SELECT COUNT(*) FROM results r WHERE r.scan_id=s.id AND r.status='blocked') AS blocked,"
            " (SELECT COUNT(*) FROM results r WHERE r.scan_id=s.id AND r.status='unstable') AS unstable"
            " FROM scans s ORDER BY s.id DESC LIMIT ?", (limit,))

    def scan(self, scan_id: int) -> dict | None:
        rows = self._all("SELECT * FROM scans WHERE id=?", (scan_id,))
        return rows[0] if rows else None

    def last_scan_id(self, kind: str | None = None, offset: int = 0) -> int | None:
        if kind:
            rows = self._all("SELECT id FROM scans WHERE kind=? ORDER BY id DESC LIMIT 1 OFFSET ?", (kind, offset))
        else:
            rows = self._all("SELECT id FROM scans ORDER BY id DESC LIMIT 1 OFFSET ?", (offset,))
        return rows[0]["id"] if rows else None

    def results(self, scan_id: int) -> list[dict]:
        rows = self._all("SELECT * FROM results WHERE scan_id=? ORDER BY category, service, domain", (scan_id,))
        for r in rows:
            r["block_types"] = [x for x in (r["block_types"] or "").split(",") if x]
            r["reasons"] = json.loads(r["reasons"] or "[]")
            r["details"] = json.loads(r["details"] or "{}")
        return rows

    def delete_scan(self, scan_id: int) -> None:
        self._exec("DELETE FROM scans WHERE id=?", (scan_id,))

    # --- цели
    def add_targets(self, items: list[dict], source: str) -> int:
        added = 0
        with self.lock, self.conn:
            for it in items:
                cur = self.conn.execute(
                    "INSERT OR IGNORE INTO targets(domain, category, service, source, added_at) VALUES (?,?,?,?,?)",
                    (it["domain"], it.get("category"), it.get("service"), source, now()))
                added += cur.rowcount
        return added

    def targets(self, source: str | None = None) -> list[dict]:
        if source:
            return self._all("SELECT * FROM targets WHERE source=? ORDER BY domain", (source,))
        return self._all("SELECT * FROM targets ORDER BY domain")

    def clear_targets(self, source: str | None = None) -> int:
        if source:
            return self._exec("DELETE FROM targets WHERE source=?", (source,)).rowcount
        return self._exec("DELETE FROM targets").rowcount

    # --- предложения zapret
    def upsert_suggestion(self, domain: str, service: str | None, category: str | None,
                          block_types: list[str], scan_id: int) -> bool:
        """Добавляет предложение. Решённые ранее (принятые/отклонённые) не трогаем."""
        with self.lock, self.conn:
            row = self.conn.execute("SELECT state FROM suggestions WHERE domain=?", (domain,)).fetchone()
            if row is None:
                self.conn.execute(
                    "INSERT INTO suggestions(domain, service, category, block_types, scan_id, created_at)"
                    " VALUES (?,?,?,?,?,?)", (domain, service, category, ",".join(block_types), scan_id, now()))
                return True
            if row["state"] == "pending":
                self.conn.execute("UPDATE suggestions SET block_types=?, scan_id=? WHERE domain=?",
                                  (",".join(block_types), scan_id, domain))
            return False

    def suggestions(self, state: str | None = None) -> list[dict]:
        if state:
            rows = self._all("SELECT * FROM suggestions WHERE state=? ORDER BY category, service, domain", (state,))
        else:
            rows = self._all("SELECT * FROM suggestions ORDER BY category, service, domain")
        for r in rows:
            r["block_types"] = [x for x in (r["block_types"] or "").split(",") if x]
        return rows

    def set_suggestion_state(self, domains: list[str], state: str) -> None:
        col = "applied_at" if state == "applied" else "decided_at"
        with self.lock, self.conn:
            for d in domains:
                self.conn.execute(f"UPDATE suggestions SET state=?, {col}=? WHERE domain=?", (state, now(), d))
