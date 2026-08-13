import pathlib
import unittest

class GateBlocksStartupTest(unittest.TestCase):
    def test_gate_awaited(self):
        text = pathlib.Path("miniapp/app.js").read_text(encoding="utf-8")
        self.assertIn("await requireChannelSubscriptions();", text)
