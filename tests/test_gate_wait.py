import pathlib
import unittest

class GateWaitTest(unittest.TestCase):
    def test_gate_is_awaited(self):
        self.assertIn("await requireChannelSubscriptions()", pathlib.Path("miniapp/app.js").read_text())
