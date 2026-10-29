"""
RouterOS string decoding compatibility (latin-1 / cp1252).

Problem
-------
RouterOS returns strings in the connection's legacy 8-bit charset (Latin-1 /
cp1252), but `routeros_api` decodes every string with `bytes.decode()` —
i.e. **strict UTF-8**:

    class StringField(Field):
        def get_python_value(self, bytes):
            return bytes.decode()

Any comment with an accent ("Adrián", "año", "Redirección") therefore raises
`UnicodeDecodeError` and the whole response fails (firewall rules, NAT, logs,
address lists, remote CLI). It only shows up on routers that already have
human-written comments in that charset, which is why a clean lab router works
and a production one does not.

Fix
---
Patch `StringField.get_python_value` once at import time with a tolerant
decoder. Order of attempts:

    UTF-8 → cp1252 → latin-1 → UTF-8 with replacement

UTF-8 first keeps correct data written by newer RouterOS (or by NetShield
itself); cp1252/latin-1 cover legacy bytes; the last step never raises, so a
garbage field can never take down an endpoint again.

The patch is process-local, idempotent, and guarded: if a future version of
routeros_api renames or removes the attribute, importing this module is a
no-op instead of breaking startup.
"""

from __future__ import annotations

from typing import Any

try:  # pragma: no cover - trivial import guard
    from routeros_api.api_structure import StringField
except Exception:  # pragma: no cover - library not installed / changed
    StringField = None  # type: ignore[assignment]

# Tried in order. latin-1 maps every byte, so it never fails and acts as the
# guaranteed fallback before the lossy decode.
_ENCODINGS = ("utf-8", "cp1252", "latin-1")

_PATCH_FLAG = "_netshield_tolerant_decode"


def decode_routeros_string(raw: object) -> Any:
    """Decode a RouterOS string payload without ever raising."""
    if isinstance(raw, str):
        return raw
    if not isinstance(raw, (bytes, bytearray)):
        return raw

    data = bytes(raw)
    for encoding in _ENCODINGS:
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")  # last resort


def patch_routeros_decoding() -> bool:
    """Install the tolerant decoder on routeros_api. Returns True if patched."""
    if StringField is None:
        return False
    if getattr(StringField, _PATCH_FLAG, False):
        return True

    def get_python_value(self, raw):  # noqa: ANN001 - matches library signature
        return decode_routeros_string(raw)

    StringField.get_python_value = get_python_value
    setattr(StringField, _PATCH_FLAG, True)
    return True


# Apply on import: any module using routeros_api just imports this one.
patch_routeros_decoding()
