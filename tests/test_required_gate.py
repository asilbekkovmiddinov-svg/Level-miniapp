import pathlib
import unittest

class RequiredGateTest(unittest.TestCase):
    def test_function(self):
        text = pathlib.Path("miniapp/app.js").read_text(encoding="utf-8")
        self.assertIn("requireChannelSubscriptions", text)
