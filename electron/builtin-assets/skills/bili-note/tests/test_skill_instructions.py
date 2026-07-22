from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_skill_requires_learning_oriented_notes():
    text = (ROOT / "SKILL.md").read_text(encoding="utf-8")

    assert "学习型笔记" in text
    assert "学完你应该获得什么" in text
    assert "核心概念卡" in text
    assert "实践清单" in text
    assert "自测题" in text
    assert "不合格信号" in text


def test_skill_requires_authorized_media_read_for_video():
    text = (ROOT / "SKILL.md").read_text(encoding="utf-8")

    assert 'media_read(mediaId="<authorized mediaId>", mode="metadata")' in text
    assert 'mode="search", query="<主题>"' in text
    assert 'mode="transcript")' in text
    assert 'mode="frames")' in text
    assert "`nextCursor` 作为 `cursor`" in text
    assert "当前附件上下文必须提供 `mediaId`" in text
    assert "不要自行回退到下载音频或安装 ASR" in text


def test_skill_keeps_video_content_out_of_helper_scripts():
    text = (ROOT / "SKILL.md").read_text(encoding="utf-8")

    assert "不下载视频音频" in text
    assert "run_bili_note.py` 不再处理视频 URL" in text
