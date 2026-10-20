import pytest

from app import calculators as c


def test_sam_som_course_example():
    assert c.sam(15e9, 0.30, 0.10) == pytest.approx(450e6)
    assert c.som(450e6, 0.03) == pytest.approx(13.5e6)
    ms = c.market_sizing(15e9, 0.30, 0.10, 0.03)
    assert ms["sam_usd"] == pytest.approx(450e6) and ms["som_usd"] == pytest.approx(13.5e6)


def test_cpm_course_example():
    assert c.cpm(185_000, 10_000_000) == pytest.approx(18.50)


def test_lift():
    assert c.lift(2.0, 2.5) == pytest.approx(25.0)
    with pytest.raises(ValueError):
        c.lift(0, 1)


def test_reverse_waterfall_chains():
    w = c.reverse_waterfall(1_000_000, 10_000, {"opportunity_to_won": 0.25})
    steps = w["waterfall"]
    assert steps[-1]["stage"] == "Closed-won" and steps[-1]["count"] == pytest.approx(100)
    assert steps[-2]["count"] == pytest.approx(400)  # 100 / 0.25
    for a, b in zip(steps, steps[1:]):
        assert b["count"] == pytest.approx(a["count"] * a["conversion_to_next"], rel=1e-3)
    assert any("course default" in a for a in w["assumptions"])
    assert not any("opportunity_to_won" in a for a in w["assumptions"])


def test_plg_waterfall_and_funnel_metrics():
    w = c.plg_waterfall(120_000, 1_200)
    assert [s["stage"] for s in w["waterfall"]] == ["Visitors", "Signup/Trial", "PQL", "Customers"]
    assert w["waterfall"][-1]["count"] == pytest.approx(100)
    fm = c.funnel_metrics(1000, 300, 50, 5, 200)
    assert fm["open_rate"] == 0.3 and fm["click_through_rate"] == 0.05 and fm["conversion_rate"] == 0.1 and fm["revenue"] == 1000


def test_ltv_cac():
    assert c.ltv_cac(36_000, 9_000)["ltv_exceeds_cac"] is True
    assert c.ltv_cac(None, 9_000)["ltv_exceeds_cac"] is None


def test_ecommerce_waterfall_course_example():
    from app.calculators import ecommerce_waterfall
    steps = ecommerce_waterfall(4_000_000, 310, visitor_to_order=0.016)
    assert [s["stage"] for s in steps] == ["Visitors", "Add to cart", "Orders"]
    assert abs(steps[-1]["count"] - 4_000_000 / 310) < 1
    assert 780_000 < steps[0]["count"] < 830_000  # ~806k visitors, not tens of millions
