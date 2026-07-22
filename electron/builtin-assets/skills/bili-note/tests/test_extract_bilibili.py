import importlib.util
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "extract_bilibili.py"


def load_module():
    spec = importlib.util.spec_from_file_location("extract_bilibili", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_help_exposes_metadata_and_comment_options_only():
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--help"],
        check=True,
        text=True,
        capture_output=True,
    )

    assert "--out" in result.stdout
    assert "--comments" in result.stdout
    assert "--transcribe" not in result.stdout
    assert "--download-audio" not in result.stdout
    assert "--download-subtitles" not in result.stdout


def test_extract_bvid_accepts_url_or_id():
    module = load_module()

    assert module.extract_bvid("BV1abcDEF123") == "BV1abcDEF123"
    assert (
        module.extract_bvid("https://www.bilibili.com/video/BV1abcDEF123/?p=2")
        == "BV1abcDEF123"
    )


def test_write_source_md_records_metadata_and_parts(tmp_path):
    module = load_module()
    view = {
        "data": {
            "title": "测试视频",
            "bvid": "BV1abcDEF123",
            "aid": 123,
            "owner": {"name": "UP"},
            "pubdate": 1767225600,
            "duration": 62,
            "videos": 1,
            "desc": "简介",
            "pages": [{"page": 1, "cid": 456, "duration": 62, "part": "正片"}],
        }
    }

    module.write_source_md(view, tmp_path)

    text = (tmp_path / "source.md").read_text(encoding="utf-8")
    assert "# 测试视频" in text
    assert "BV1abcDEF123" in text
    assert "cid=456" in text
    assert "简介" in text
