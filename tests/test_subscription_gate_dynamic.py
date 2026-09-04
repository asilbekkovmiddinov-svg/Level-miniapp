from pathlib import Path


def test_subscription_gate_blocks_startup_and_renders_backend_channels():
    source = Path("miniapp/app.js").read_text(encoding="utf-8")
    css = Path("miniapp/subscription-gate.css").read_text(encoding="utf-8")
    index = Path("miniapp/index.html").read_text(encoding="utf-8")

    assert "await requireChannelSubscriptions();" in source
    assert source.index("await requireChannelSubscriptions();") < source.index("Navbar.init();")
    assert "missing_channels" in source
    assert "subscriptionGate" in source
    assert "openTelegramLink(channel.url)" in source
    assert "while (true)" in source
    assert "temporarily disabled" not in source
    assert ".subscription-gate" in css
    assert "subscription-gate.css" in index
