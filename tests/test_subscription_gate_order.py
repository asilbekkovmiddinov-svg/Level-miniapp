import pathlib
import unittest

class SubscriptionGateOrderTest(unittest.TestCase):
    def test_gate_precedes_navbar(self):
        source = pathlib.Path("miniapp/app.js").read_text(encoding="utf-8")
        self.assertLess(source.index("await requireChannelSubscriptions();"), source.index("Navbar.init();"))

if __name__ == "__main__":
    unittest.main()
