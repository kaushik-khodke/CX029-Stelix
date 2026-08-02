"""
Pytest Unit Tests for Pharmacy Parsing & Order Processing
"""

from routes.pharmacy import parse_quantity_word


def test_parse_quantity_word_integers():
    assert parse_quantity_word(1) == 1
    assert parse_quantity_word(5) == 5
    assert parse_quantity_word(0) == 1  # Minimum 1


def test_parse_quantity_word_strings():
    assert parse_quantity_word("one") == 1
    assert parse_quantity_word("two") == 2
    assert parse_quantity_word("four pills") == 4
    assert parse_quantity_word("10 tablets") == 10
    assert parse_quantity_word("unknown") == 1
