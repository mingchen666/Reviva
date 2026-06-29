# 约定与解法配方（conventions）

## 1. 坐标系与映射

**数学坐标（z 轴向上）** 是解题与公式展示用的坐标；**three.js 坐标（y 轴向上）** 是渲染用的坐标。

映射（`geometry_kernel.to_three`）：`three = (x, z, y) * scale`。`scale` 只影响观感，不影响解题数值。

各几何体的标准建系（见 `geometry_kernel.py`）：
- `regular_quad_pyramid(base_edge, height)` — 底面中心 $O$ 为原点，对角线 $AC$ 在 $x$ 轴、$BD$ 在 $y$ 轴，顶点 $P$ 在 $z$ 轴。半对角线 $d = a/\sqrt2$。
- `cuboid(lx, ly, lz)` / `cube(edge)` — 顶点 $A$ 为原点，$AB$ 沿 $x$、$AD$ 沿 $y$、$AA_1$ 沿 $z$。
- 新几何体：在 kernel 加一个返回 `{name: V(x,y,z)}` 的函数；在 `bodies.py` 加对应的棱拓扑。

## 2. 解法配方（query.type → kernel 函数）

所有所求都走"建系 + 向量法"，数值由 kernel 精确算出，**不要心算**。

| query.type | 公式 | kernel 函数 |
|---|---|---|
| `line_plane_angle` | $\sin\theta = \dfrac{|\vec v\cdot\vec n|}{|\vec v||\vec n|}$ | `line_plane_angle_sin(v, n)` |
| `line_line_angle` | $\cos\theta = \dfrac{|\vec{d_1}\cdot\vec{d_2}|}{|\vec{d_1}||\vec{d_2}|}$ | `line_line_angle_cos(d1, d2)` |
| `dihedral` | 两半平面法向量夹角余弦（注意正负号 / 钝锐） | 用 `normal_from_points` + 余弦公式 |
| `point_plane_distance` | $d = \dfrac{|(P-P_0)\cdot\vec n|}{|\vec n|}$ | `point_plane_distance(P, P0, n)` |
| `volume` | 按体型公式 | （按需在 kernel 添加） |

辅助：`midpoint(a,b)`、`normal_from_points(p,q,r)`（叉积）、`simplify_vec(v)`（约简到最简整系数方向，用于"简化取 n=…"展示）、`tex(expr)` / `tex_vec(v)`（LaTeX 输出）。

## 3. 步骤与镜头

- 典型 4 步：建系 → 求关键向量 → 求法向量/方向 → 代入公式得答案。
- 每步 `highlight` 给出该步应可见的元素（绝对集合）；常见节奏：建系亮坐标轴 → 逐步亮出关键线、平面、法向量。
- 每步 `cameraPos` 给一个能看清当前重点的视角（three 坐标）；`target` 通常取几何体中心。

## 4. 渲染元素建议

- 关键线（所求直线）用 `emphasis` 色并 `depthTest:false`（始终可见）。
- 辅助线（对角线、投影）用 `aux` 色 + `dashed`。
- 所求平面用 `plane`（半透明）。法向量用 `arrow` + `normal` 色。
- 坐标轴用 `axes`，一般只在建系那步显示。

## 5. 正确性自检（必须）

- kernel 算出的答案，必须与"答案卡 `answerValue`"和"末步骤展示的最终值"三者一致。
- 3D 顶点坐标必须来自 `kernel.to_three`（与解题同源），不要另行手填坐标。
- 随机题：与 kernel 生成时的标准答案比对。
- 生成后建议起本地服务用预览检查：无控制台报错、公式渲染正常、分步高亮与镜头符合预期。
