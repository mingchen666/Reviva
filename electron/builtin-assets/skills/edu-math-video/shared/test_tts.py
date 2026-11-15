"""Offline tests for tts.py (no API calls):  PY -m unittest discover -s shared -p 'test_tts.py'"""
import base64, json, os, shutil, subprocess, sys, tempfile, unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tts  # noqa: E402

FF = shutil.which("ffmpeg")


def tiny_mp3():
    fd, p = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)
    subprocess.run([FF, "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=f=440:d=0.5", "-ar", "32000", p], check=True)
    data = open(p, "rb").read()
    os.remove(p)
    return data


class Resp:
    def __init__(self, status=200, js=None, content=b"", headers=None):
        self.status_code, self._js, self.content, self.headers = status, js, content, headers or {}
        self.text = json.dumps(js) if js is not None else content.decode("utf-8", "replace")

    def json(self):
        return self._js


class ParseTest(unittest.TestCase):
    def test_doubao_chunks_and_words(self):
        body = "\n".join([
            json.dumps({"code": 0, "data": base64.b64encode(b"ab").decode()}),
            json.dumps({"code": 0, "sentence": {"words": [{"word": "求", "startTime": 0.1, "endTime": 0.3}]}}),
            json.dumps({"code": 0, "data": base64.b64encode(b"cd").decode()}),
            json.dumps({"code": 20000000, "message": "ok"}), ""])
        audio, words = tts.parse_doubao(body)
        self.assertEqual(audio, b"abcd")
        self.assertEqual(words, [{"w": "求", "s": 0.1, "e": 0.3}])

    def test_doubao_error(self):
        with self.assertRaises(RuntimeError):
            tts.parse_doubao(json.dumps({"code": 40000001, "message": "bad speaker"}))

    def test_minimax_ok_and_errors(self):
        audio, url = tts.parse_minimax({"data": {"audio": "4142", "status": 2, "subtitle_file": "https://x/s.json"},
                                        "base_resp": {"status_code": 0, "status_msg": "success"}})
        self.assertEqual((audio, url), (b"AB", "https://x/s.json"))
        with self.assertRaises(tts.Fatal):
            tts.parse_minimax({"base_resp": {"status_code": 1004, "status_msg": "auth"}})
        with self.assertRaises(RuntimeError):  # rate limit: retried
            tts.parse_minimax({"base_resp": {"status_code": 1002, "status_msg": "rate"}})

    def test_minimax_words(self):
        sub = [{"text": "求AB", "time_begin": 0, "time_end": 900,
                "timestamped_words": [{"word": "求", "time_begin": 100, "time_end": 300},
                                      {"word": "AB", "time_begin": 300, "time_end": 900}]},
               {"text": "的长。", "time_begin": 900, "time_end": 1500, "timestamped_words": None}]
        self.assertEqual(tts.minimax_words(sub), [{"w": "求", "s": 0.1, "e": 0.3}, {"w": "AB", "s": 0.3, "e": 0.9},
                                                  {"w": "的长。", "s": 0.9, "e": 1.5}])
        self.assertEqual(tts.minimax_words({"subtitles": sub[:1]})[0]["w"], "求")


@unittest.skipUnless(FF, "ffmpeg needed")
class MinimaxSynthTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        env = {"MINIMAX_API_KEY": "k", "MINIMAX_VOICE": "female-tianmei"}
        with mock.patch.dict(os.environ, env):
            self.t = tts.TTS(self.dir, "minimax", ff=FF)

    def tearDown(self):
        shutil.rmtree(self.dir)

    def test_request_and_clip(self):
        sub = [{"text": "x", "time_begin": 0, "time_end": 500,
                "timestamped_words": [{"word": "x", "time_begin": 0, "time_end": 500}]}]
        ok = {"data": {"audio": tiny_mp3().hex(), "status": 2, "subtitle_file": "https://x/s.json"},
              "base_resp": {"status_code": 0}}
        out = os.path.join(self.dir, "a.wav")
        with mock.patch.object(tts.requests, "post", return_value=Resp(js=ok)) as post, \
                mock.patch.object(tts.requests, "get", return_value=Resp(js=sub)):
            words = self.t.synth("函数f(x)的值", out)
        url, kw = post.call_args[0][0], post.call_args[1]
        self.assertEqual(url, "https://api.minimax.cn/v1/t2a_v2")
        self.assertEqual(kw["headers"]["Authorization"], "Bearer k")
        body = kw["json"]
        self.assertEqual(body["text"], "函数f（x）的值")  # ASCII () would be read as inline phonemes
        self.assertEqual((body["model"], body["stream"], body["voice_setting"]["voice_id"]), ("speech-2.8-hd", False, "female-tianmei"))
        self.assertTrue(body["subtitle_enable"])
        self.assertEqual(words, [{"w": "x", "s": 0.0, "e": 0.5}])
        self.assertAlmostEqual(tts.wav_duration(out), 0.5, delta=0.1)
        self.assertTrue(os.path.exists(out[:-4] + ".words.json"))
        with mock.patch.object(tts.requests, "post") as post:  # cached: no second call
            self.assertEqual(self.t.synth("函数f(x)的值", out), words)
            post.assert_not_called()

    def test_fatal_not_retried(self):
        bad = Resp(js={"base_resp": {"status_code": 1004, "status_msg": "auth failed"}})
        with mock.patch.object(tts.requests, "post", return_value=bad) as post:
            with self.assertRaisesRegex(RuntimeError, "1004"):
                self.t.synth("你好", os.path.join(self.dir, "b.wav"))
        self.assertEqual(post.call_count, 1)


class PickTest(unittest.TestCase):
    def test_auto_order_and_explicit(self):
        self.assertEqual(tts.pick({"MINIMAX_API_KEY": "1", "DOUBAO_API_KEY": "1"}), "doubao")
        self.assertEqual(tts.pick({"MINIMAX_API_KEY": "1"}), "minimax")
        self.assertEqual(tts.pick({"TTS_ENGINE": "minimax", "GLM_API_KEY": "1"}), "minimax")
        self.assertEqual(tts.pick({"TTS_ENGINE": "glm"}, "doubao"), "doubao")
        with self.assertRaises(SystemExit):
            tts.pick({}, "azure")

    def test_fallback_needs_explicit_choice(self):
        d = tempfile.mkdtemp()
        try:
            with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(tts, "has_edge", return_value=False), \
                    mock.patch.object(tts.shutil, "which", return_value="/usr/bin/say"):
                auto = tts.TTS(d, ff="ffmpeg")
                self.assertEqual((auto.engine, auto.auto), ("say", True))
                with self.assertRaisesRegex(SystemExit, "ASK THE USER"):
                    auto.need_key()
                tts.TTS(d, "say", ff="ffmpeg").need_key()  # chosen explicitly: no question
        finally:
            shutil.rmtree(d)

    def test_speed(self):
        self.assertEqual(tts.default_speed("glm", {}), 1.05)  # keeps old GLM cache keys valid
        self.assertEqual(tts.default_speed("minimax", {}), 1.0)
        self.assertEqual(tts.default_speed("glm", {"TTS_SPEED": "0.9", "GLM_SPEED": "1.2"}), 0.9)


if __name__ == "__main__":
    unittest.main()
