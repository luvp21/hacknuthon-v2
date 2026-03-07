"""
fuzzy_menu_match.py - Fuzzy matching to correct STT recognition errors.

Maps mis-recognised speech tokens to canonical menu item names using
rapidfuzz for fast approximate string matching.
"""

import logging
from rapidfuzz import process, fuzz

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default restaurant menu
# ---------------------------------------------------------------------------

RESTAURANT_MENU: dict[str, list[str]] = {
    # Pizzas
    "paneer pizza": ["panir piza", "paner pizza", "paneer pizaa", "paneer pisaa"],
    "margherita pizza": ["margarita pizza", "margrita pizza", "marghereta pizza"],
    "chicken pizza": ["chiken pizza", "chikn pizza", "chickin pizza"],
    "veg pizza": ["veg piza", "veggie pizza", "vegetable pizza"],
    # Burgers
    "veg burger": ["veg burgar", "veg burgur", "veg brgr"],
    "chicken burger": ["chiken burger", "chikn burger", "chicken burgur"],
    "paneer burger": ["paner burger", "panir burger"],
    # Drinks
    "coke": ["cok", "coek", "kok", "cold drink", "cola"],
    "pepsi": ["pepesy", "pepci", "pepsy"],
    "mango lassi": ["mango lasi", "mango lasee", "mango lassie"],
    "chai": ["chay", "chaye", "tea", "cha"],
    "coffee": ["cofee", "coffe", "cafe"],
    "water": ["paani", "pani", "watter"],
    # Indian dishes
    "butter naan": ["butter nan", "butr naan", "naan", "nan"],
    "garlic naan": ["garlic nan", "garlik naan"],
    "dal makhani": ["dal makhni", "dal makahni", "daal makhani"],
    "paneer butter masala": ["paneer butter masaala", "paner butter masala", "paneer makhani"],
    "biryani": ["biriyani", "biryaani", "briyani", "birryani"],
    "samosa": ["samosaa", "samossa", "samosa"],
    "garlic bread": ["garlic bred", "garlik bread", "garlic braed"],
    # Extras
    "extra cheese": ["extra chees", "extra cheze", "add cheese"],
    "no spice": ["no spicy", "less spice", "mild"],
}

# Flat list for matching: (alias, canonical)
_ALIAS_MAP: list[tuple[str, str]] = []

for canonical, aliases in RESTAURANT_MENU.items():
    _ALIAS_MAP.append((canonical, canonical))   # canonical matches itself
    for alias in aliases:
        _ALIAS_MAP.append((alias, canonical))

_ALL_ALIASES = [pair[0] for pair in _ALIAS_MAP]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def correct_order_text(text: str, menu_items: list[str] | None = None, threshold: int = 72) -> str:
    """Correct speech recognition errors in an order text.

    Scans every token window in *text* and replaces tokens that closely
    match a menu item alias with the canonical menu item name.

    Args:
        text:       Raw transcribed order string.
        menu_items: Optional custom list of canonical item names to match against.
                    If None, uses the default RESTAURANT_MENU.
        threshold:  Minimum rapidfuzz score (0-100) to accept a correction.

    Returns:
        Corrected order text.
    """
    if not text:
        return text

    if menu_items is not None:
        return _correct_against_custom(text, menu_items, threshold)

    return _correct_against_default(text, threshold)


def correct_with_default_menu(text: str, threshold: int = 72) -> str:
    """Convenience wrapper: correct text using the built-in RESTAURANT_MENU.

    Args:
        text:      Raw transcribed order text.
        threshold: Minimum match score.

    Returns:
        Corrected order string.
    """
    return correct_order_text(text, menu_items=None, threshold=threshold)


def find_menu_items(text: str, top_k: int = 5, threshold: int = 60) -> list[dict]:
    """Extract likely menu items mentioned in a text.

    Args:
        text:      Transcribed order text.
        top_k:     Max number of candidate items to return.
        threshold: Minimum score for inclusion.

    Returns:
        List of dicts: {item, score, matched_phrase}
    """
    text_lower = text.lower()
    results = []
    seen: set[str] = set()

    # Try multi-word windows of sizes 3, 2, 1
    words = text_lower.split()
    windows = []
    for size in (3, 2, 1):
        for i in range(len(words) - size + 1):
            windows.append(" ".join(words[i: i + size]))

    for window in windows:
        match = process.extractOne(
            window,
            _ALL_ALIASES,
            scorer=fuzz.WRatio,
            score_cutoff=threshold,
        )
        if match:
            alias, score, _ = match
            canonical = _alias_to_canonical(alias)
            if canonical not in seen:
                seen.add(canonical)
                results.append({
                    "item": canonical,
                    "score": round(score, 1),
                    "matched_phrase": window,
                })
                if len(results) >= top_k:
                    break

    logger.debug("Detected menu items: %s", results)
    return results


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _correct_against_default(text: str, threshold: int) -> str:
    """Correct using the pre-built alias map."""
    words = text.lower().split()
    corrected_words = list(words)
    used: set[int] = set()

    for size in (3, 2, 1):
        for i in range(len(words) - size + 1):
            if any(j in used for j in range(i, i + size)):
                continue
            phrase = " ".join(words[i: i + size])
            match = process.extractOne(
                phrase,
                _ALL_ALIASES,
                scorer=fuzz.WRatio,
                score_cutoff=threshold,
            )
            if match:
                alias, score, _ = match
                canonical = _alias_to_canonical(alias)
                if canonical != phrase:
                    logger.debug("Corrected %r → %r (score %.1f)", phrase, canonical, score)
                # Replace the window in corrected_words
                canonical_words = canonical.split()
                corrected_words[i] = canonical
                for j in range(i + 1, i + size):
                    corrected_words[j] = ""
                for j in range(i, i + size):
                    used.add(j)

    return " ".join(w for w in corrected_words if w)


def _correct_against_custom(text: str, menu_items: list[str], threshold: int) -> str:
    """Correct against a custom list of item names."""
    words = text.lower().split()
    corrected_words = list(words)
    used: set[int] = set()

    for size in (3, 2, 1):
        for i in range(len(words) - size + 1):
            if any(j in used for j in range(i, i + size)):
                continue
            phrase = " ".join(words[i: i + size])
            match = process.extractOne(
                phrase,
                [m.lower() for m in menu_items],
                scorer=fuzz.WRatio,
                score_cutoff=threshold,
            )
            if match:
                matched_item, score, _ = match
                corrected_words[i] = matched_item
                for j in range(i + 1, i + size):
                    corrected_words[j] = ""
                for j in range(i, i + size):
                    used.add(j)

    return " ".join(w for w in corrected_words if w)


def _alias_to_canonical(alias: str) -> str:
    """Look up the canonical name for an alias."""
    for a, canonical in _ALIAS_MAP:
        if a == alias:
            return canonical
    return alias
