"""Unit tests for stock visualizer input constraints."""

import re
import unittest
from datetime import datetime


def is_valid_symbol(value):
    if not isinstance(value, str):
        return False
    return bool(re.fullmatch(r"[A-Z]{1,7}", value))


def is_valid_chart_type(value):
    if not isinstance(value, str) or len(value) != 1:
        return False
    return value in ("1", "2")


def is_valid_time_series(value):
    if not isinstance(value, str) or len(value) != 1:
        return False
    return value in ("1", "2", "3", "4")


def is_valid_ymd_date(value):
    if not isinstance(value, str):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except (TypeError, ValueError):
        return False
    return True


class TestSymbol(unittest.TestCase):
    def test_valid(self):
        for s in ("A", "MSFT", "AAPL", "IBM", "ABCDEFG"):
            with self.subTest(s=s):
                self.assertTrue(is_valid_symbol(s), f"{s!r} should be valid")

    def test_invalid(self):
        for s in (
            "",
            "ABCDEFGH",
            "aapl",
            "Aapl",
            "A1",
            " AB",
            "A B",
        ):
            with self.subTest(s=s):
                self.assertFalse(is_valid_symbol(s), f"{s!r} should be invalid")


class TestChartType(unittest.TestCase):
    def test_valid(self):
        for c in ("1", "2"):
            with self.subTest(c=c):
                self.assertTrue(is_valid_chart_type(c), f"{c!r} should be valid")

    def test_invalid(self):
        for c in (
            "",
            "0",
            "3",
            "10",
            "12",
            "line",
            "bar",
        ):
            with self.subTest(c=c):
                self.assertFalse(is_valid_chart_type(c), f"{c!r} should be invalid")


class TestTimeSeries(unittest.TestCase):
    def test_valid(self):
        for t in ("1", "2", "3", "4"):
            with self.subTest(t=t):
                self.assertTrue(is_valid_time_series(t), f"{t!r} should be valid")

    def test_invalid(self):
        for t in (
            "",
            "0",
            "5",
            "12",
            "1 ",
            "1a",
        ):
            with self.subTest(t=t):
                self.assertFalse(is_valid_time_series(t), f"{t!r} should be invalid")


class TestStartDate(unittest.TestCase):
    def test_valid(self):
        for d in (
            "2000-01-01",
            "2020-02-29",
            "1999-12-31",
        ):
            with self.subTest(d=d):
                self.assertTrue(is_valid_ymd_date(d), f"{d!r} should be valid")

    def test_invalid(self):
        for d in (
            "2020-13-01",
            "2023-02-30",
            "20-01-2000",
            "2000/01/01",
            "",
        ):
            with self.subTest(d=d):
                self.assertFalse(is_valid_ymd_date(d), f"{d!r} should be invalid")

    def test_non_string(self):
        self.assertFalse(is_valid_ymd_date(None))
        self.assertFalse(is_valid_ymd_date(20000101))


class TestEndDate(unittest.TestCase):
    def test_valid(self):
        for d in (
            "2015-06-15",
            "2020-02-29",
        ):
            with self.subTest(d=d):
                self.assertTrue(is_valid_ymd_date(d), f"{d!r} should be valid")

    def test_invalid(self):
        for d in (
            "not-a-date",
            "00-00-00",
        ):
            with self.subTest(d=d):
                self.assertFalse(is_valid_ymd_date(d), f"{d!r} should be invalid")


if __name__ == "__main__":
    unittest.main()
