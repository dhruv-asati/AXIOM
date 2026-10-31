"""Focused tests for deterministic English/Hinglish text normalization."""

from app.services.ai.normalization import NormalizationResult, normalize_text


def test_normalizes_english_input() -> None:
    result = normalize_text("Need a ROOM for 45 people on Tuesday.")

    assert result.normalized_text == "need a room for 45 people on tuesday"
    assert result.ambiguous_temporal_terms == ()


def test_normalizes_common_hinglish_vocabulary() -> None:
    result = normalize_text(
        "Seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye"
    )

    assert result.normalized_text == (
        "seminar hall kal evening 6 baje 2 hours 100 log mic need"
    )
    assert result.ambiguous_temporal_terms == ("kal",)


def test_normalizes_mixed_english_and_hinglish() -> None:
    result = normalize_text("Book seminar hall mein Friday shaam for 2 ghante.")

    assert result.normalized_text == "book seminar hall in friday evening for 2 hours"


def test_normalizes_extra_whitespace_and_punctuation() -> None:
    result = normalize_text("  Need,,,   a room!!!  (please)  ")

    assert result.normalized_text == "need a room please"


def test_preserves_numbers_times_and_identifier_characters() -> None:
    result = normalize_text("SH-2 at 6:30 PM for 1,200 people; request BR-07.")

    assert result.normalized_text == "sh-2 at 6:30 pm for 1,200 people request br-07"


def test_kal_and_parso_remain_ambiguous() -> None:
    result = normalize_text("Kal ya parso, please book a room.")

    assert result.normalized_text == "kal ya parso please book a room"
    assert result.ambiguous_temporal_terms == ("kal", "parso")


def test_english_me_is_not_rewritten_without_hinglish_context() -> None:
    result = normalize_text("Book a room for me tomorrow.")

    assert result.normalized_text == "book a room for me tomorrow"


def test_me_maps_to_in_in_hinglish_context() -> None:
    result = normalize_text("seminar hall me chahiye")

    assert result.normalized_text == "seminar hall in need"


def test_empty_and_whitespace_only_inputs() -> None:
    empty = normalize_text("")
    whitespace = normalize_text(" \t\n ")

    assert empty.normalized_text == ""
    assert whitespace.normalized_text == ""
    assert empty.ambiguous_temporal_terms == ()
    assert whitespace.ambiguous_temporal_terms == ()


def test_original_input_is_preserved_exactly() -> None:
    original = "  Seminar hall mein kal shaam 6 baje!  "
    result = normalize_text(original)

    assert isinstance(result, NormalizationResult)
    assert result.original_text == original
    assert result.original_text is original
    assert result.normalized_text == "seminar hall in kal evening 6 baje"
