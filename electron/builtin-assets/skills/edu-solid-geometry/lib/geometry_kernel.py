#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
geometry_kernel.py — 立体几何确定性计算核心（基于 sympy 精确符号运算）。

设计目标（对应方案 A）：坐标、向量、最终答案全部由本模块精确算出，
根式自动化简，杜绝心算误差。同一套坐标既喂给解题文案，也喂给 3D 渲染，
保证"图、解、答"严格一致。

依赖: sympy（pip install sympy）。

坐标约定（数学坐标，z 轴向上）：
  - 题面/公式里展示的就是这套数学坐标。
  - 3D 渲染坐标采用 three.js 约定（y 轴向上）：three = (x, z, y) * scale。
"""

import sympy as sp

sqrt = sp.sqrt


# ===================== 基础工具 =====================

def V(*comps):
    """构造列向量（sympy.Matrix）。"""
    if len(comps) == 1 and isinstance(comps[0], (list, tuple)):
        comps = comps[0]
    return sp.Matrix([sp.sympify(c) for c in comps])


def midpoint(a, b):
    return (a + b) / 2


def normal_from_points(p, q, r):
    """由平面上三点求法向量（叉积），返回未化简向量。"""
    return (q - p).cross(r - p)


def simplify_vec(v):
    """把向量按公因子约简到最简整系数方向（仅用于'简化取 n=...'的展示）。"""
    v = sp.Matrix([sp.simplify(c) for c in v])
    nonzero = [c for c in v if c != 0]
    if not nonzero:
        return v
    g = nonzero[0]
    for c in nonzero[1:]:
        g = sp.gcd(g, c)
    if g != 0:
        cand = sp.simplify(v / g)
        # 若约简后仍是整数向量则采用
        if all(c.is_rational for c in cand):
            return cand
    return v


def line_plane_angle_sin(line_dir, normal):
    """线面角正弦：sinθ = |v·n| / (|v||n|)，精确化简。"""
    v = line_dir
    n = normal
    s = sp.Abs(v.dot(n)) / (v.norm() * n.norm())
    return sp.simplify(s)


def line_line_angle_cos(d1, d2):
    """异面直线夹角余弦：cosθ = |d1·d2| / (|d1||d2|)。"""
    return sp.simplify(sp.Abs(d1.dot(d2)) / (d1.norm() * d2.norm()))


def point_plane_distance(point, plane_point, normal):
    """点到平面距离：|(P - P0)·n| / |n|。"""
    return sp.simplify(sp.Abs((point - plane_point).dot(normal)) / normal.norm())


def dihedral_cos(A, B, C, D):
    """二面角 C-AB-D 的余弦：在两个半平面内各取一条垂直于棱 AB 的向量再求夹角。

    AB 为棱，C 在一个面内，D 在另一个面内。返回带符号的精确余弦
    （正=锐二面角，负=钝二面角）。
    """
    u = B - A

    def perp(P):
        w = P - A
        return w - (w.dot(u) / u.dot(u)) * u

    v1, v2 = perp(C), perp(D)
    return sp.simplify(v1.dot(v2) / (v1.norm() * v2.norm()))


def dihedral_cos_from_normals(n1, n2):
    """由两半平面法向量求二面角余弦（符号依赖法向量取向，通常配合几何判断锐钝）。"""
    return sp.simplify(n1.dot(n2) / (n1.norm() * n2.norm()))


# ===================== 体积 =====================

def volume_box(lx, ly, lz):
    return sp.simplify(sp.sympify(lx) * sp.sympify(ly) * sp.sympify(lz))


def volume_prism(base_area, height):
    return sp.simplify(sp.sympify(base_area) * sp.sympify(height))


def volume_pyramid(base_area, height):
    return sp.simplify(sp.Rational(1, 3) * sp.sympify(base_area) * sp.sympify(height))


def volume_tetra(A, B, C, D):
    """四面体体积 = |（AB × AC）· AD| / 6。"""
    return sp.simplify(sp.Abs((B - A).cross(C - A).dot(D - A)) / 6)


# ===================== LaTeX 输出 =====================

def tex(expr):
    return sp.latex(sp.simplify(expr))


def is_clean(expr, max_ops=7, max_radicand=60):
    """判断答案是否“规整”：化简后复杂度低、至多含小整数根号、无嵌套根式。

    用于随机出题：参数随机求解后，答案不规整就重抽。
    """
    e = sp.radsimp(sp.nsimplify(sp.simplify(expr)))
    if e.has(sp.zoo, sp.nan, sp.oo) or e.free_symbols:
        return False
    if sp.count_ops(e) > max_ops:
        return False
    for p in e.atoms(sp.Pow):
        if p.exp == sp.Rational(1, 2):
            rad = p.base
            if not (rad.is_Integer and 0 <= int(rad) <= max_radicand):
                return False
            if rad.atoms(sp.Pow):  # 嵌套根式
                return False
    return True


def tex_vec(v):
    return "(" + ", ".join(sp.latex(sp.simplify(c)) for c in v) + ")"


# ===================== 几何体构建库（数学坐标） =====================

def regular_quad_pyramid(base_edge, height):
    """正四棱锥 P-ABCD：底面中心 O 为原点，对角线 AC 在 x 轴、BD 在 y 轴，顶点 P 在 z 轴。

    返回 {name: sympy 列向量}（数学坐标）。
    """
    a = sp.sympify(base_edge)
    h = sp.sympify(height)
    d = sp.simplify(a / sqrt(2))  # 半对角线 = a√2/2
    return {
        "O": V(0, 0, 0),
        "A": V(d, 0, 0),
        "C": V(-d, 0, 0),
        "B": V(0, d, 0),
        "D": V(0, -d, 0),
        "P": V(0, 0, h),
    }


def cuboid(lx, ly, lz):
    """长方体 ABCD-A1B1C1D1：A 在原点，AB 沿 x，AD 沿 y，AA1 沿 z。"""
    lx, ly, lz = sp.sympify(lx), sp.sympify(ly), sp.sympify(lz)
    return {
        "A": V(0, 0, 0), "B": V(lx, 0, 0), "C": V(lx, ly, 0), "D": V(0, ly, 0),
        "A1": V(0, 0, lz), "B1": V(lx, 0, lz), "C1": V(lx, ly, lz), "D1": V(0, ly, lz),
    }


def cube(edge):
    """正方体（长方体的特例）。"""
    return cuboid(edge, edge, edge)


def regular_tetrahedron(edge=2 * sqrt(2)):
    """正四面体 ABCD（默认棱长 2√2 时坐标为整数）。返回 {name: 数学向量}。"""
    base = {
        "A": V(1, 1, 1),
        "B": V(1, -1, -1),
        "C": V(-1, 1, -1),
        "D": V(-1, -1, 1),
    }
    k = sp.simplify(sp.sympify(edge) / (2 * sqrt(2)))  # 缩放到目标棱长
    return {name: sp.simplify(k * v) for name, v in base.items()}


# ===================== 数学坐标 -> three.js 坐标 =====================

def to_three(points, scale=1.5):
    """{name: 数学向量} -> {name: [x, y, z] 浮点（three.js: y 向上）}。"""
    s = sp.Float(scale)
    out = {}
    for name, p in points.items():
        mx, my, mz = p[0], p[1], p[2]
        three = (mx * s, mz * s, my * s)  # three = (x, z, y) * scale
        out[name] = [float(c) for c in three]
    return out


# ===================== 具体题目求解（线面角样例） =====================

def solve_pyramid_line_plane_angle(base_edge=2, height=1, scale=1.5):
    """正四棱锥 P-ABCD，E 为 PC 中点，求直线 BE 与平面 PAC 所成角的正弦值。

    返回组装网页所需的全部数据：精确答案、数学坐标、three 坐标、各步骤中间量(LaTeX)。
    """
    pts = regular_quad_pyramid(base_edge, height)
    pts["E"] = midpoint(pts["P"], pts["C"])

    BE = pts["E"] - pts["B"]
    n = normal_from_points(pts["P"], pts["A"], pts["C"])  # 平面 PAC 法向量
    n_simpl = simplify_vec(n)

    sin_theta = line_plane_angle_sin(BE, n)

    dot = BE.dot(n_simpl)
    norm_BE = sp.sqrt(sum(c**2 for c in BE))

    return {
        "answer_latex": tex(sin_theta),
        "math_points": {k: tex_vec(v) for k, v in pts.items()},
        "three_points": to_three(pts, scale=scale),
        "vals": {
            "E": tex_vec(pts["E"]),
            "BE": tex_vec(BE),
            "n": tex_vec(n),
            "n_simpl": tex_vec(n_simpl),
            "dot": tex(dot),
            "norm_BE": tex(sp.simplify(norm_BE)),
            "sin": tex(sin_theta),
        },
        "_exact": {"sin_theta": sin_theta},  # 供自检比对
    }


def solve_cube_line_plane_angle(edge=1, scale=2):
    """正方体 ABCD-A1B1C1D1（棱长 a），求直线 A1C 与底面 ABCD 所成角的正弦值。"""
    pts = cube(edge)
    line = pts["C"] - pts["A1"]                                   # 方向向量 A1C
    n = normal_from_points(pts["A"], pts["B"], pts["D"])          # 底面 ABCD 法向量
    n_simpl = simplify_vec(n)

    sin_theta = line_plane_angle_sin(line, n)
    dot = line.dot(n_simpl)
    norm_line = sp.sqrt(sum(c**2 for c in line))

    return {
        "answer_latex": tex(sin_theta),
        "math_points": {k: tex_vec(v) for k, v in pts.items()},
        "three_points": to_three(pts, scale=scale),
        "vals": {
            "A1C": tex_vec(line),
            "n": tex_vec(n),
            "n_simpl": tex_vec(n_simpl),
            "dot": tex(dot),
            "norm_line": tex(sp.simplify(norm_line)),
            "sin": tex(sin_theta),
        },
        "_exact": {"sin_theta": sin_theta},
    }


if __name__ == "__main__":
    sol = solve_pyramid_line_plane_angle()
    expected = 2 * sqrt(22) / 11
    got = sol["_exact"]["sin_theta"]
    ok = sp.simplify(got - expected) == 0
    print("答案(LaTeX):", sol["answer_latex"])
    print("E:", sol["vals"]["E"])
    print("BE:", sol["vals"]["BE"])
    print("法向量 n:", sol["vals"]["n"], "-> 简化", sol["vals"]["n_simpl"])
    print("|BE|:", sol["vals"]["norm_BE"])
    print("three 坐标 E:", sol["three_points"]["E"])
    print("复现 2√22/11 :", "通过" if ok else "失败")
    assert ok, "线面角答案与期望 2√22/11 不一致"

    sol2 = solve_cube_line_plane_angle()
    exp2 = sqrt(3) / 3
    ok2 = sp.simplify(sol2["_exact"]["sin_theta"] - exp2) == 0
    print("正方体 A1C-底面:", sol2["answer_latex"], "复现 √3/3 :", "通过" if ok2 else "失败")
    assert ok2, "正方体线面角答案与期望 √3/3 不一致"

    print("\n--- 四类求解器自检 ---")

    # 异面直线夹角：正方体中 A1C 与 AB（cos = √3/3）
    cb = cube(1)
    cos_ll = line_line_angle_cos(cb["C"] - cb["A1"], cb["B"] - cb["A"])
    ok_ll = sp.simplify(cos_ll - sqrt(3) / 3) == 0
    print("异面直线 A1C·AB cos =", tex(cos_ll), "(期望 √3/3)", "通过" if ok_ll else "失败")
    assert ok_ll

    # 点到平面距离：正方体 A1 到底面 ABCD（= 1）
    n_base = normal_from_points(cb["A"], cb["B"], cb["D"])
    dist = point_plane_distance(cb["A1"], cb["A"], n_base)
    ok_d = sp.simplify(dist - 1) == 0
    print("A1 到底面 ABCD 距离 =", tex(dist), "(期望 1)", "通过" if ok_d else "失败")
    assert ok_d

    # 二面角：正四面体 C-AB-D（cos = 1/3）
    tet = regular_tetrahedron()
    cos_dih = dihedral_cos(tet["A"], tet["B"], tet["C"], tet["D"])
    ok_dih = sp.simplify(cos_dih - sp.Rational(1, 3)) == 0
    print("正四面体二面角 cos =", tex(cos_dih), "(期望 1/3)", "通过" if ok_dih else "失败")
    assert ok_dih

    # 体积：正四面体棱长 2√2 -> 体积 8/3；正三棱锥/盒子核对
    vol_tet = volume_tetra(tet["A"], tet["B"], tet["C"], tet["D"])
    ok_v = sp.simplify(vol_tet - sp.Rational(8, 3)) == 0
    print("正四面体(棱2√2) 体积 =", tex(vol_tet), "(期望 8/3)", "通过" if ok_v else "失败")
    assert ok_v
    assert volume_box(2, 3, 4) == 24 and volume_pyramid(4, 3) == 4
    print("体积 box(2,3,4)=24, pyramid(4,3)=4 通过")

    print("\n全部自检通过 ✅")
