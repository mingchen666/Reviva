#!/usr/bin/env python3
"""Extract public Bilibili video metadata and optional comments.

Video transcripts and keyframes are intentionally not handled here. Bili Note
reads those from an authorized, already-parsed MindSpace media item via
``media_read``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


BASE = "https://api.bilibili.com"
TZ = timezone(timedelta(hours=8))
MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]


def configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")


configure_stdout()


def headers(bvid: str | None = None) -> dict[str, str]:
    referer = "https://www.bilibili.com/"
    if bvid:
        referer = f"https://www.bilibili.com/video/{bvid}/"
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
        ),
        "Referer": referer,
        "Accept": "application/json,text/plain,*/*",
    }


def request_json(url: str, bvid: str | None = None) -> dict:
    request = urllib.request.Request(url, headers=headers(bvid))
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def api_get(
    path: str,
    params: dict,
    bvid: str | None = None,
    signed: bool = False,
    mixin_key: str | None = None,
) -> dict:
    if signed:
        if not mixin_key:
            raise ValueError("signed=True requires mixin_key")
        params = sign_params(params, mixin_key)
    url = BASE + path + "?" + urllib.parse.urlencode(params)
    payload = request_json(url, bvid)
    if payload.get("code") != 0:
        raise RuntimeError(
            f"API error {payload.get('code')}: {payload.get('message')} url={url}"
        )
    return payload


def extract_bvid(source: str) -> str:
    match = re.search(r"(BV[0-9A-Za-z]+)", source)
    if not match:
        raise ValueError(f"Could not find BVID in: {source}")
    return match.group(1)


def fmt_ts(seconds: int | None) -> str:
    if not seconds:
        return ""
    return datetime.fromtimestamp(int(seconds), TZ).strftime("%Y-%m-%d %H:%M:%S")


def fmt_duration(seconds: int | None) -> str:
    if not seconds:
        return "0:00"
    hours, remainder = divmod(int(seconds), 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def write_source_md(view: dict, out_dir: Path) -> None:
    data = view["data"]
    lines = [
        f"# {data.get('title', '')}",
        "",
        f"- URL: https://www.bilibili.com/video/{data.get('bvid')}/",
        f"- BVID: {data.get('bvid')}",
        f"- AID: {data.get('aid')}",
        f"- UP: {(data.get('owner') or {}).get('name', '')}",
        f"- Published: {fmt_ts(data.get('pubdate'))} (UTC+8)",
        f"- Duration: {fmt_duration(data.get('duration'))}",
        f"- Parts: {data.get('videos')}",
        "",
        "## Description",
        "",
        data.get("desc") or "",
        "",
        "## Parts",
        "",
    ]
    for page in data.get("pages") or []:
        lines.append(
            f"{page.get('page')}. cid={page.get('cid')} "
            f"duration={fmt_duration(page.get('duration'))} - {page.get('part', '')}"
        )
    (out_dir / "source.md").write_text(
        "\n".join(lines).rstrip() + "\n", encoding="utf-8"
    )


def get_mixin_key(bvid: str | None) -> str:
    payload = request_json(BASE + "/x/web-interface/nav", bvid)
    wbi = ((payload.get("data") or {}).get("wbi_img") or {})
    img_key = Path(urllib.parse.urlparse(wbi.get("img_url", "")).path).stem
    sub_key = Path(urllib.parse.urlparse(wbi.get("sub_url", "")).path).stem
    key = img_key + sub_key
    if len(key) <= max(MIXIN_KEY_ENC_TAB):
        raise RuntimeError("Bilibili WBI key is unavailable")
    return "".join(key[index] for index in MIXIN_KEY_ENC_TAB)[:32]


def sign_params(params: dict, mixin_key: str) -> dict:
    signed = dict(params)
    signed["wts"] = int(time.time())
    cleaned = {
        key: "".join(char for char in str(value) if char not in "!'()*")
        for key, value in signed.items()
    }
    query = urllib.parse.urlencode(sorted(cleaned.items()))
    signed["w_rid"] = hashlib.md5((query + mixin_key).encode()).hexdigest()
    return signed


def reply_id(reply: dict) -> str:
    return str(reply.get("rpid_str") or reply.get("rpid") or "")


def reply_text(reply: dict) -> str:
    content = reply.get("content") or {}
    return (content.get("message") or "").replace("\r\n", "\n").replace("\r", "\n")


def member_name(reply: dict) -> str:
    return ((reply.get("member") or {}).get("uname") or "").strip()


def compact_reply(reply: dict) -> dict:
    content = reply.get("content") or {}
    pictures = []
    for picture in content.get("pictures") or []:
        url = (
            picture.get("img_src")
            or picture.get("m_img_src")
            or picture.get("src")
            or picture.get("url")
        )
        if url:
            pictures.append(url)
    links = []
    jump_urls = content.get("jump_url") or {}
    if isinstance(jump_urls, dict):
        for title, value in jump_urls.items():
            if not isinstance(value, dict):
                continue
            url = value.get("pc_url") or value.get("app_url_schema") or ""
            if url.startswith("//"):
                url = "https:" + url
            if url:
                links.append({"title": title, "url": url})
    return {
        "rpid": reply_id(reply),
        "root": str(reply.get("root_str") or reply.get("root") or ""),
        "parent": str(reply.get("parent_str") or reply.get("parent") or ""),
        "uname": member_name(reply),
        "mid": str(
            (reply.get("member") or {}).get("mid")
            or reply.get("mid_str")
            or reply.get("mid")
            or ""
        ),
        "time": fmt_ts(reply.get("ctime")),
        "ctime": int(reply.get("ctime") or 0),
        "like": int(reply.get("like") or 0),
        "message": reply_text(reply),
        "pictures": pictures,
        "links": links,
        "rcount": int(reply.get("rcount") or reply.get("count") or 0),
        "up_liked": bool((reply.get("up_action") or {}).get("like")),
        "up_replied": bool((reply.get("up_action") or {}).get("reply")),
        "parent_reply_member": reply.get("parent_reply_member") or None,
    }


def fetch_child_replies(
    oid: str,
    bvid: str | None,
    root_rpid: str,
    expected: int = 0,
    target_type: int = 1,
) -> tuple[list[dict], int | None]:
    children = []
    seen = set()
    page_number = 1
    total = None
    while True:
        payload = api_get(
            "/x/v2/reply/reply",
            {
                "type": target_type,
                "oid": oid,
                "root": root_rpid,
                "pn": page_number,
                "ps": 20,
            },
            bvid,
        )
        data = payload.get("data") or {}
        total = total if total is not None else ((data.get("page") or {}).get("count"))
        replies = data.get("replies") or []
        if not replies:
            break
        for reply in replies:
            rid = reply_id(reply)
            if rid and rid not in seen:
                seen.add(rid)
                children.append(reply)
        if total and len(children) >= int(total):
            break
        if expected and len(children) >= expected and (not total or expected >= int(total)):
            break
        page_number += 1
        time.sleep(0.2)
    return children, total


def quote_block(text: str) -> str:
    if not text:
        return "> "
    return "\n".join("> " + line for line in text.split("\n"))


def fetch_comments(
    oid: str,
    bvid: str | None,
    out_dir: Path,
    mode: int = 3,
    target_type: int = 1,
    source: str | None = None,
) -> dict:
    mixin_key = get_mixin_key(bvid)
    roots = []
    seen = set()
    next_value = 0
    all_count = None
    for _ in range(40):
        payload = api_get(
            "/x/v2/reply/wbi/main",
            {
                "type": target_type,
                "oid": oid,
                "mode": mode,
                "next": next_value,
                "ps": 20,
                "web_location": 1315875,
            },
            bvid,
            signed=True,
            mixin_key=mixin_key,
        )
        data = payload.get("data") or {}
        cursor = data.get("cursor") or {}
        all_count = cursor.get("all_count", all_count)
        candidates = [*(data.get("top_replies") or []), *(data.get("replies") or [])]
        top = data.get("top") or {}
        if isinstance(top, dict):
            for key in ("admin", "upper"):
                value = top.get(key)
                if isinstance(value, dict) and value.get("rpid"):
                    candidates.append(value)
        for reply in candidates:
            rid = reply_id(reply)
            if rid and rid not in seen:
                seen.add(rid)
                roots.append(reply)
        if cursor.get("is_end"):
            break
        new_next = cursor.get("next")
        if new_next is None or new_next == next_value:
            break
        next_value = new_next
        time.sleep(0.25)

    items = []
    for reply in roots:
        item = compact_reply(reply)
        raw_children = []
        if item["rcount"] > 0:
            try:
                raw_children, _ = fetch_child_replies(
                    oid, bvid, item["rpid"], item["rcount"], target_type
                )
            except Exception as exc:
                item["child_fetch_error"] = str(exc)
                raw_children = reply.get("replies") or []
        item["children"] = [compact_reply(child) for child in raw_children]
        items.append(item)

    root_ids = {item["rpid"] for item in items}
    for item in items:
        item["children"] = [
            child for child in item["children"] if child["rpid"] not in root_ids
        ]

    result = {
        "source": source
        or (f"https://www.bilibili.com/video/{bvid}/" if bvid else ""),
        "oid": oid,
        "target_type": target_type,
        "aid": oid if target_type == 1 else None,
        "bvid": bvid,
        "fetched_at": datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S"),
        "wbi_main_all_count": all_count,
        "top_level_count": len(items),
        "child_reply_count": sum(len(item["children"]) for item in items),
        "items": items,
    }
    result["total_fetched_comments"] = (
        result["top_level_count"] + result["child_reply_count"]
    )
    (out_dir / "comments_raw.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_comments_md(result, out_dir / "comments.md")
    return result


def write_comments_md(raw: dict, path: Path) -> None:
    lines = [
        "# Comments",
        "",
        f"- Source: {raw['source']}",
        f"- Fetched: {raw['fetched_at']} (UTC+8)",
        f"- WBI all_count: {raw.get('wbi_main_all_count')}",
        (
            f"- Fetched: top-level {raw['top_level_count']}, "
            f"child replies {raw['child_reply_count']}, "
            f"total {raw['total_fetched_comments']}"
        ),
        "",
    ]
    for index, item in enumerate(raw["items"], 1):
        lines.extend(
            [
                f"## Comment {index}: {item['uname']}",
                (
                    f"- rpid: {item['rpid']}; mid: {item['mid']}; "
                    f"time: {item['time']}; likes: {item['like']}; "
                    f"children: {len(item['children'])}"
                ),
                "",
                quote_block(item["message"]),
            ]
        )
        if item.get("links"):
            lines.extend(["", "Links:"])
            for link in item["links"]:
                lines.append(f"- {link['title']}: {link['url']}")
        if item.get("pictures"):
            lines.extend(["", "Pictures:"])
            for url in item["pictures"]:
                lines.append(f"- {url}")
        if item["children"]:
            lines.extend(["", "### Child replies", ""])
            for child_index, child in enumerate(item["children"], 1):
                parent = child.get("parent_reply_member") or {}
                parent_note = f"; parent: {parent.get('name')}" if parent.get("name") else ""
                lines.extend(
                    [
                        (
                            f"{child_index}. **{child['uname']}** "
                            f"(rpid: {child['rpid']}; time: {child['time']}; "
                            f"likes: {child['like']}{parent_note})"
                        ),
                        "",
                        quote_block(child["message"]),
                        "",
                    ]
                )
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="Bilibili video URL or BVID")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--comments", action="store_true", help="Fetch public comments")
    args = parser.parse_args()

    bvid = extract_bvid(args.source)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    view = api_get("/x/web-interface/view", {"bvid": bvid}, bvid)
    data = view["data"]
    (out_dir / "metadata.json").write_text(
        json.dumps(view, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_source_md(view, out_dir)

    comments = None
    if args.comments:
        comments = fetch_comments(
            str(data["aid"]),
            bvid,
            out_dir,
            source=f"https://www.bilibili.com/video/{bvid}/",
        )

    summary = {
        "kind": "video_metadata",
        "source": args.source,
        "bvid": bvid,
        "aid": data.get("aid"),
        "metadata": str(out_dir / "metadata.json"),
        "source_markdown": str(out_dir / "source.md"),
        "comments": str(out_dir / "comments_raw.json") if comments else None,
        "video_content": "Use an authorized parsed mediaId with media_read.",
    }
    (out_dir / "run_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
