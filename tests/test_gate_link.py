import pathlib
import unittest

class GateLinkTest(unittest.TestCase):
    def test_open_link(self):
        self.assertIn("openTelegramLink", pathlib.Path("miniapp/app.js").read_text())
