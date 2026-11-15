"""Text-to-speech engines shared by both pipelines (hand-drawn build_audio.py and the lesson/ board styles).

  engine   needs                          voice variable (default)
  glm      GLM_API_KEY  (智谱 GLM-TTS)     GLM_VOICE (chuichui)
  doubao   DOUBAO_API_KEY (豆包 seed-tts)  DOUBAO_VOICE (zh_male_youyoujunzi_uranus_bigtts), DOUBAO_RESOURCE_ID (seed-tts-2.0)
  minimax  MINIMAX_API_KEY (MiniMax T2A)   MINIMAX_VOICE (Chinese_casual_instructor_nv1), MINIMAX_MODEL (speech-2.8-hd),
                                           MINIMAX_API_HOST (https://api.minimax.cn)
  edge     `pip install edge-tts`, free    EDGE_VOICE (zh-CN-XiaoxiaoNeural)
  say      macOS built-in, offline         SAY_VOICE (Tingting)

Choice: explicit (CLI / episode.json "tts" / lesson meta.tts) > TTS_ENGINE > auto = the first engine with a key
(glm, doubao, minimax), then edge, then say. Speed: TTS_SPEED (1.0 = normal; GLM_SPEED for glm, default 1.05).
Keys come from the environment or the workspace .env (the nearest .env above the project: <WS>/.env).
No key yet: `bash scripts/init_env.sh <WS> <engine>` writes an .env with empty slots for the user to fill in.

Every clip is written as a 48 kHz mono wav without metadata. doubao and minimax also return word timestamps
(seconds, relative to the clip) -> <clip>.words.json, used by the lesson pipeline to sync actions to words.

CLI (used by lesson/scripts/tts.mjs):
  PY tts.py batch <jobs.json>   jobs: {start, cache, texts:[...], engine?, speed?, ffmpeg?, dry?}
                                -> stdout JSON {engine, voice, speed, clips:[{file, duration, words, text}], pron:[...]}
  PY tts.py info [--tts e]      which engine/voice would be used, which keys are set (values never printed),
                                and the user's saved default template VIDEO_TEMPLATE
  PY tts.py check [--tts e]     run in <WS> at the very start (step 0): exit 0 = this engine can speak now;
                                exit 1 = key missing / fallback not chosen yet (message says what to ask the user)
"""
import hashlib, json, os, re, shutil, struct, subprocess, sys, tempfile, time, wave
from concurrent.futures import ThreadPoolExecutor

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pron  # noqa: E402

SR = 48000
ENGINES = ("glm", "doubao", "minimax", "edge", "say")
KEYS = {"glm": "GLM_API_KEY", "doubao": "DOUBAO_API_KEY", "minimax": "MINIMAX_API_KEY"}
GLM_VOICES = ("tongtong", "chuichui", "xiaochen", "jam", "kazi", "douji", "luodo")
ENV_PREFIX = ("GLM_", "DOUBAO_", "MINIMAX_", "TTS_", "EDGE_", "SAY_", "VIDEO_")


class Fatal(Exception):
    """Retrying will not help (bad key, no balance, bad request)."""


def find_up(start, name):
    d = os.path.abspath(start)
    while True:
        if os.path.exists(os.path.join(d, name)):
            return d
        if os.path.dirname(d) == d:
            return None
        d = os.path.dirname(d)


def load_env(start):
    """Priority: environment variables > the workspace .env (nearest .env above `start`). No user-level file:
    keys live with the workspace the user is working in."""
    env = {}
    d = find_up(start, ".env")
    if d:
        for line in open(os.path.join(d, ".env"), encoding="utf-8"):
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.strip().split("=", 1)
                env[k.strip()] = v.strip().strip("\"'")
    env.update({k: v for k, v in os.environ.items() if k.startswith(ENV_PREFIX) and v})
    return env


def find_ffmpeg(start):
    for base in (start, os.path.join(HERE, "..", "lesson")):
        d = find_up(base, "node_modules/ffmpeg-static/ffmpeg")
        if d:
            return os.path.join(d, "node_modules/ffmpeg-static/ffmpeg")
    if shutil.which("ffmpeg"):
        return shutil.which("ffmpeg")
    raise SystemExit("ffmpeg not found: `npm install ffmpeg-static` in the workspace root, or install ffmpeg.")


def has_edge():
    try:
        import edge_tts  # noqa: F401
        return True
    except ImportError:
        return False


def pick(env, want=None):
    want = (want or env.get("TTS_ENGINE") or "auto").lower()
    if want != "auto":
        if want not in ENGINES:
            raise SystemExit(f"TTS engine {want!r}: use auto, {', '.join(ENGINES)}")
        return want
    for e in ("glm", "doubao", "minimax"):
        if env.get(KEYS[e]):
            return e
    if has_edge():
        return "edge"
    if shutil.which("say"):
        return "say"
    return "glm"  # nothing available: need_key() explains what to set up


def default_speed(engine, env):
    if env.get("TTS_SPEED"):
        return float(env["TTS_SPEED"])
    if engine == "glm":
        return float(env.get("GLM_SPEED", "1.05"))
    return 1.0


FALLBACK_NAME = {"say": "macOS 自带的 say", "edge": "免费的 edge-tts"}
FALLBACK_ASK = (
    "No TTS key is configured, so the only engine left is {e} ({name}). Do NOT use it silently: ASK THE USER "
    "(AskUserQuestion) — 1) 填写 key（推荐，GLM / 豆包 / MiniMax，音质好）: run `bash <skill>/scripts/init_env.sh <WS> <engine>`, "
    "tell them which line to fill, end the turn and wait; 2) 用{name}: warn that it sounds noticeably worse "
    "(机械感明显 / 断句和读音不如付费引擎), then record the choice (episode.json \"tts\": \"{e}\" or lesson.json "
    "meta.tts = \"{e}\", or TTS_ENGINE={e} in <WS>/.env) and run again.")


def letter_sep(engine):
    return "、" if engine == "say" else " "  # see pron.to_tts


def _strip_wav(raw):
    """Keep only fmt + data chunks (drops AIGC / LIST metadata watermark chunks)."""
    i, fmt, data = 12, None, None
    while i < len(raw) - 8:
        cid = raw[i:i + 4]
        sz = struct.unpack("<I", raw[i + 4:i + 8])[0]
        if cid == b"fmt ":
            fmt = raw[i + 8:i + 8 + sz]
        elif cid == b"data":
            data = raw[i + 8:i + 8 + sz]
        i += 8 + sz + (sz & 1)
    assert fmt and data, "bad wav"
    body = b"fmt " + struct.pack("<I", len(fmt)) + fmt + b"data" + struct.pack("<I", len(data)) + data
    return b"RIFF" + struct.pack("<I", 4 + len(body)) + b"WAVE" + body


def wav_duration(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


# ---------------------------------------------------------------- response parsing (pure, unit-tested)
def parse_doubao(body):
    """HTTP chunked body: one JSON object per line, base64 audio in `data`, word timings in `sentence.words`."""
    import base64
    chunks, words = [], []
    for line in body.splitlines():
        if not line.strip():
            continue
        j = json.loads(line)
        code = j.get("code")
        if code and code != 20000000:
            raise RuntimeError(f"doubao error {code}: {j.get('message')}")
        if j.get("data"):
            chunks.append(base64.b64decode(j["data"]))
        for w in ((j.get("sentence") or {}).get("words") or []):
            words.append({"w": w["word"], "s": w["startTime"], "e": w["endTime"]})
    if not chunks:
        raise RuntimeError("doubao returned no audio")
    return b"".join(chunks), words


MINIMAX_FATAL = {1004: "鉴权失败（key 错误，或 key 与 MINIMAX_API_HOST 不是同一个站点）", 1042: "非法字符超过 10%",
                 2013: "参数错误（检查 MINIMAX_VOICE / MINIMAX_MODEL）"}


def parse_minimax(j):
    """Non-streaming /v1/t2a_v2 response -> (mp3 bytes, subtitle_file url or None)."""
    base = j.get("base_resp") or {}
    code = base.get("status_code", 0)
    if code:
        msg = f"minimax error {code}: {base.get('status_msg')} {MINIMAX_FATAL.get(code, '')}".strip()
        raise (Fatal if code in MINIMAX_FATAL else RuntimeError)(msg)
    data = j.get("data") or {}
    if not data.get("audio"):
        raise RuntimeError("minimax returned no audio")
    return bytes.fromhex(data["audio"]), data.get("subtitle_file")


def minimax_words(sub):
    """Subtitle file (list of segments, each maybe with timestamped_words; times in ms) -> [{w, s, e}] in seconds."""
    if isinstance(sub, dict):
        sub = next((v for v in sub.values() if isinstance(v, list)), [sub])
    words = []
    for seg in sub or []:
        ws = seg.get("timestamped_words") or [{"word": seg.get("text", ""), "time_begin": seg.get("time_begin", 0),
                                                "time_end": seg.get("time_end", 0)}]
        words += [{"w": w.get("word", ""), "s": w.get("time_begin", 0) / 1000, "e": w.get("time_end", 0) / 1000}
                  for w in ws]
    return words


# ---------------------------------------------------------------- engines
class TTS:
    def __init__(self, start, engine=None, speed=None, ff=None):
        self.env = load_env(start)
        self.engine = pick(self.env, engine)
        # True when nobody chose the engine: a fallback (edge / say) reached this way must be confirmed by the user
        self.auto = (engine or self.env.get("TTS_ENGINE") or "auto").lower() == "auto"
        self.speed = float(speed) if speed is not None else default_speed(self.engine, self.env)
        self.ff = ff or find_ffmpeg(start)
        e = self.env
        self.voice_name = {
            "glm": e.get("GLM_VOICE", "chuichui"),
            "doubao": e.get("DOUBAO_VOICE", "zh_male_youyoujunzi_uranus_bigtts"),
            "minimax": e.get("MINIMAX_VOICE", "Chinese_casual_instructor_nv1"),
            "edge": e.get("EDGE_VOICE", "zh-CN-XiaoxiaoNeural"),
            "say": e.get("SAY_VOICE", "Tingting"),
        }[self.engine]
        # also keys the clip cache, so each engine gets its own clips (GLM keeps the plain voice name: old caches stay valid)
        self.voice = {"glm": self.voice_name,
                      "doubao": f"doubao:{e.get('DOUBAO_RESOURCE_ID', 'seed-tts-2.0')}:{self.voice_name}",
                      "minimax": f"minimax:{e.get('MINIMAX_MODEL', 'speech-2.8-hd')}:{self.voice_name}",
                      }.get(self.engine, f"{self.engine}:{self.voice_name}")
        self.sep = letter_sep(self.engine)

    def clip_name(self, text):
        return hashlib.md5(f"{self.voice}|{self.speed}|{text}".encode()).hexdigest()[:10] + ".wav"

    def need_key(self):
        e = self.engine
        if e == "edge" and not has_edge():
            raise SystemExit("TTS engine edge: edge-tts is not installed. Ask the user, then `PY -m pip install --user edge-tts`")
        if e == "say" and not shutil.which("say"):
            raise SystemExit("TTS engine say needs macOS (`say` not found). Use glm, doubao, minimax or edge.")
        if e in KEYS and not self.env.get(KEYS[e]):
            raise SystemExit(f"{KEYS[e]} is missing (TTS engine {e}). Run `bash <skill>/scripts/init_env.sh <WS> {e}`, "
                             f"then ask the user to fill in {KEYS[e]} in <WS>/.env and come back (reference/tts-setup.md). "
                             "Never invent or print a key.")
        if e in ("edge", "say") and self.auto:
            raise SystemExit(FALLBACK_ASK.format(e=e, name=FALLBACK_NAME[e]))
        if e in ("edge", "say"):
            print(f"note: TTS engine = {e} ({self.voice_name}), fallback quality (chosen by the user).", file=sys.stderr)
        if e == "glm" and self.voice_name not in GLM_VOICES:
            print(f"note: GLM_VOICE={self.voice_name!r} is not a system voice {GLM_VOICES}; OK only if it is a cloned voice id.",
                  file=sys.stderr)

    def _to_wav(self, data, ext, out):
        """Any audio bytes -> 48 kHz mono wav without metadata (atomic: a crash never leaves a half clip in the cache)."""
        fd, src = tempfile.mkstemp(suffix="." + ext, dir=os.path.dirname(out))
        os.write(fd, data)
        os.close(fd)
        tmp = out + ".part.wav"
        try:
            subprocess.run([self.ff, "-y", "-loglevel", "error", "-i", src, "-map_metadata", "-1",
                            "-fflags", "+bitexact", "-ar", str(SR), "-ac", "1", tmp], check=True)
            os.replace(tmp, out)
        finally:
            os.remove(src)

    def _glm(self, text):
        r = requests.post("https://open.bigmodel.cn/api/paas/v4/audio/speech",
                          headers={"Authorization": f"Bearer {self.env['GLM_API_KEY']}"},
                          json={"model": "glm-tts", "input": text, "voice": self.voice_name, "response_format": "wav",
                                "speed": self.speed, "watermark_enabled": False}, timeout=120)
        if r.status_code == 200 and r.content[:4] == b"RIFF":
            return _strip_wav(r.content), "wav", None
        raise (Fatal if r.status_code in (400, 401, 403) else RuntimeError)(f"GLM-TTS {r.status_code}: {r.text[:300]}")

    def _doubao(self, text):
        rate = max(-50, min(100, round((self.speed - 1) * 100)))
        r = requests.post("https://openspeech.bytedance.com/api/v3/tts/unidirectional",
                          headers={"X-Api-Key": self.env["DOUBAO_API_KEY"],
                                   "X-Api-Resource-Id": self.env.get("DOUBAO_RESOURCE_ID", "seed-tts-2.0"),
                                   "Content-Type": "application/json"},
                          json={"user": {"uid": "edu-math-video"},
                                "req_params": {"text": text, "speaker": self.voice_name,
                                               "audio_params": {"format": "mp3", "sample_rate": 24000, "speech_rate": rate,
                                                                "enable_subtitle": True}}}, timeout=120)
        if r.status_code != 200:
            raise (Fatal if r.status_code in (400, 401, 403) else RuntimeError)(
                f"doubao HTTP {r.status_code} (logid {r.headers.get('x-tt-logid')}): {r.text[:300]}")
        audio, words = parse_doubao(r.content.decode("utf-8"))
        return audio, "mp3", words

    def _minimax(self, text):
        host = self.env.get("MINIMAX_API_HOST", "https://api.minimax.cn").rstrip("/")
        # ASCII parentheses are MiniMax markup (inline pinyin / IPA, (laughs) ...): f(x) must not become a phoneme
        text = text.replace("(", "（").replace(")", "）")
        r = requests.post(f"{host}/v1/t2a_v2",
                          headers={"Authorization": f"Bearer {self.env['MINIMAX_API_KEY']}", "Content-Type": "application/json"},
                          json={"model": self.env.get("MINIMAX_MODEL", "speech-2.8-hd"), "text": text, "stream": False,
                                "voice_setting": {"voice_id": self.voice_name, "speed": max(0.5, min(2.0, self.speed)),
                                                  "vol": 1, "pitch": 0},
                                "audio_setting": {"sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1},
                                "subtitle_enable": True, "subtitle_type": "word", "output_format": "hex"},
                          timeout=120)
        if r.status_code != 200:
            raise (Fatal if r.status_code in (400, 401, 403) else RuntimeError)(f"minimax HTTP {r.status_code}: {r.text[:300]}")
        audio, sub_url = parse_minimax(r.json())
        words = []
        if sub_url:  # timings are a nice-to-have: anchors fall back to text position without them
            try:
                words = minimax_words(requests.get(sub_url, timeout=60).json())
            except Exception as ex:
                print("minimax subtitle download failed:", ex, file=sys.stderr)
        return audio, "mp3", words

    def _edge(self, text):
        import asyncio
        import edge_tts
        fd, tmp = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)
        try:
            asyncio.run(edge_tts.Communicate(text, self.voice_name, rate=f"{round((self.speed - 1) * 100):+d}%").save(tmp))
            return open(tmp, "rb").read(), "mp3", None
        finally:
            os.remove(tmp)

    def _say(self, text):
        fd, tmp = tempfile.mkstemp(suffix=".aiff")
        os.close(fd)
        try:
            # `say` rate is words per minute; ~190 matches GLM's pace for Chinese at speed 1.0
            subprocess.run(["say", "-v", self.voice_name, "-r", str(round(190 * self.speed)), "-o", tmp, text], check=True)
            return open(tmp, "rb").read(), "aiff", None
        finally:
            os.remove(tmp)

    def synth(self, text, out):
        """Write `out` (48 kHz mono wav) unless cached; returns the word timings list (empty if the engine has none)."""
        side = out[:-4] + ".words.json"
        if os.path.exists(out):
            if not os.path.exists(side):
                return []
            with open(side, encoding="utf-8") as f:
                return json.load(f)
        call = getattr(self, "_" + self.engine)
        err = None
        for attempt in range(4):
            try:
                audio, ext, words = call(text)
                if words:
                    with open(side, "w", encoding="utf-8") as f:
                        json.dump(words, f, ensure_ascii=False)
                self._to_wav(audio, ext, out)
                return words or []
            except Fatal as ex:
                err = ex
                break
            except Exception as ex:  # network hiccups, rate limits
                err = ex
                print(f"TTS retry {attempt} ({self.engine}): {ex}", file=sys.stderr)
                time.sleep(0.8 * 2 ** attempt)
        raise RuntimeError(f"TTS failed ({self.engine}): {err}  text: {text}")


# ---------------------------------------------------------------- CLI
def batch(jobs):
    t = TTS(jobs["start"], jobs.get("engine"), jobs.get("speed"), jobs.get("ffmpeg"))
    cache = jobs["cache"]
    os.makedirs(cache, exist_ok=True)
    clips, issues = [], []
    for i, src in enumerate(jobs["texts"]):
        text, _ = pron.to_tts(src, t.sep)
        issues += [{"line": i, "char": c, "kind": k, "guess": g, "readings": rs, "context": ctx}
                   for c, k, g, rs, ctx in pron.lint(src)]
        clips.append({"text": text, "file": os.path.join(cache, t.clip_name(text))})
    if jobs.get("dry"):  # layout check before paying: estimated durations, no audio
        for c in clips:
            c.update(file=None, words=[], duration=round(0.2 * len(re.sub(r"[，。、；：！？,.!? ]", "", c["text"])) + 0.25, 3))
    else:
        t.need_key()
        done = [0]

        def run(c):
            c["words"] = t.synth(c["text"], c["file"])
            c["duration"] = round(wav_duration(c["file"]), 3)
            done[0] += 1
            print(f"\rTTS {done[0]}/{len(clips)} ({t.engine})", end="", file=sys.stderr)
        with ThreadPoolExecutor(4) as ex:
            list(ex.map(run, clips))
        print(file=sys.stderr)
    return {"engine": t.engine, "voice": t.voice, "speed": t.speed, "clips": clips, "pron": issues}


def info(start, want=None):
    env = load_env(start)
    t = TTS(start, want, ff="ffmpeg")
    keys = "  ".join(f"{k}={'set' if env.get(k) else '-'}" for k in KEYS.values())
    src = "--tts" if want else ("TTS_ENGINE default" if env.get("TTS_ENGINE", "auto").lower() != "auto" else "auto")
    tpl = env.get("VIDEO_TEMPLATE") or "- (not saved)"
    return (f"engine {t.engine}  voice {t.voice_name}  speed {t.speed}  [{src}]   keys: {keys}   "
            f"(edge-tts {'yes' if has_edge() else 'no'})   VIDEO_TEMPLATE={tpl}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "batch":
        res = batch(json.load(open(sys.argv[2], encoding="utf-8")))
        json.dump(res, sys.stdout, ensure_ascii=False)
    elif len(sys.argv) >= 2 and sys.argv[1] in ("info", "check"):
        want = sys.argv[sys.argv.index("--tts") + 1] if "--tts" in sys.argv else None
        print(info(os.getcwd(), want))
        if sys.argv[1] == "check":
            t = TTS(os.getcwd(), want, ff="ffmpeg")
            t.need_key()  # SystemExit(1) with the message when not ready
            print(f"READY: {t.engine} ({t.voice_name}) can be used. Continue with step 1.")
    else:
        print(__doc__)
        sys.exit(2)
