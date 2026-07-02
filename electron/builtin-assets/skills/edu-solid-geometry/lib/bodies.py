#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bodies.py — 几何体"拓扑"库（哪些顶点、哪些棱）。

与 geometry_kernel.py 配合：kernel 负责精确坐标，bodies 负责标准棱连接，
两者合成 3D 渲染所需的 model（spheres + edges）。常见几何体在此内置；
罕见几何体可在具体题目里手写 edges。
"""


def _edge(a, b, **kw):
    e = {"a": a, "b": b}
    e.update(kw)
    return e


def _face(name, pts, **kw):
    f = {"name": name, "pts": list(pts)}
    f.update(kw)
    return f


def quad_pyramid(apex="P", base=("A", "B", "C", "D")):
    """四棱锥：底面四边形 + 顶点到各底点。返回 spheres、edges、faces。"""
    a, b, c, d = base
    edges = [
        _edge(a, b), _edge(b, c), _edge(c, d), _edge(d, a, dashed=True, hidden=True),
        _edge(apex, a), _edge(apex, b), _edge(apex, c), _edge(apex, d),
    ]
    faces = [
        _face(f"Face_{a}{b}{c}{d}", [a, b, c, d], color="baseFace", opacity=0.11),
        _face(f"Face_{apex}{a}{b}", [apex, a, b], color="sideFace", opacity=0.09),
        _face(f"Face_{apex}{b}{c}", [apex, b, c], color="sideFace", opacity=0.09),
        _face(f"Face_{apex}{c}{d}", [apex, c, d], color="sideFace", opacity=0.09),
        _face(f"Face_{apex}{d}{a}", [apex, d, a], color="sideFace", opacity=0.09),
    ]
    return {"spheres": [apex, a, b, c, d], "edges": edges, "faces": faces}


def tri_pyramid(apex="P", base=("A", "B", "C")):
    """三棱锥（四面体）。返回 spheres、edges、faces。"""
    a, b, c = base
    edges = [
        _edge(a, b), _edge(b, c), _edge(c, a, dashed=True, hidden=True),
        _edge(apex, a), _edge(apex, b), _edge(apex, c),
    ]
    faces = [
        _face(f"Face_{a}{b}{c}", [a, b, c], color="baseFace", opacity=0.12),
        _face(f"Face_{apex}{a}{b}", [apex, a, b], color="sideFace", opacity=0.1),
        _face(f"Face_{apex}{b}{c}", [apex, b, c], color="sideFace", opacity=0.1),
        _face(f"Face_{apex}{c}{a}", [apex, c, a], color="sideFace", opacity=0.1),
    ]
    return {"spheres": [apex, a, b, c], "edges": edges, "faces": faces}


def cuboid(bottom=("A", "B", "C", "D"), top=("A1", "B1", "C1", "D1")):
    """长方体 / 正方体：底面四边形、顶面四边形、四条竖棱。"""
    a, b, c, d = bottom
    a1, b1, c1, d1 = top
    edges = [
        _edge(a, b), _edge(b, c), _edge(c, d, dashed=True, hidden=True), _edge(d, a, dashed=True, hidden=True),       # 底面
        _edge(a1, b1), _edge(b1, c1), _edge(c1, d1), _edge(d1, a1),  # 顶面
        _edge(a, a1), _edge(b, b1), _edge(c, c1), _edge(d, d1, dashed=True, hidden=True),   # 竖棱
    ]
    faces = [
        _face(f"Face_{a}{b}{c}{d}", [a, b, c, d], color="baseFace", opacity=0.09),
        _face(f"Face_{a1}{b1}{c1}{d1}", [a1, b1, c1, d1], color="topFace", opacity=0.08),
        _face(f"Face_{a}{b}{b1}{a1}", [a, b, b1, a1], color="sideFace", opacity=0.08),
        _face(f"Face_{b}{c}{c1}{b1}", [b, c, c1, b1], color="sideFace", opacity=0.08),
        _face(f"Face_{c}{d}{d1}{c1}", [c, d, d1, c1], color="sideFace", opacity=0.08),
        _face(f"Face_{d}{a}{a1}{d1}", [d, a, a1, d1], color="sideFace", opacity=0.08),
    ]
    return {"spheres": [a, b, c, d, a1, b1, c1, d1], "edges": edges, "faces": faces}


def prism(bottom=("A", "B", "C"), top=("A1", "B1", "C1")):
    """棱柱：上下同形多边形 + 竖棱（顶点数任意，按顺序一一对应）。"""
    n = len(bottom)
    edges = []
    for i in range(n):
        edge_kw = {"dashed": True, "hidden": True} if i >= n // 2 else {}
        edges.append(_edge(bottom[i], bottom[(i + 1) % n], **edge_kw))
        edges.append(_edge(top[i], top[(i + 1) % n]))
        edges.append(_edge(bottom[i], top[i], **({"dashed": True, "hidden": True} if i == n - 1 else {})))
    faces = [
        _face("Face_bottom", bottom, color="baseFace", opacity=0.1),
        _face("Face_top", top, color="topFace", opacity=0.08),
    ]
    for i in range(n):
        faces.append(_face(f"Face_side_{i + 1}", [bottom[i], bottom[(i + 1) % n], top[(i + 1) % n], top[i]], color="sideFace", opacity=0.08))
    return {"spheres": list(bottom) + list(top), "edges": edges, "faces": faces}
