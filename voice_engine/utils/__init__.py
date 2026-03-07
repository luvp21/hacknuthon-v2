"""Utility modules for language detection and fuzzy menu matching."""
from .language_detector import detect_language
from .fuzzy_menu_match import correct_with_default_menu, correct_order_text

__all__ = ["detect_language", "correct_with_default_menu", "correct_order_text"]
