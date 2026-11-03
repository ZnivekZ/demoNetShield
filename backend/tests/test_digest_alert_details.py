"""Check the compact rule comparison saved with each agent's Digest."""

import os
import unittest

os.environ.setdefault("JWT_SECRET_KEY", "0123456789abcdef0123456789abcdef")

from services.digest_service import _summarize_alert_types


class DigestAlertDetailTests(unittest.TestCase):
    def test_groups_new_recurring_and_previous_only_rule_types(self):
        def alert(rule_id, description, level):
            return {"rule": {"id": rule_id, "description": description, "level": level}}

        today = [
            alert("100", "Inicio de sesión fallido", 10),
            alert("100", "Inicio de sesión fallido", 10),
            alert("200", "Archivo modificado", 12),
        ]
        yesterday = [
            alert("100", "Inicio de sesión fallido", 10),
            alert("300", "Servicio detenido", 7),
        ]

        details = _summarize_alert_types(today, yesterday)
        by_id = {item["rule_id"]: item for item in details}

        self.assertEqual((by_id["100"]["today_count"], by_id["100"]["yesterday_count"]), (2, 1))
        self.assertEqual((by_id["200"]["today_count"], by_id["200"]["yesterday_count"]), (1, 0))
        self.assertEqual((by_id["300"]["today_count"], by_id["300"]["yesterday_count"]), (0, 1))
        self.assertEqual(by_id["200"]["level"], 12)
        self.assertEqual(details[0]["rule_id"], "200")


if __name__ == "__main__":
    unittest.main()
