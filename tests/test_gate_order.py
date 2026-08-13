import pathlib
import unittest

class GateOrderTest(unittest.TestCase):
    def test_order(self):
        s = pathlib.Path("miniapp/app.js").read_text()
        self.assertLess(s.index("requireChannelSubscriptions"), s.index("Navbar.init"))
