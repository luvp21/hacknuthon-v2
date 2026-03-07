"""
language_detector.py - Multilingual text language detection.

Uses Unicode range analysis and token-level vocabulary dictionaries
to identify English, Hindi, Hinglish, and regional Indian languages.
No external API required — fully offline.
"""

import re
import unicodedata
from typing import Optional


# ---------------------------------------------------------------------------
# Unicode ranges for Indian scripts
# ---------------------------------------------------------------------------

SCRIPT_RANGES = {
    "hi": (0x0900, 0x097F),   # Devanagari (Hindi, Marathi, Konkani)
    "ta": (0x0B80, 0x0BFF),   # Tamil
    "te": (0x0C00, 0x0C7F),   # Telugu
    "kn": (0x0C80, 0x0CFF),   # Kannada
    "ml": (0x0D00, 0x0D7F),   # Malayalam
    "bn": (0x0980, 0x09FF),   # Bengali
    "gu": (0x0A80, 0x0AFF),   # Gujarati
    "pa": (0x0A00, 0x0A7F),   # Gurmukhi (Punjabi)
    "or": (0x0B00, 0x0B7F),   # Odia
    "si": (0x0D80, 0x0DFF),   # Sinhala
}

# Languages that share Devanagari — disambiguate by vocabulary
DEVANAGARI_LANGS = {"hi", "mr"}   # Marathi also uses Devanagari

# ---------------------------------------------------------------------------
# Vocabulary token sets
# ---------------------------------------------------------------------------

# Common Hindi function words / particles
HINDI_TOKENS = {
    "ek", "do", "teen", "aur", "ya", "nahi", "haan", "mujhe", "tumhe",
    "kya", "hai", "ho", "ke", "ki", "ka", "se", "mein", "par", "ko",
    "bhai", "yaar", "please", "bhej", "do", "lao", "chahiye", "dena",
    "paneer", "roti", "dal", "sabzi", "chai", "pani", "rice", "curry",
    "aloo", "gobi", "matar", "naan", "biryani", "lassi",
}

# Common Marathi-specific words (not usual in Hindi)
MARATHI_TOKENS = {
    "aahe", "nahi", "mala", "tula", "kay", "ata", "bola", "sanga",
    "pudhe", "zhala", "gela", "ala", "dya", "ghya",
}

# Gujarati common words (romanized and common Devanagari transliterations)
GUJARATI_TOKENS = {
    "che", "chhe", "nathi", "hato", "hati", "tamne", "mane",
    "kem", "shu", "avjo", "aavjo", "bapore", "pan", "tame",
    "tamari", "tamari", "tmari", "tmary", "pase", "paase", "kaya", 
    "vikalp", "vikalp", "che", "pijama", "pajama", "khabar",
}

# English short-function words (to detect Hinglish blend)
ENGLISH_TOKENS = {
    "a", "an", "the", "is", "are", "was", "were", "i", "you", "he", "she",
    "it", "we", "they", "and", "or", "but", "not", "yes", "no", "okay",
    "ok", "please", "thanks", "want", "need", "order", "pizza", "burger",
    "coke", "coffee", "tea", "bread", "rice", "sauce",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_language(text: str) -> str:
    """Detect the primary language of *text*.

    Returns one of:
        "en"    – English
        "hi"    – Hindi (pure)
        "hi-en" – Hinglish (Hindi + English mix)
        "mr"    – Marathi
        "gu"    – Gujarati
        "ta"    – Tamil
        "te"    – Telugu
        "kn"    – Kannada
        "bn"    – Bengali
        "pa"    – Punjabi
        "unknown" – could not determine

    Args:
        text: The input string (may contain Unicode or romanised characters).

    Returns:
        Language code string.
    """
    if not text or not text.strip():
        return "unknown"

    # 1. Script-level detection (non-Latin scripts)
    script_lang = _detect_by_script(text)
    if script_lang:
        # If it's Hindi script, it might still be Hinglish (mixed with English tokens)
        if script_lang == "hi" and detect_hinglish(text):
            return "hi-en"
        return script_lang

    # 2. Romanised text — vocabulary analysis
    return _detect_romanised(text)


def detect_hinglish(text: str) -> bool:
    """Return True if the text appears to be Hinglish (Hindi-English mix).

    Args:
        text: Romanised or mixed-script sentence.

    Returns:
        True if the text contains significant Hindi AND English tokens.
    """
    tokens = _tokenise_and_romanise(text)
    hindi_count = sum(1 for t in tokens if t in HINDI_TOKENS)
    english_count = sum(1 for t in tokens if t in ENGLISH_TOKENS)
    total = len(tokens) or 1

    # At least 15% Hindi-origin tokens AND visible English content
    hindi_ratio = hindi_count / total
    english_ratio = english_count / total

    return hindi_ratio >= 0.15 and english_ratio >= 0.10


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _detect_by_script(text: str) -> Optional[str]:
    """Detect language by Unicode script ranges."""
    script_counts: dict[str, int] = {}

    for char in text:
        cp = ord(char)
        for lang, (lo, hi) in SCRIPT_RANGES.items():
            if lo <= cp <= hi:
                script_counts[lang] = script_counts.get(lang, 0) + 1
                break

    if not script_counts:
        return None

    dominant = max(script_counts, key=script_counts.__getitem__)

    # Devanagari — decide hi vs mr vs gu by vocabulary
    # (Whisper often transcribes Gujarati/Marathi in Devanagari script)
    if dominant == "hi":
        tokens = _tokenise_and_romanise(text)
        scores = {
            "hi": sum(1 for t in tokens if t in HINDI_TOKENS),
            "mr": sum(1 for t in tokens if t in MARATHI_TOKENS),
            "gu": sum(1 for t in tokens if t in GUJARATI_TOKENS),
        }
        best = max(scores, key=scores.__getitem__)
        if scores[best] > 0:
            return best
        return "hi"

    return dominant


def _tokenise_and_romanise(text: str) -> list[str]:
    """Tokenise and apply very basic Devanagari->Roman mapping for vocabulary match."""
    # Simple mapping for common phonetic matches in ordering context
    consonants = {
        "क": "k", "ख": "kh", "ग": "g", "घ": "gh",
        "च": "ch", "छ": "chh", "ज": "j", "झ": "jh",
        "त": "t", "थ": "th", "द": "d", "ध": "dh",
        "न": "n", "प": "p", "फ": "f", "ब": "b", "भ": "bh", "म": "m",
        "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    }
    vowels = {
        "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "r", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
        "अ": "a", "आ": "a", "इ": "i", "ई": "i", "उ": "u", "ऊ": "u", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
    }
    
    # 1. Tokenise first
    raw_tokens = _tokenise(text)
    roman_tokens = []
    
    for token in raw_tokens:
        found_devanagari = any(0x0900 <= ord(c) <= 0x097F for c in token)
        if found_devanagari:
            res = ""
            for i, char in enumerate(token):
                if char in consonants:
                    res += consonants[char]
                    # If next char is not a vowel sign and not end of word, add inherent 'a'
                    if i + 1 < len(token):
                        next_char = token[i+1]
                        if next_char not in vowels and next_char != "्": # ् is virama
                            res += "a"
                elif char in vowels:
                    res += vowels[char]
            roman_tokens.append(res)
        else:
            roman_tokens.append(token)
            
    return roman_tokens


def _detect_romanised(text: str) -> str:
    """Detect romanised language via token vocabulary overlaps."""
    tokens = _tokenise(text)
    if not tokens:
        return "unknown"

    hindi_score = sum(1 for t in tokens if t in HINDI_TOKENS)
    english_score = sum(1 for t in tokens if t in ENGLISH_TOKENS)
    marathi_score = sum(1 for t in tokens if t in MARATHI_TOKENS)
    gujarati_score = sum(1 for t in tokens if t in GUJARATI_TOKENS)

    scores = {
        "hi": hindi_score,
        "en": english_score,
        "mr": marathi_score,
        "gu": gujarati_score,
    }
    total = len(tokens)

    best_lang = max(scores, key=scores.__getitem__)
    best_score = scores[best_lang]

    # Too low — unknown
    if best_score / total < 0.10:
        # Default to English if mostly ASCII
        ascii_ratio = sum(1 for c in text if ord(c) < 128) / len(text)
        return "en" if ascii_ratio > 0.85 else "unknown"

    # Hinglish: both Hindi and English have reasonable presence
    if detect_hinglish(text):
        return "hi-en"

    return best_lang


def _tokenise(text: str) -> list[str]:
    """Lowercase-split text into word tokens, preserving Unicode letters/marks."""
    # Preserve letters (L) and marks (M - like vowel signs), replace others with space
    # Python re.sub doesn't support \p{L} without 'regex' lib, so we use a safe character-based approach
    # We strip common punctuation and symbols but keep letters/marks
    text = text.lower()
    # Replace non-word, non-space, non-Indic-range marks with spaces
    # This is a safe fallback to keep matras (093F, 094D, etc.) intact
    text = re.sub(r"[\!\?\. , ; : （ ） ( ) \[ \] { } \" ' \- _ \+ = / \\ | < > @ # \$ % \^ & \* ~ `]", " ", text)
    return [t for t in text.split() if t]
