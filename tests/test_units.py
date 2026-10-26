import json
import os
import struct
import tempfile
import unittest
from pathlib import Path

from blockscan import dnswire, report, sources, zapret
from blockscan.scanner import normalize_domain, targets_from_domains
from blockscan.services import Service, ServiceDB
from blockscan.storage import Storage


def make_response(qid=1, rcode=0, answers=()):
    q = dnswire.build_query("www.example.com", qid=qid)
    header = struct.pack("!HHHHHH", qid, 0x8180 | rcode, 1, len(answers), 0, 0)
    body = q[12:]
    for rtype, rdata in answers:
        body += b"\xc0\x0c" + struct.pack("!HHIH", rtype, 1, 60, len(rdata)) + rdata
    return header + body


class DnsWireTest(unittest.TestCase):
    def test_query_format(self):
        q = dnswire.build_query("Example.COM", qid=0x1234)
        self.assertEqual(q[:2], b"\x12\x34")
        self.assertIn(b"\x07example\x03com\x00", q.lower())

    def test_parse_a_and_cname(self):
        cname = b"\x03cdn\xc0\x10"  # cdn.example.com через указатель
        data = make_response(answers=[(dnswire.TYPE_CNAME, cname), (dnswire.TYPE_A, bytes([1, 2, 3, 4]))])
        ans = dnswire.parse_response(data)
        self.assertEqual(ans.ips, ["1.2.3.4"])
        self.assertEqual(ans.cnames, ["cdn.example.com"])
        self.assertTrue(ans.ok)

    def test_parse_nxdomain(self):
        ans = dnswire.parse_response(make_response(rcode=3))
        self.assertEqual(ans.rcode, "NXDOMAIN")
        self.assertFalse(ans.ok)


class ServicesTest(unittest.TestCase):
    def test_builtin_db_loads_and_matches(self):
        db = ServiceDB.load()
        self.assertEqual(db.match("rr3---sn-abc.googlevideo.com").name, "YouTube")
        self.assertEqual(db.match("web.telegram.org").name, "Telegram")
        self.assertEqual(db.match("gemini.google.com").name, "AI-сервисы")
        self.assertIsNone(db.match("unknown-site-xyz.test"))

    def test_normalize(self):
        self.assertEqual(normalize_domain("https://WWW.Example.com:8443/path?q"), "www.example.com")
        self.assertEqual(normalize_domain("*.example.org"), "example.org")
        self.assertEqual(normalize_domain("localhost"), "")

    def test_targets_from_domains_dedup(self):
        db = ServiceDB([Service("X", "social", ["x.test"])])
        ts = targets_from_domains(["a.x.test", "A.X.TEST", "other.test"], db, "news")
        self.assertEqual([(t.domain, t.service, t.category) for t in ts],
                         [("a.x.test", "X", "social"), ("other.test", None, "news")])


class SourcesTest(unittest.TestCase):
    def test_citizenlab_csv(self):
        text = ("url,category_code,category_description,date_added,source,notes\n"
                "https://meduza.io/,NEWS,News Media,2017-01-01,,\n"
                "https://www.torproject.org/,ANON,Anonymization,2017-01-01,,\n")
        items = sources.parse_citizenlab(text)
        self.assertEqual(items, [{"domain": "meduza.io", "category": "news"},
                                 {"domain": "www.torproject.org", "category": "vpn"}])

    def test_plain_list(self):
        items = sources.parse_plain("# комментарий\nexample.com\n\nhttp://foo.bar/x\nfoo.bar\n1;baz.org;x\n")
        self.assertEqual([i["domain"] for i in items], ["example.com", "foo.bar", "baz.org"])


def result(domain, status, types=(), service=None, category="other"):
    return {"domain": domain, "status": status, "block_types": list(types), "service": service,
            "category": category, "reasons": ["причина"] if types else [], "checked_at": "t"}


class ReportTest(unittest.TestCase):
    def setUp(self):
        self.results = [
            result("www.youtube.com", "blocked", ["SNI/DPI"], "YouTube", "video"),
            result("i.ytimg.com", "available", [], "YouTube", "video"),
            result("a.example.org", "unstable", ["SNI/DPI"]),
            result("b.example.org", "available"),
            result("t.me", "blocked", ["IP"], "Telegram", "messengers"),
        ]

    def test_tree_groups_by_service_and_base_domain(self):
        tree = report.build_tree(self.results)
        self.assertEqual(list(tree), ["messengers", "video", "other"])
        self.assertEqual(set(tree["other"]), {"example.org"})
        self.assertEqual(len(tree["video"]["YouTube"]), 2)

    def test_text_html_csv_json(self):
        text = report.render_text(self.results, only_problems=True)
        self.assertIn("www.youtube.com", text)
        self.assertNotIn("i.ytimg.com", text)
        html = report.render_html(self.results)
        self.assertIn("Видео и стриминг", html)
        self.assertIn("<!doctype html>", html)
        csv_text = report.render_csv(self.results)
        self.assertEqual(csv_text.splitlines()[0].split(",")[0], "category")
        data = json.loads(report.render_json(self.results))
        self.assertEqual(data["summary"]["blocked"], 2)

    def test_diff(self):
        new = [dict(r) for r in self.results]
        new[0] = result("www.youtube.com", "available", [], "YouTube", "video")
        changes = report.diff(self.results, new)
        self.assertEqual(len(changes), 1)
        self.assertIn("→", report.render_diff(changes))


class ZapretTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.storage = Storage(self.dir / "db.sqlite3")
        self.db = ServiceDB([Service("YouTube", "video", ["youtube.com", "googlevideo.com"]),
                             Service("Telegram", "messengers", ["telegram.org"])])
        self.sid = self.storage.start_scan("isp", {})
        for r in (result("www.youtube.com", "blocked", ["SNI/DPI"], "YouTube", "video"),
                  result("telegram.org", "blocked", ["IP"], "Telegram", "messengers"),
                  result("news.test", "blocked", ["HTTP"], None, "news"),
                  result("bank.test", "blocked", ["SNI/DPI"]),
                  result("ok.test", "available")):
            self.storage.add_result(self.sid, r)

    def tearDown(self):
        self.storage.close()
        self.tmp.cleanup()

    def test_suggest_skips_ip_and_excluded(self):
        cfg = {"exclude": ["bank.test"], "include": ["extra.test"]}
        added, skipped = zapret.suggest(self.storage, self.sid, self.db, cfg)
        domains = {s["domain"] for s in self.storage.suggestions("pending")}
        self.assertEqual(domains, {"youtube.com", "googlevideo.com", "news.test", "extra.test"})
        self.assertEqual(skipped, 1)
        self.assertEqual(added, 4)
        # повторный suggest не создаёт дублей и не трогает решения пользователя
        self.storage.set_suggestion_state(["news.test"], "rejected")
        self.assertEqual(zapret.suggest(self.storage, self.sid, self.db, cfg)[0], 0)
        self.assertEqual(self.storage.suggestions("rejected")[0]["domain"], "news.test")

    def test_apply_requires_path_and_appends_with_backup(self):
        zapret.suggest(self.storage, self.sid, self.db, {})
        with self.assertRaises(ValueError):
            zapret.apply(self.storage, {"zapret": {}}, ["youtube.com"])
        hostlist = self.dir / "hosts.txt"
        hostlist.write_text("existing.org\nyoutube.com", encoding="utf-8")
        cfg = {"zapret": {"hostlist_path": str(hostlist)}, "exclude": []}
        new, backup = zapret.apply(self.storage, cfg, ["youtube.com", "googlevideo.com"])
        self.assertEqual(new, ["googlevideo.com"])
        self.assertTrue(backup and backup.exists())
        lines = zapret.read_hostlist(hostlist)
        self.assertEqual(lines, ["existing.org", "youtube.com", "googlevideo.com"])
        self.assertEqual({s["domain"] for s in self.storage.suggestions("applied")},
                         {"youtube.com", "googlevideo.com"})
        self.assertEqual(zapret.verify_domains(self.storage, self.sid), ["www.youtube.com"])

    def test_export_by_category(self):
        out = self.dir / "lists"
        written = zapret.export_hostlists(self.storage.results(self.sid), self.db, out, "category", ["bank.test"])
        self.assertEqual(set(written), {"zapret-video.txt", "zapret-news.txt", "zapret-all.txt"})
        self.assertIn("googlevideo.com", (out / "zapret-video.txt").read_text(encoding="utf-8"))

    def test_collapse_and_slug(self):
        self.assertEqual(zapret.collapse(["ggpht.com", "yt3.ggpht.com", "YouTube.com"]), ["ggpht.com", "youtube.com"])
        self.assertEqual(zapret._slug("Медуза"), "meduza")
        self.assertEqual(zapret._slug("X (Twitter)"), "x-twitter")

    def test_recommendations(self):
        recs = zapret.recommendations(self.storage.results(self.sid))
        by_type = {r["type"]: r for r in recs}
        self.assertTrue(by_type["SNI/DPI"]["zapret"])
        self.assertFalse(by_type["IP"]["zapret"])


class ConfigTest(unittest.TestCase):
    def test_set_value(self):
        from blockscan import config
        with tempfile.TemporaryDirectory() as d:
            os.environ["BLOCKSCAN_HOME"] = d
            try:
                cfg = config.load()
                config.set_value(cfg, "zapret.hostlist_path", "/opt/zapret/ipset/zapret-hosts-user.txt")
                config.set_value(cfg, "rps", "2.5")
                config.save(cfg)
                again = config.load()
                self.assertEqual(again["zapret"]["hostlist_path"], "/opt/zapret/ipset/zapret-hosts-user.txt")
                self.assertEqual(again["rps"], 2.5)
                self.assertEqual(again["threads"], config.DEFAULTS["threads"])
            finally:
                del os.environ["BLOCKSCAN_HOME"]


if __name__ == "__main__":
    unittest.main()
