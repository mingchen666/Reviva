import importlib.util
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "run_bili_note.py"


def load_module():
    spec = importlib.util.spec_from_file_location("run_bili_note", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_run_bili_note_help_exposes_opus_pipeline_options():
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--help"],
        check=True,
        text=True,
        capture_output=True,
    )

    assert "--work-dir" in result.stdout
    assert "--archive-dir" in result.stdout
    assert "--comments" in result.stdout
    assert "--download-images" in result.stdout
    assert "--dry-run" in result.stdout
    assert "--subtitle-mode" not in result.stdout


def test_run_bili_note_accepts_opus_and_rejects_video():
    module = load_module()

    assert module.opus_id("https://www.bilibili.com/opus/1194341967364882439") == "1194341967364882439"
    assert module.opus_id("1194341967364882439") == "1194341967364882439"

    try:
        module.opus_id("https://www.bilibili.com/video/BV1abcDEF123/")
    except ValueError as exc:
        assert "media_read" in str(exc)
    else:
        raise AssertionError("video input should require MindSpace media_read")
