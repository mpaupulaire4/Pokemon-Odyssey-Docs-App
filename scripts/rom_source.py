"""Optional: pull supplementary data straight out of a legally-owned GBA ROM.

The source spreadsheets (see build_data.py) don't carry item descriptions —
those only ever existed in the game itself. This module reads them directly
from the ROM's item data table, the same way community tools like the
Universal Pokemon Randomizer ZX do for Gen 3 games.

Read-only: never writes to or redistributes the ROM. Pass --rom <path> to
build_data.py to enable it; omitted by default since no ROM file is (or
should be) checked into this repo.

Verified against:
  - Pokémon Odyssey v4.1.1 (FireRed-based)
  - Pokémon Unbound          (FireRed-based)
Both keep the item data table at its original FireRed (U) 1.0 location
(found via a fixed pointer slot in the ROM header region that the game's own
item-display code relies on, so hacks built on this engine can't move it
without also patching that code). Emerald Rogue (Emerald-based) restructures
its item table differently and isn't supported here yet.
"""

import struct
import unicodedata
from pathlib import Path

# Gen 3 games store text in a custom single-byte encoding, not ASCII. This is
# the standard table used by FireRed/LeafGreen/Emerald (and, by extension,
# hacks built on them) — documented across the ROM-hacking community (e.g.
# pret's pokefirered/pokeemerald charmaps).
_CHAR_TABLE = {
    0x00: " ", 0x01: "À", 0x02: "Á", 0x03: "Â", 0x04: "Ç", 0x05: "È", 0x06: "É",
    0x07: "Ê", 0x08: "Ë", 0x09: "Ì", 0x0B: "Î", 0x0C: "Ï", 0x0D: "Ò", 0x0E: "Ó",
    0x0F: "Ô", 0x10: "Æ", 0x11: "Ù", 0x12: "Ú", 0x13: "Û", 0x14: "Ñ", 0x15: "ß",
    0x16: "à", 0x17: "á", 0x19: "ç", 0x1A: "è", 0x1B: "é", 0x1C: "ê", 0x1D: "ë",
    0x1E: "ì", 0x20: "î", 0x21: "ï", 0x22: "ò", 0x23: "ó", 0x24: "ô", 0x25: "æ",
    0x26: "ù", 0x27: "ú", 0x28: "û", 0x29: "ñ", 0x2A: "º", 0x2B: "ª", 0x2C: "·",
    0x2D: "&", 0x2E: "+", 0x35: "=", 0x36: ";", 0x51: "¿", 0x52: "¡", 0x5B: "%",
    0x5C: "(", 0x5D: ")", 0x5A: "Í", 0x68: "â", 0x6F: "í",
    0xA1: "0", 0xA2: "1", 0xA3: "2", 0xA4: "3", 0xA5: "4", 0xA6: "5", 0xA7: "6",
    0xA8: "7", 0xA9: "8", 0xAA: "9", 0xAB: "!", 0xAC: "?", 0xAD: ".", 0xAE: "-",
    0xAF: "·", 0xB0: "…", 0xB1: "“", 0xB2: "”", 0xB3: "‘",
    0xB4: "’", 0xB5: "♂", 0xB6: "♀", 0xB7: "$", 0xB8: ",",
    0xBA: "/",
    **{0xBB + i: c for i, c in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ")},
    **{0xD5 + i: c for i, c in enumerate("abcdefghijklmnopqrstuvwxyz")},
    0xF0: ":", 0xF1: "Ä", 0xF2: "Ö", 0xF3: "Ü", 0xF4: "ä", 0xF5: "ö", 0xF6: "ü",
    0xFA: "\n", 0xFB: "\n", 0xFC: "\n",  # line-break / paragraph / clear control codes
    0xFE: "\n",
}

ROM_BASE_ADDR = 0x08000000

# FireRed (U) 1.0 "efrlg" fixed pointer slot for the item data table. Hacks
# built on this engine reference it from the same in-game code, so the slot
# itself doesn't move even when the table it points to is relocated/expanded.
ITEM_DATA_POINTER_OFFSET = 0x1C8
ITEM_ENTRY_SIZE = 44      # bytes per item struct
ITEM_NAME_MAXLEN = 14     # name occupies the first 14 bytes of the struct
ITEM_DESC_OFFSET = 0x14   # offset within struct to the description pointer

# Vanilla FireRed's item table has 374 entries (index 0 is an unused "?????"
# placeholder). Verified empirically: both Odyssey and Unbound's tables read
# as valid name/description pairs through index 374, then turn to decode
# garbage immediately after — neither hack extended the table past the
# original boundary. A hack that adds items *beyond* slot 374 would need
# this bumped (or made auto-detecting) to pick them up.
ITEM_COUNT = 374


def _decode(data: bytes, offset: int, max_len: int = 200) -> str:
    out = []
    for i in range(max_len):
        b = data[offset + i]
        if b == 0xFF:  # string terminator
            break
        out.append(_CHAR_TABLE.get(b, ""))
    return "".join(out)


def _clean_description(raw: str) -> str:
    lines = [ln.strip() for ln in raw.split("\n")]
    return " ".join(ln for ln in lines if ln)


def canon(name) -> str:
    import re
    s = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]+", "", s.upper())


def extract_item_descriptions(rom_path) -> dict:
    """Return {canon(item_name): description} read from the ROM's item table."""
    data = Path(rom_path).read_bytes()
    table_ptr = struct.unpack_from("<I", data, ITEM_DATA_POINTER_OFFSET)[0]
    table_off = table_ptr - ROM_BASE_ADDR

    out = {}
    for i in range(ITEM_COUNT + 1):
        entry_off = table_off + i * ITEM_ENTRY_SIZE
        if entry_off + ITEM_ENTRY_SIZE > len(data):
            break
        name = _decode(data, entry_off, ITEM_NAME_MAXLEN).strip()
        if not name:
            continue
        desc_ptr = struct.unpack_from("<I", data, entry_off + ITEM_DESC_OFFSET)[0]
        if ROM_BASE_ADDR <= desc_ptr < ROM_BASE_ADDR + len(data):
            desc = _clean_description(_decode(data, desc_ptr - ROM_BASE_ADDR))
            if desc:
                out[canon(name)] = desc
    return out
