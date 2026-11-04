"""Classification and uncertainty checks for the read-only activity panel."""

import os
import unittest

os.environ.setdefault("JWT_SECRET_KEY", "012345789abcdef0123456789abcdef0")

from services.network_activity import build_snapshot


class NetworkActivityTests(unittest.TestCase):
    def test_directions_nat_identity_and_percentages(self):
        connections = [
            {"src_address": "10.2.1.10", "dst_address": "8.8.8.8", "dst_port": "443",
             "protocol": "tcp", "orig_bytes": 100, "repl_bytes": 900, "seen_reply": True},
            {"src_address": "1.2.3.4", "dst_address": "203.0.113.5", "dst_port": "443",
             "protocol": "tcp", "orig_bytes": 20, "repl_bytes": 0, "seen_reply": False,
             "dstnat": True, "reply_src_address": "10.2.1.20", "reply_src_port": "8443"},
            {"src_address": "10.2.1.10", "dst_address": "10.2.1.20", "dst_port": "22",
             "protocol": "tcp", "orig_bytes": 50, "repl_bytes": 50, "seen_reply": True},
        ]
        leases = [{"active_address": "10.2.1.10", "status": "bound", "host_name": "laptop", "active_mac_address": "02:11:22:33:44:55"}]
        assets = [{"id": 7, "_itemtype": "Computer", "name": "Servidor"}]
        snapshot = build_snapshot(connections, [], leases, [], assets,
                                  {"Computer:7": "10.2.1.20"}, {}, "10.2.0.0/16")
        self.assertEqual(len(snapshot["accesses"]["outbound"]), 1)
        inbound = snapshot["accesses"]["inbound"][0]
        self.assertEqual((inbound["target_ip"], inbound["target_port"], inbound["without_reply"]),
                         ("10.2.1.20", "8443", 1))
        self.assertEqual(len(snapshot["accesses"]["internal"]), 1)
        people = {row["ip"]: row for row in snapshot["participants"]}
        self.assertEqual((people["10.2.1.10"]["bytes"], people["10.2.1.20"]["bytes"]), (1100, 120))
        self.assertEqual(round(sum(p["percent"] for p in people.values())), 100)
        self.assertEqual(people["10.2.1.10"]["identity"]["source"], "dhcp")
        self.assertEqual(people["10.2.1.10"]["identity"]["mac_kind"], "local_o_aleatoria")
        self.assertEqual(people["10.2.1.20"]["identity"]["label"], "Servidor")

    def test_public_destination_without_attribution_is_not_called_an_internal_service(self):
        connections = [{"src_address": "1.2.3.4", "dst_address": "203.0.113.5",
                        "dst_port": "443", "dstnat": True, "orig_bytes": 1}]
        snapshot = build_snapshot(connections, [], [], [], [], {}, {}, "10.2.0.0/16")
        self.assertEqual(snapshot["accesses"]["inbound"], [])

    def test_unique_nat_rule_is_marked_inferred(self):
        connections = [{"src_address": "1.2.3.4", "dst_address": "203.0.113.5",
                        "dst_port": "443", "protocol": "tcp", "dstnat": True}]
        rules = [{"chain": "dstnat", "protocol": "tcp", "dst_port": "443",
                  "to_addresses": "10.2.1.20", "to_ports": "8443", "disabled": False}]
        snapshot = build_snapshot(connections, [], [], rules, [], {}, {}, "10.2.0.0/16")
        row = snapshot["accesses"]["inbound"][0]
        self.assertEqual((row["target_ip"], row["target_source"]), ("10.2.1.20", "nat_rule_inferred"))

    def test_hairpin_nat_is_internal_activity(self):
        connections = [{"src_address": "10.2.1.10", "dst_address": "203.0.113.5",
                        "dst_port": "443", "protocol": "tcp", "dstnat": True,
                        "reply_src_address": "10.2.1.20", "reply_src_port": "8443"}]
        snapshot = build_snapshot(connections, [], [], [], [], {}, {}, "10.2.0.0/16")
        self.assertEqual(snapshot["accesses"]["outbound"], [])
        self.assertEqual(snapshot["accesses"]["internal"][0]["target_ip"], "10.2.1.20")


if __name__ == "__main__":
    unittest.main()
