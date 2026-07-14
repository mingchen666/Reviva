# geometryData 格式参考

```json
{
  "problemText": "题目文字",
  "solids": [{
    "id": "polyhedron",
    "vertices": [{ "id": "A", "pos": [0, 0, 0], "label": "A" }],
    "edges": [{ "id": "AB", "v1": "A", "v2": "B", "dashed": false }],
    "faces": [{ "id": "ABCD", "vertices": ["A", "B", "C", "D"], "color": "#e8e8e8" }],
    "circles": [{ "id": "circle_O", "centerVertex": "O", "radiusVertex": "A", "color": "#339af0" }]
  }],
  "conditions": [
    { "id": "c1", "type": "parallel", "text": "AD∥BC", "targets": { "lineA": "DA", "lineB": "BC" }, "highlightColor": "#339af0" },
    { "id": "c2", "type": "equal-length", "text": "AB=CD=AD=1", "targets": { "segments": ["AB", "CD", "DA"] }, "value": 1, "highlightColor": "#51cf66" },
    { "id": "c3", "type": "length", "text": "BC=sqrt(2)/2", "targets": { "segment": "BC" }, "value": 0.70710678, "valueText": "sqrt(2)/2", "highlightColor": "#51cf66" },
    { "id": "c4", "type": "midpoint", "text": "G 为 BC 中点", "targets": { "vertex": "G" }, "highlightColor": "#cc5de8" },
    { "id": "c5", "type": "perpendicular", "text": "平面 ADFE⊥平面 ADCB", "targets": { "faceA": "ADFE", "faceB": "ABCD" }, "highlightColor": "#ff6b6b" }
  ],
  "solutionSteps": [
    { "title": "步骤名", "rules": ["所用定理或推论"], "theorem": "证明、计算或构造过程", "highlights": ["A", "BC"], "annotations": [] }
  ]
}
```

## 已知条件显示规则

conditions 初始不自动高亮；用户点击已知条件右侧眼睛按钮后，才显示对应的线段、面或标注。不要依赖 `defaultVisible` 让题面条件在页面打开时自动高亮。

## targets 字段说明

| condition type | targets 必填 |
|---|---|
| midpoint | `{ vertex: "G" }` |
| perpendicular (面面垂直) | `{ faceA, faceB }` |
| perpendicular (线线垂直) | `{ segment, line2 }` |
| perpendicular (线面垂直) | `{ segment, face }` |
| parallel | `{ lineA, lineB }`??????????? ABCD / ??? ABCD ??????????? `face: "ABCD"` ???????? face ID?????????? |
| length | `{ segment }`, `value`；若题面给出分数或无理数，使用 `valueText` / `displayValue` / `label` / `exactValue` 提供图上精确显示文本，如 `"sqrt(2)/2"` |
| equal-length | `{ segments: [...] }` |
| angle / right-angle | `{ vertex, sides: [...] }` |

## solutionSteps 规则

- `rules`：必填非空数组，列出当前步骤使用的定理、性质、推论或公式。
- `theorem`：写本步骤的证明、计算或构造过程，不能只写定理名。
- `highlights`：可混用顶点、边、面 ID；步骤文字中出现已有 face ID 时，模板也会尝试自动高亮对应面。
