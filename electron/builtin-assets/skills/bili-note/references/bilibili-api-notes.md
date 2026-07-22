# Bilibili API Notes

Use public endpoints with a browser-like `User-Agent` and `Referer`.

## Metadata

- `https://api.bilibili.com/x/web-interface/view?bvid=<BVID>`
- Key fields: `aid`, `bvid`, `cid`, `title`, `desc`, `owner.name`, `pubdate`, `duration`, `pages`.

For multi-part videos, each `pages[]` item has `page`, `cid`, `part`, and `duration`.

## Video Content Boundary

Do not retrieve subtitles, download audio, or run transcription from this
skill. Video transcript, timestamps, parsing status, and keyframes come from an
authorized MindSpace `mediaId` through `media_read`.

Use the metadata endpoint in this reference only to supplement public video
information or to resolve the AID needed by the optional comments route.

## Comments

Prefer the WBI endpoint:

- `https://api.bilibili.com/x/v2/reply/wbi/main`
- Params usually include `type=1`, `oid=<AID>`, `mode=3`, `next=<cursor>`, `ps=20`, `web_location=1315875`, plus signed `wts` and `w_rid`.
- Fetch WBI image keys from `https://api.bilibili.com/x/web-interface/nav`.
- Use the standard mixin key permutation:
  `[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]`.

For child replies:

- `https://api.bilibili.com/x/v2/reply/reply?type=1&oid=<AID>&root=<RPID>&pn=<N>&ps=20`

Pitfall: `/x/v2/reply?type=1&oid=...` can report a full count but return only a few pinned/hot roots. Use WBI main when the user wants all comments.

## Opus / Article Posts

For URLs like `https://www.bilibili.com/opus/<id>` or `/dynamic/<id>`, prefer the public page HTML over the polymer dynamic API:

- Parse `window.__INITIAL_STATE__` from the opus page.
- Main content lives under `detail.modules[]`, especially `MODULE_TYPE_TITLE`, `MODULE_TYPE_AUTHOR`, `MODULE_TYPE_CONTENT`, `MODULE_TYPE_STAT`, and `MODULE_TYPE_COPYRIGHT`.
- `MODULE_TYPE_CONTENT.module_content.paragraphs[]` observed paragraph types:
  - `para_type=1`: text nodes.
  - `para_type=2`: images under `pic.pics[]`.
  - `para_type=5`: lists under `list.children[]`.
  - `para_type=6`: link cards.
  - `para_type=7`: code blocks under `code.lang` and `code.content`.
  - `para_type=8`: headings.
- `https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?id=<opus_id>` may return anti-scraping errors such as `-352` even when the public page HTML contains the full article.

For opus comments, do not use the opus id as `oid`. Read:

- `detail.basic.comment_type` as the reply `type`.
- `detail.basic.comment_id_str` as the reply `oid`.

Example from a public opus page: `comment_type=12`, `comment_id_str=48091857`.

## Sparse Transcript Handling

Transcript availability is not the same as full video understanding. Compare
the parsed media duration with the amount of transcript actually inspected:

- Long videos with sparse transcript evidence may depend on PPT, boards, code editors, UI demos, product screens, or silent visual segments.
- Do not write "complete extraction" or a full learning note from sparse subtitles alone.
- Use representative keyframes/screenshots plus OCR or multimodal visual understanding before detailed synthesis.
- If the active model/toolchain cannot inspect images, tell the user that this advanced step requires a vision-capable model or manual review, and label the current note as limited to subtitles, metadata, and comments.

For video notes, surface this limitation directly in the final note's coverage
and limitations section. `metadata/note_budget.json` remains an Opus/article
archive aid and is not a replacement for `media_read` evidence.
