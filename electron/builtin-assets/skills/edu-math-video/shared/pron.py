"""Pronunciation control for GLM-TTS (the API has no SSML / phoneme input, and it reads inline pinyin aloud).

Readings are pinned by swapping a character for a common, single-reading homophone with the same tone
(汞 gǒng -> 拱) in the text that is sent to TTS only; subtitles keep the original characters.

A swap costs prosody: the TTS front-end segments words to decide where to phrase, and 直搅三搅形 / 蛋气、养气 are
not words, so it inserts extra breaks and slows down (measured: 4 pauses vs 2 on the same sentence). So a
lexicon entry is only swapped where the TTS would plausibly misread it (see needs_swap); inline markup,
rare characters and the "always" list are always swapped.

  * inline markup, in `zh` or `tts`:   汞[gǒng]   重[chóng]复   长[zhang3]
  * global lexicon in pron.json:       "words": {"氩": "yà", "分子": "fēn _"}  (applied everywhere unless marked;
                                       '_' keeps that character), "ok": ["空气"] = reviewed, TTS default is right
                                       "always": "汞氦…" = characters swapped even when context reads them right
  * lint():  flags rare characters and polyphones that nothing pins down, with the reading TTS would likely guess
  * letter runs: GLM-TTS reads adjacent Latin letters as one syllable ("CO" -> kǒu, "ACBE" drops the E), so to_tts()
    always spaces them out ("C O", "A C B E"): checked with ASR (read one by one) and by measuring silences in the
    audio (no extra pause); unspaced "PAB" is heard as 派
"""
import json, os, re
from pypinyin import pinyin, Style
from pypinyin.contrib.tone_convert import to_tone3

HERE = os.path.dirname(os.path.abspath(__file__))
_CFG = json.load(open(os.path.join(HERE, "pron.json"), encoding="utf-8"))
WORDS = _CFG.get("words", {})
HOMO = {}
WATCH = set(_CFG.get("watch", ""))  # everyday polyphones that TTS does get wrong
OK = _CFG.get("ok", [])  # words whose default reading was checked by hand: not reported, not rewritten
ALWAYS = set(_CFG.get("always", ""))  # heard misread by GLM-TTS even in a clear context: always swap
MARK = re.compile(r"(\S)\[([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüv:]+[1-5]?)\]")
HAN = re.compile(r"[一-鿿]")
LETTER_RUN = re.compile(r"[A-Za-z]{2,}")  # point names like AB, ACBE: must be spelled letter by letter


def strip(s):
    """Remove pronunciation markup, for subtitles."""
    return MARK.sub(r"\1", s)


def t3(py):
    """'gǒng' / 'gong3' / 'lü4' -> 'gong3' (neutral tone -> 5)."""
    py = py.lower().replace("u:", "ü").replace("v", "ü")
    out = to_tone3(py, neutral_tone_with_five=True) if not py[-1].isdigit() else py
    out = out.replace("ü", "v")  # pypinyin spells ü as v in tone3 style; use one spelling everywhere
    return out if out[-1].isdigit() else out + "5"


HOMO.update({t3(k): v for k, v in _CFG.get("homophones", {}).items()})


def readings(ch):
    return [t3(p) for p in pinyin(ch, style=Style.TONE3, heteronym=True, neutral_tone_with_five=True)[0]]


def common(ch):
    """GB2312 level-1 = the 3755 most common hanzi."""
    try:
        b = ch.encode("gb2312")
        return len(b) == 2 and 0xB0 <= b[0] <= 0xD7
    except UnicodeEncodeError:
        return False


_AUTO = {}


def homophone(py):
    key = t3(py)
    if key in HOMO:
        return HOMO[key]
    if key not in _AUTO:  # first common character whose usual reading is exactly this syllable + tone
        best = None
        for hi in range(0xB0, 0xD8):
            for lo in range(0xA1, 0xFF):
                try:
                    ch = bytes([hi, lo]).decode("gb2312")
                except UnicodeDecodeError:
                    continue
                if readings(ch)[0] == key:  # usual reading (pypinyin also lists archaic ones)
                    best = ch
                    break
            if best:
                break
        if not best:
            raise KeyError(f"no homophone for {key}; add one to pron.json 'homophones'")
        _AUTO[key] = best
    return _AUTO[key]


def pin(ch, py):
    """Character to send to TTS so that it is read as `py`."""
    # always swap: a character having one dictionary reading does not mean the TTS front-end reads it right
    # (it misread 汞 氦 氖 锰 钾 … when they were passed through unchanged)
    return homophone(t3(py))


def _same(a, b):
    """Readings equal, treating a neutral tone as matching any tone of the same syllable (的 de5 ~ de2)."""
    return a == b or (a[:-1] == b[:-1] and "5" in (a[-1], b[-1]))


def ctx_reading(s, j):
    """Reading of s[j] guessed from its word context (pypinyin phrase dictionary), skipping \0 sentinels.
    A TTS front-end resolves polyphones with the same kind of dictionary, so where this is right, it is too."""
    ok = lambda c: c == "\0" or HAN.match(c)  # noqa: E731
    lo, hi = j, j + 1
    while lo > 0 and ok(s[lo - 1]):
        lo -= 1
    while hi < len(s) and ok(s[hi]):
        hi += 1
    keep = [k for k in range(lo, hi) if s[k] != "\0"]
    pys = pinyin("".join(s[k] for k in keep), style=Style.TONE3, neutral_tone_with_five=True)
    return t3(pys[keep.index(j)][0])


def needs_swap(s, j, py):
    """Swap s[j] only if the TTS might get it wrong: rare, on the always-list, or context says otherwise."""
    ch = s[j]
    return ch in ALWAYS or not common(ch) or not _same(ctx_reading(s, j), t3(py))


def to_tts(text, sep=" "):
    """Apply markup + lexicon. Returns (tts_text, notes[(orig, reading, sent)]).
    Inline markup is always applied; lexicon entries only where needs_swap() (a word the TTS already reads
    right is sent unchanged, which keeps its phrasing natural).
    sep: what goes between spelled-out letters. " " for GLM-TTS; macOS `say` (Tingting) swallows spaced letters
    and only reads them one by one with "、" (ASR-checked)."""
    notes = []

    def mark(m):
        ch, py = m.group(1), m.group(2)
        s = pin(ch, py)
        notes.append((ch, t3(py), s))
        return "\0" + s  # sentinel so the lexicon skips it
    s = MARK.sub(mark, text)
    for w in sorted(WORDS, key=len, reverse=True):
        pys = WORDS[w].split()
        assert len(pys) == len(w), f"pron.json: '{w}' needs one syllable per character"
        i = 0
        while (i := s.find(w, i)) >= 0:
            if i > 0 and s[i - 1] == "\0":
                i += 1
                continue
            # '_' = leave this character alone; otherwise swap only where the TTS could misread it
            rep = "".join(pin(c, p) if p != "_" and needs_swap(s, i + k, p) else c
                          for k, (c, p) in enumerate(zip(w, pys)))
            if rep != w:
                notes.append((w, " ".join(p if p == "_" else t3(p) for p in pys), rep))
            s = s[:i] + "".join("\0" + c for c in rep) + s[i + len(w):]
            i += 2 * len(rep)
    s = s.replace("\0", "")
    for m in LETTER_RUN.findall(s):
        notes.append((m, "逐个字母", sep.join(m)))
    return LETTER_RUN.sub(lambda m: sep.join(m.group(0)), s), notes


def lint(text):
    """Characters in `text` (markup allowed) whose reading nothing pins down: rare ones and polyphones."""
    s = MARK.sub(lambda m: "\0" * len(m.group(0)), text)  # marked spans are fine
    for w in sorted([*WORDS, *OK], key=len, reverse=True):  # longest first: 折射率 before 折射
        s = s.replace(w, "\0" * len(w))
    ctx = [None] * len(s)  # contextual guess, one per character (pinyin() lumps non-han runs together)
    for m in re.finditer(r"[一-鿿]+", s):
        for k, p in enumerate(pinyin(m.group(0), style=Style.TONE3, neutral_tone_with_five=True)):
            ctx[m.start() + k] = p
    issues = []
    for i, ch in enumerate(s):
        if not HAN.match(ch) or ch in "一不":  # tone sandhi, which TTS applies itself
            continue
        rs, g = readings(ch), t3(ctx[i][0])
        # pypinyin also lists archaic readings (气 qǐ, 属 zhǔ), so "has several readings" alone is noise; flag a
        # polyphone only when context moves it off its usual reading, or it is a genuinely everyday polyphone
        shifted = g != rs[0] and not (g[:-1] == rs[0][:-1] and "5" in (g[-1], rs[0][-1]))
        rare, poly = not common(ch), len(set(rs)) > 1 and (shifted or ch in WATCH)
        if rare or poly:
            issues.append((ch, "生僻" if rare else "多音", t3(ctx[i][0]), "/".join(dict.fromkeys(rs)), s[max(0, i - 4):i + 5].replace("\0", "·")))
    return issues
