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


def quad_pyramid(apex="P", base=("A", "B", "C", "D")):
    """四棱锥：底面四边形 + 顶点到各底点。返回 spheres 与 edges。"""
    a, b, c, d = base
    edges = [
        _edge(a, b), _edge(b, c), _edge(c, d), _edge(d, a),
        _edge(apex, a), _edge(apex, b), _edge(apex, c), _edge(apex, d),
    ]
    return {"spheres": [apex, a, b, c, d], "edges": edges}


def tri_pyramid(apex="P", base=("A", "B", "C")):
    """三棱锥（四面体）。"""
    a, b, c = base
    edges = [
        _edge(a, b), _edge(b, c), _edge(c, a),
        _edge(apex, a), _edge(apex, b), _edge(apex, c),
    ]
    return {"spheres": [apex, a, b, c], "edges": edges}


def cuboid(bottom=("A", "B", "C", "D"), top=("A1", "B1", "C1", "D1")):
    """长方体 / 正方体：底面四边形、顶面四边形、四条竖棱。"""
    a, b, c, d = bottom
    a1, b1, c1, d1 = top
    edges = [
        _edge(a, b), _edge(b, c), _edge(c, d), _edge(d, a),       # 底面
        _edge(a1, b1), _edge(b1, c1), _edge(c1, d1), _edge(d1, a1),  # 顶面
        _edge(a, a1), _edge(b, b1), _edge(c, c1), _edge(d, d1),   # 竖棱
    ]
    return {"spheres": [a, b, c, d, a1, b1, c1, d1], "edges": edges}


def prism(bottom=("A", "B", "C"), top=("A1", "B1", "C1")):
    """棱柱：上下同形多边形 + 竖棱（顶点数任意，按顺序一一对应）。"""
    n = len(bottom)
    edges = []
    for i in range(n):
        edges.append(_edge(bottom[i], bottom[(i + 1) % n]))
        edges.append(_edge(top[i], top[(i + 1) % n]))
        edges.append(_edge(bottom[i], top[i]))
    return {"spheres": list(bottom) + list(top), "edges": edges}
