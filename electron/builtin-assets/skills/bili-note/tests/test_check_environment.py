import importlib.util
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "check_environment.py"


def load_module():
    spec = importlib.util.spec_from_file_location("check_environment", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def test_check_environment_help_exposes_lightweight_options():
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--help"],
        check=True,
        text=True,
        capture_output=True,
    )

    assert "--json" in result.stdout
    assert "--strict" in result.stdout
    assert "--api-url" in result.stdout
    assert "--timeout" in result.stdout
    assert "--cdp-url" not in result.stdout


def test_evaluate_environment_reports_system_media_and_opus_routes():
    module = load_module()

    report = module.evaluate_environment(
        script_dir=ROOT / "scripts",
        opener=lambda request, timeout: FakeResponse({"code": 0}),
    )

    assert report["core_ok"] is True
    assert report["capabilities"]["parsed_video_media_read"]["ok"] is True
    assert report["capabilities"]["opus_article_comments"]["ok"] is True
    assert report["asr_managed_by_skill"] is False


def test_evaluate_environment_reports_missing_helpers_without_asr_advice(tmp_path):
    module = load_module()

    def failing_opener(request, timeout):
        raise TimeoutError("offline")

    report = module.evaluate_environment(
        script_dir=tmp_path,
        opener=failing_opener,
    )

    assert report["core_ok"] is False
    assert report["capabilities"]["parsed_video_media_read"]["ok"] is True
    assert report["capabilities"]["opus_article_comments"]["ok"] is False
    assert any("Bilibili public APIs" in item for item in report["recommendations"])
    assert all("ASR" not in item for item in report["recommendations"])
