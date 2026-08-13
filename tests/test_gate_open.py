import pathlib
import unittest

class GateOpenTest(unittest.TestCase):
    def test_telegram_link(self):
        self.assertIn("openTelegramLink", pathlib.Path("miniapp/app.js").read_text())
