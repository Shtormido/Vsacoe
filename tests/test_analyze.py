import unittest

from blockscan import analyze
from blockscan.analyze import AVAILABLE, BLOCKED, DNS, DPI, ERROR, HTTP, IP, QUIC, UNSTABLE, Verdict

OK = {"outcome": "ok"}
RESET = {"outcome": "reset", "detail": "RST"}
TIMEOUT = {"outcome": "timeout", "detail": "таймаут"}


def obs(**kw):
    base = {
        "domain": "site.test",
        "network_ok": True,
        "sys_dns": {"rcode": "NOERROR", "ips": ["93.184.216.34"]},
        "ref_dns": {"rcode": "NOERROR", "ips": ["93.184.216.34"]},
        "target_ip": "93.184.216.34",
        "tcp443": OK, "tcp80": OK,
        "tls_sni": OK,
        "https": {"outcome": "ok", "status": 200, "received": 5000},
        "http": {"outcome": "ok", "status": 301, "location": "https://site.test/", "body": ""},
    }
    base.update(kw)
    return base


class AnalyzeTest(unittest.TestCase):
    def test_available(self):
        v = analyze.analyze(obs())
        self.assertEqual(v.status, AVAILABLE)
        self.assertEqual(v.block_types, [])

    def test_dns_nxdomain(self):
        v = analyze.analyze(obs(sys_dns={"rcode": "NXDOMAIN", "ips": []}))
        self.assertEqual(v.status, BLOCKED)
        self.assertEqual(v.block_types, [DNS])

    def test_dns_stub(self):
        v = analyze.analyze(obs(sys_dns={"rcode": "NOERROR", "ips": ["10.10.10.10"]}))
        self.assertEqual(v.block_types, [DNS])

    def test_dns_custom_stub(self):
        v = analyze.analyze(obs(sys_dns={"rcode": "NOERROR", "ips": ["195.1.2.3"]},
                                dns_spoof_check=OK), stub_ips=frozenset({"195.1.2.3"}))
        self.assertEqual(v.block_types, [DNS])

    def test_dns_cdn_mismatch_is_fine(self):
        v = analyze.analyze(obs(sys_dns={"rcode": "NOERROR", "ips": ["1.2.3.4"]}, dns_spoof_check=OK))
        self.assertEqual(v.status, AVAILABLE)

    def test_dns_spoof_foreign_cert(self):
        v = analyze.analyze(obs(sys_dns={"rcode": "NOERROR", "ips": ["1.2.3.4"]},
                                dns_spoof_check={"outcome": "cert_invalid", "detail": "hostname mismatch"}))
        self.assertEqual(v.block_types, [DNS])

    def test_reference_failure_is_error(self):
        v = analyze.analyze(obs(ref_dns={"rcode": "NOERROR", "ips": [], "error": "doh: timeout"}))
        self.assertEqual(v.status, ERROR)

    def test_ip_block(self):
        v = analyze.analyze(obs(tcp443=TIMEOUT, tcp80=TIMEOUT, http=None))
        self.assertEqual(v.block_types, [IP])

    def test_network_down_is_error(self):
        v = analyze.analyze(obs(tcp443=TIMEOUT, network_ok=False))
        self.assertEqual(v.status, ERROR)

    def test_sni_block(self):
        v = analyze.analyze(obs(tls_sni=RESET, tls_nosni={"outcome": "alert"}, https=None))
        self.assertEqual(v.status, BLOCKED)
        self.assertEqual(v.block_types, [DPI])

    def test_tls_fails_both_ways_is_unclear(self):
        v = analyze.analyze(obs(tls_sni=RESET, tls_nosni=RESET, https=None))
        self.assertEqual(v.status, ERROR)

    def test_throttling_stall(self):
        v = analyze.analyze(obs(https={"outcome": "stall", "received": 16500}))
        self.assertEqual(v.block_types, [DPI])

    def test_data_cut_after_handshake(self):
        v = analyze.analyze(obs(https={"outcome": "reset", "detail": "после рукопожатия: RST"}))
        self.assertEqual(v.block_types, [DPI])

    def test_http_blockpage_body(self):
        v = analyze.analyze(obs(http={"outcome": "ok", "status": 200,
                                      "body": "<h1>Доступ к ресурсу ограничен</h1> по решению Роскомнадзор"}))
        self.assertEqual(v.block_types, [HTTP])

    def test_http_blockpage_redirect(self):
        v = analyze.analyze(obs(http={"outcome": "ok", "status": 302,
                                      "location": "http://warning.rt.ru/?id=1&st=site.test"}))
        self.assertEqual(v.block_types, [HTTP])

    def test_own_redirect_not_blockpage(self):
        v = analyze.analyze(obs(http={"outcome": "ok", "status": 302,
                                      "location": "https://www.site.test/deny-cookies"}))
        self.assertEqual(v.status, AVAILABLE)

    def test_http_host_reset(self):
        v = analyze.analyze(obs(http=RESET, http_neutral={"outcome": "ok", "status": 404}))
        self.assertEqual(v.block_types, [HTTP])

    def test_quic_block_only_for_quic_services(self):
        q = {"outcome": "timeout"}
        self.assertEqual(analyze.analyze(obs(quic=q, quic_control_ok=True, uses_quic=True)).block_types, [QUIC])
        self.assertEqual(analyze.analyze(obs(quic=q, quic_control_ok=True, uses_quic=False)).status, AVAILABLE)
        self.assertEqual(analyze.analyze(obs(quic=q, quic_control_ok=False, uses_quic=True)).status, AVAILABLE)

    def test_service_endpoints_blocked(self):
        eps = [{"addr": "149.154.167.51:443", "probe": TIMEOUT}, {"addr": "91.108.56.130:443", "probe": TIMEOUT}]
        v = analyze.analyze(obs(endpoints=eps))
        self.assertEqual(v.block_types, [IP])

    def test_multiple_types(self):
        v = analyze.analyze(obs(sys_dns={"rcode": "NXDOMAIN", "ips": []}, tls_sni=RESET,
                                tls_nosni=OK, https=None))
        self.assertEqual(v.block_types, [DNS, DPI])


class CombineTest(unittest.TestCase):
    def test_same(self):
        v = analyze.combine([Verdict(BLOCKED, [DPI]), Verdict(BLOCKED, [DPI])])
        self.assertEqual(v.status, BLOCKED)

    def test_flapping_is_unstable(self):
        v = analyze.combine([Verdict(BLOCKED, [DPI]), Verdict(AVAILABLE), Verdict(BLOCKED, [DPI])])
        self.assertEqual(v.status, UNSTABLE)
        self.assertEqual(v.block_types, [DPI])


if __name__ == "__main__":
    unittest.main()
