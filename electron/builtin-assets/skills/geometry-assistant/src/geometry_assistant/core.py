"""Core logic for geometry-assistant: validation and standalone HTML generation."""
import json
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# Package-data template access (robust across Python 3.9+ and older)
# ---------------------------------------------------------------------------
try:
    from importlib.resources import files as _resource_files

    def _read_template():
        return (_resource_files("geometry_assistant.assets") / "template.html").read_text(
            encoding="utf-8"
        )
except ImportError:  # Python < 3.9
    from importlib.resources import read_text as _resource_read_text

    def _read_template():
        return _resource_read_text(
            "geometry_assistant.assets", "template.html", encoding="utf-8"
        )

# ---------------------------------------------------------------------------
# Validation constants
# ---------------------------------------------------------------------------
ALLOWED_EDGE_RENDER_MODES = {"auxiliary", "axis"}
COORDINATE_KEYWORDS = (
    "\u5efa\u5750\u6807\u7cfb",
    "\u5750\u6807\u7cfb",
    "\u5750\u6807\u6cd5",
    "\u7a7a\u95f4\u76f4\u89d2\u5750\u6807\u7cfb",
    "\u6cd5\u5411\u91cf",
    "\u5e73\u9762\u65b9\u7a0b",
    "\u5939\u89d2\u516c\u5f0f",
    "\u70b9\u5230\u5e73\u9762",
)
DERIVED_KEYWORDS = (
    "\u4f5c",
    "\u5782\u8db3",
    "\u6295\u5f71",
    "\u8f85\u52a9",
    "\u4e2d\u70b9",
    "\u4ea4\u4e8e",
    "\u5750\u6807\u7cfb",
)
INITIAL_STEP_KEYS = ("\u5df2\u77e5", "\u521d\u59cb", "\u52a0\u8f7d", "\u89c2\u5bdf")
PROOF_PROCESS_KEYWORDS = (
    "\u56e0\u4e3a",
    "\u6240\u4ee5",
    "\u6545",
    "\u7531",
    "\u53ef\u5f97",
    "\u8bc1\u660e",
    "\u8ba1\u7b97",
    "\u8bbe",
    "\u4f5c",
    "\u8fde\u63a5",
    "\u5f97",
    "\u5750\u6807",
    "\u6cd5\u5411\u91cf",
    "\u2225",
    "\u22a5",
    "\u2220",
    "\u2235",
    "\u2234",
    "=",
)
THEOREM_ONLY_HINTS = ("\u5b9a\u7406", "\u5b9a\u4e49", "\u6027\u8d28", "\u516c\u5f0f", "\u5224\u5b9a")
PART_MARKER_RE = re.compile(r"(?:^|[\n\r\uff1b;\u3002])\s*(?:\(\d+\)|\uff08\d+\uff09|[\u2460-\u2473])")
BASE_FACE_RE = re.compile(r"\u5e95\u9762\s*([A-Z][A-Z][A-Z][A-Z])")
RIGHT_PRISM_RE = re.compile(r"\u76f4\u4e09\u68f1\u67f1\s*([A-Z]{3})-([A-Z]1[A-Z]1[A-Z]1)")
NAMED_CIRCLE_RE = re.compile(r"\u5706\s*([A-Z])")
GEOMETRY_TOLERANCE = 1e-6


def _is_aux_entity(entity):
    return bool(
        entity.get("auxiliary")
        or entity.get("constructionOnly")
        or entity.get("axisEndpoint")
        or entity.get("renderMode") == "auxiliary"
    )


def _step_text(step):
    return "\n".join(str(step.get(key, "")) for key in ("title", "subtitle", "theorem", "note"))


def _collect_geometry(geom_data):
    vertices = {}
    edges = {}
    faces = {}
    duplicate_pairs = []
    edge_pairs = {}
    for solid in geom_data.get("solids", []):
        solid_id = solid.get("id", "<solid>")
        for vertex in solid.get("vertices", []):
            vertex_id = vertex.get("id")
            if vertex_id:
                vertices[vertex_id] = vertex
        for face in solid.get("faces", []):
            face_id = face.get("id")
            if face_id:
                faces[face_id] = face
        for edge in solid.get("edges", []):
            edge_id = edge.get("id")
            if edge_id:
                edges[edge_id] = edge
            pair = tuple(sorted((edge.get("v1", ""), edge.get("v2", ""))))
            if pair[0] and pair[1]:
                previous = edge_pairs.get(pair)
                if previous:
                    duplicate_pairs.append(
                        (previous, edge_id or "<edge>", pair, solid_id)
                    )
                else:
                    edge_pairs[pair] = edge_id or "<edge>"
    return vertices, edges, faces, duplicate_pairs


def _collect_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from _collect_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from _collect_strings(child)


def _known_initial_ids(geom_data):
    known = set()
    for condition in geom_data.get("conditions", []):
        for value in _collect_strings(condition.get("targets", {})):
            known.add(value)
        for key in ("target", "line", "plane"):
            value = condition.get(key)
            if isinstance(value, str):
                known.add(value)
    for step in geom_data.get("solutionSteps", []):
        text = _step_text(step)
        if any(key in text for key in INITIAL_STEP_KEYS):
            known.update(step.get("highlights", []))
    return known


def _count_problem_parts(problem_text):
    return len(PART_MARKER_RE.findall(problem_text or ""))


def _explicit_base_faces(problem_text):
    return [match.group(1) for match in BASE_FACE_RE.finditer(problem_text or "")]


def _text_contains_id(text, entity_id):
    pattern = rf"(?<![A-Za-z0-9']){re.escape(entity_id)}(?![A-Za-z0-9'])"
    return re.search(pattern, text or "") is not None


def _first_part_marker_index(problem_text):
    match = PART_MARKER_RE.search(problem_text or "")
    return match.start() if match else -1


def _condition_part_specific_error(condition, problem_text, vertices):
    split_at = _first_part_marker_index(problem_text)
    if split_at < 0:
        return None
    prefix = problem_text[:split_at]
    suffix = problem_text[split_at:]
    for value in _collect_strings(condition.get("targets", {})):
        if value in vertices and not _text_contains_id(prefix, value) and _text_contains_id(suffix, value):
            return f"part-specific condition {condition.get('id', '<condition>')} targets {value}; put it in solutionSteps, not global conditions"
    return None


def _axis_direction_error(edge_id, edge, vertices):
    if edge.get("renderMode") != "axis":
        return None
    label = edge.get("axisLabel")
    start = vertices.get(edge.get("v1"), {}).get("pos")
    end = vertices.get(edge.get("v2"), {}).get("pos")
    if not isinstance(start, list) or not isinstance(end, list) or len(start) < 3 or len(end) < 3:
        return None
    delta = [end[i] - start[i] for i in range(3)]
    axis_index = {"x": 0, "y": 1, "z": 2}.get(label)
    if axis_index is None:
        return None
    primary = abs(delta[axis_index])
    secondary = sum(abs(delta[i]) for i in range(3) if i != axis_index)
    if primary <= GEOMETRY_TOLERANCE or secondary > GEOMETRY_TOLERANCE:
        if label == "z":
            return f"z axis must point upward: coordinate axis edge {edge_id} should change only the third coordinate"
        return f"coordinate {label} axis edge {edge_id} should change only coordinate {axis_index + 1}"
    if delta[axis_index] <= GEOMETRY_TOLERANCE:
        return f"coordinate axis edge {edge_id} should point in the positive {label} direction"
    return None


def _right_prism_base_errors(geom_data, vertices, faces):
    errors = []
    problem_text = geom_data.get("problemText", "")
    for match in RIGHT_PRISM_RE.finditer(problem_text):
        base_id = match.group(1)
        face = faces.get(base_id)
        if not face:
            errors.append(f"right prism base face {base_id} is missing")
            continue
        if set(face.get("vertices", [])) != set(base_id):
            errors.append(f"right prism base face {base_id} must use vertices {base_id}")
            continue
        base_vertices = [vertices.get(vertex_id) for vertex_id in base_id]
        if any(not vertex or not isinstance(vertex.get("pos"), list) or len(vertex.get("pos")) < 3 for vertex in base_vertices):
            continue
        heights = [vertex["pos"][2] for vertex in base_vertices]
        if max(heights) - min(heights) > GEOMETRY_TOLERANCE:
            errors.append(f"right prism base face {base_id} should be horizontal; keep its vertices at the same vertical coordinate")
        for vertex_id in base_id:
            top_id = vertex_id + "1"
            base_vertex = vertices.get(vertex_id)
            top_vertex = vertices.get(top_id)
            if not top_vertex or not isinstance(top_vertex.get("pos"), list) or len(top_vertex.get("pos")) < 3:
                continue
            base_pos = base_vertex["pos"]
            top_pos = top_vertex["pos"]
            if abs(top_pos[0] - base_pos[0]) > GEOMETRY_TOLERANCE or abs(top_pos[1] - base_pos[1]) > GEOMETRY_TOLERANCE or top_pos[2] <= base_pos[2] + GEOMETRY_TOLERANCE:
                errors.append(f"right prism lateral edge {vertex_id}{top_id} should be vertical with z upward")
    return errors


def _step_process_error(step):
    step_id = step.get('id', '<step>')
    rules = step.get('rules') or step.get('usedRules') or step.get('basis')
    if not isinstance(rules, list) or not any(str(rule).strip() for rule in rules):
        return f"solution step {step_id} needs non-empty rules listing the theorem/corollary/formula used in this step"
    text = _step_text(step).strip()
    compact = re.sub(r"\s+", "", text)
    if not compact:
        return f"solution step {step_id} needs proof/process text"
    has_theorem_only_hint = any(hint in compact for hint in THEOREM_ONLY_HINTS)
    has_process = any(keyword in compact for keyword in PROOF_PROCESS_KEYWORDS)
    if has_theorem_only_hint and (len(compact) < 18 or not has_process):
        return (
            f"solution step {step_id} needs proof/process text, "
            "not only a theorem name"
        )
    return None


def validate_geometry_data(geom_data):
    """Fail fast on data patterns that repeatedly caused misleading 3D scenes."""
    errors = []
    vertices, edges, faces, duplicate_pairs = _collect_geometry(geom_data)
    known_initial = _known_initial_ids(geom_data)
    solution_steps = geom_data.get("solutionSteps", [])
    problem_part_count = _count_problem_parts(geom_data.get("problemText", ""))
    declared_parts = geom_data.get("parts") or geom_data.get("questionParts") or []

    if problem_part_count >= 2:
        if len(declared_parts) < problem_part_count:
            errors.append(
                f"multi-part problem has {problem_part_count} questions but only {len(declared_parts)} parts"
            )
        condition_ids = {condition.get("id") for condition in geom_data.get("conditions", []) if condition.get("id")}
        for part in declared_parts:
            if not part.get("stepIds"):
                errors.append(f"multi-part problem part {part.get('id', '<part>')} needs stepIds")
            if condition_ids:
                if not part.get("conditionIds"):
                    errors.append(f"multi-part problem part {part.get('id', '<part>')} needs conditionIds")
                else:
                    for condition_id in part.get("conditionIds", []):
                        if condition_id not in condition_ids:
                            errors.append(
                                f"multi-part problem part {part.get('id', '<part>')} references missing condition {condition_id}"
                            )

    declared_circle_centers = {
        circle.get("centerVertex")
        for solid in geom_data.get("solids", [])
        for circle in solid.get("circles", [])
        if circle.get("centerVertex")
    }
    for circle_center in set(NAMED_CIRCLE_RE.findall(geom_data.get("problemText", ""))):
        if circle_center not in declared_circle_centers:
            errors.append(
                f"problem mentions circle {circle_center} but no solids[].circles entry declares centerVertex {circle_center}"
            )

    for base_face_id in _explicit_base_faces(geom_data.get("problemText", "")):
        face = faces.get(base_face_id)
        if not face:
            errors.append(f"explicit pyramid base face {base_face_id} is missing; use {base_face_id} as the base face")
        elif set(face.get("vertices", [])) != set(base_face_id):
            errors.append(f"explicit pyramid base face {base_face_id} must use vertices {base_face_id}")

    for step in solution_steps:
        process_error = _step_process_error(step)
        if process_error:
            errors.append(process_error)

    errors.extend(_right_prism_base_errors(geom_data, vertices, faces))

    for previous, current, pair, solid_id in duplicate_pairs:
        errors.append(
            f"duplicate edge in {solid_id}: {previous} and {current} both connect {pair[0]}-{pair[1]}"
        )

    for edge_id, edge in edges.items():
        render_mode = edge.get("renderMode")
        if render_mode and render_mode not in ALLOWED_EDGE_RENDER_MODES:
            errors.append(
                f"edge {edge_id} has invalid renderMode {render_mode!r}; "
                "use dashed/hidden/auxiliary/axis semantics instead"
            )
        for key in ("v1", "v2"):
            vertex_id = edge.get(key)
            if vertex_id not in vertices:
                errors.append(f"edge {edge_id} references missing vertex {vertex_id!r}")
        if render_mode == "axis":
            axis_error = _axis_direction_error(edge_id, edge, vertices)
            if axis_error:
                errors.append(axis_error)
            if not edge.get("auxiliary"):
                errors.append(f"coordinate axis edge {edge_id} must be auxiliary")
            if edge.get("axisLabel") not in {"x", "y", "z"}:
                errors.append(
                    f"coordinate axis edge {edge_id} must declare axisLabel x/y/z"
                )
            endpoint = vertices.get(edge.get("v2"))
            if endpoint and not endpoint.get("axisEndpoint"):
                errors.append(
                    f"coordinate axis edge {edge_id} should point to a hidden axisEndpoint vertex"
                )

    for vertex_id, vertex in vertices.items():
        if vertex.get("axisEndpoint") and vertex.get("label"):
            errors.append(f"axis endpoint vertex {vertex_id} must not have a visible label")

    for solid in geom_data.get("solids", []):
        for circle in solid.get("circles", []):
            circle_id = circle.get("id", "<circle>")
            center_id = circle.get("centerVertex")
            if center_id and center_id not in vertices:
                errors.append(f"circle {circle_id} references missing centerVertex {center_id!r}")
            radius_vertex = circle.get("radiusVertex") or circle.get("pointOnCircle") or circle.get("through")
            if radius_vertex and radius_vertex not in vertices:
                errors.append(f"circle {circle_id} references missing radius vertex {radius_vertex!r}")
            if not center_id and not isinstance(circle.get("center"), list):
                errors.append(f"circle {circle_id} needs centerVertex or center")
            if not (circle.get("radius") or radius_vertex):
                errors.append(f"circle {circle_id} needs radius or radiusVertex")

    for face_id, face in faces.items():
        for vertex_id in face.get("vertices", []):
            if vertex_id not in vertices:
                errors.append(f"face {face_id} references missing vertex {vertex_id!r}")

    highlighted_ids = set()
    axis_edge_ids = {
        edge_id for edge_id, edge in edges.items() if edge.get("renderMode") == "axis"
    }
    axis_labels = {
        edge.get("axisLabel") for edge in edges.values() if edge.get("renderMode") == "axis"
    }
    for step in geom_data.get("solutionSteps", []):
        text = _step_text(step)
        highlights = set(step.get("highlights", []))
        highlighted_ids.update(highlights)
        if any(keyword in text for keyword in COORDINATE_KEYWORDS):
            if axis_labels != {"x", "y", "z"}:
                errors.append(
                    f"coordinate step {step.get('id', '<step>')} needs x/y/z coordinate axis edges"
                )
            if axis_edge_ids and not axis_edge_ids.issubset(highlighted_ids):
                errors.append(
                    f"coordinate step {step.get('id', '<step>')} must reveal coordinate axis edges in highlights before coordinate calculations"
                )
        if any(keyword in text for keyword in DERIVED_KEYWORDS):
            for item_id in highlights:
                vertex = vertices.get(item_id)
                edge = edges.get(item_id)
                if vertex and item_id not in known_initial and not _is_aux_entity(vertex):
                    errors.append(
                        f"derived point {item_id} in step {step.get('id', '<step>')} must be auxiliary"
                    )
                if edge and item_id not in known_initial:
                    endpoints = (edge.get("v1"), edge.get("v2"))
                    uses_aux_endpoint = any(
                        _is_aux_entity(vertices.get(vertex_id, {}))
                        for vertex_id in endpoints
                    )
                    if (
                        uses_aux_endpoint or edge.get("renderMode") == "auxiliary"
                    ) and not _is_aux_entity(edge):
                        errors.append(
                            f"derived edge {item_id} in step {step.get('id', '<step>')} must be auxiliary"
                        )

    for entity_id, entity in {**vertices, **edges}.items():
        if (
            _is_aux_entity(entity)
            and entity.get("renderMode") != "axis"
            and entity_id not in highlighted_ids
        ):
            errors.append(f"auxiliary entity {entity_id} is never revealed by a solution step")

    for condition in geom_data.get("conditions", []):
        part_specific_error = _condition_part_specific_error(condition, geom_data.get("problemText", ""), vertices)
        if part_specific_error:
            errors.append(part_specific_error)
        for key in ("target", "line", "plane"):
            value = condition.get(key)
            if (
                isinstance(value, str)
                and value not in vertices
                and value not in edges
                and value not in faces
            ):
                errors.append(
                    f"condition {condition.get('id', '<condition>')} references missing {key} {value!r}"
                )
        if condition.get("type") in {"perpendicular", "right-angle"}:
            targets = condition.get("targets", {})
            marker_target = (
                condition.get("target")
                or condition.get("line")
                or targets.get("segment")
                or targets.get("vertex")
                or targets.get("lineA")
                or targets.get("lineB")
                or targets.get("line2")
            )
            if not marker_target:
                errors.append(
                    f"condition {condition.get('id', '<condition>')} needs a target/line for an L marker"
                )

    if errors:
        raise ValueError("geometryData validation failed:\n- " + "\n- ".join(errors))


def build_standalone_html(geom_data, template_text=None):
    """Embed geometryData into a standalone HTML page.

    If template_text is None, reads the bundled template from the package.
    """
    if template_text is None:
        template_text = _read_template()

    data_json = json.dumps(geom_data, ensure_ascii=False, separators=(",", ":"))
    embedded = f"<script>window.__GEOMETRY_DATA__={data_json};</script>\n"
    if "window.__GEOMETRY_DATA__" not in template_text:
        template_text = template_text.replace(
            '<script type="module">', embedded + '<script type="module">', 1
        )

    standalone_boot = """if (window.__GEOMETRY_DATA__) {
  init(window.__GEOMETRY_DATA__);
  const statusHint = document.getElementById('status-hint');
  if (statusHint) statusHint.textContent = '\u5df2\u52a0\u8f7d\u81ea\u5305\u542b\u9898\u76ee\u6570\u636e';
} else {
  loadCurrentProblem();
}"""
    if "loadCurrentProblem();" in template_text:
        template_text = template_text.replace("loadCurrentProblem();", standalone_boot, 1)
    else:
        marker = "init(geometryData);"
        template_text = template_text.replace(
            marker, "init(window.__GEOMETRY_DATA__ || geometryData);", 1
        )

    return template_text.replace(
        'fetch("problems/current.json", { cache: "no-store" })',
        'fetch("__standalone_disabled_current.json", { cache: "no-store" })',
    )
