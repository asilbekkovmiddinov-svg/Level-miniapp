import pathlib
import unittest

class GateEndpointTest(unittest.TestCase):
    def test_status_path_present(self):
        text = pathlib.Path("miniapp/app.js").read_text(encoding="utf-8")
        self.assertIn("subscription/status", text)
