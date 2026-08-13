import pathlib
import unittest


class SubscriptionGateTest(unittest.TestCase):
    def test_startup_requires_subscription_before_navigation(self):
        source = pathlib.Path("miniapp/app.js").read_text(encoding="utf-8")
        self.assertIn('await requireChannelSubscriptions();', source)
        self.assertIn('/subscription/status', source)
        self.assertLess(source.index('await requireChannelSubscriptions();'), source.index('Navbar.init();'))


if __name__ == "__main__":
    unittest.main()
