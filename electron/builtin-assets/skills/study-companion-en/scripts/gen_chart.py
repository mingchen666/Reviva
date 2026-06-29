#!/usr/bin/env python3
"""Generate charts using matplotlib or plotly.

Usage:
    python -m scripts.gen_chart --data chart.json --output plot.svg
    python -m scripts.gen_chart --data chart.json --output plot.html --engine plotly
    python -m scripts.gen_chart --data surface.json --output surface.html --type 3d_surface --engine plotly

Input JSON format:
    {
        "series": [
            {"name": "sin(x)", "x": [0, 0.1, ...], "y": [0, 0.0998, ...]},
            {"name": "cos(x)", "x": [0, 0.1, ...], "y": [1, 0.9950, ...]}
        ],
        "title": "Trigonometric Functions",
        "xlabel": "x",
        "ylabel": "y"
    }

    For bar charts:
    {
        "categories": ["A", "B", "C"],
        "values": [10, 25, 15],
        "title": "Distribution"
    }

    For pie charts:
    {
        "labels": ["Physics", "Chemistry", "Math"],
        "values": [30, 25, 45],
        "title": "Study Time"
    }

    For scatter plots:
    {
        "series": [
            {"name": "Group A", "x": [1,2,3], "y": [4,5,6], "size": [10,20,30]}
        ]
    }

    For 3D plots (plotly only):
    {
        "series": [
            {"name": "Surface", "x": [...], "y": [...], "z": [...]}
        ],
        "chart_type": "3d_surface"
    }
"""

import argparse
import json
from pathlib import Path


def normalize_chart_type(chart_type):
    """Normalize chart type aliases used by older skill docs."""
    if chart_type == "3d":
        return "3d_surface"
    return chart_type


def generate_matplotlib(data, output_path, fmt="svg"):
    """Generate chart using matplotlib (static SVG/PNG)."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    chart_type = normalize_chart_type(data.get("chart_type", "line"))
    title = data.get("title", "")
    xlabel = data.get("xlabel", "")
    ylabel = data.get("ylabel", "")

    fig, ax = plt.subplots(figsize=(10, 6))

    series = data.get("series", [])

    if chart_type in ("line", None) and series:
        for s in series:
            ax.plot(s["x"], s["y"], label=s.get("name", ""), marker="o" if len(s["x"]) <= 20 else None, markersize=4)
        if len(series) > 1:
            ax.legend()

    elif chart_type == "bar" or "categories" in data:
        categories = data.get("categories", [])
        values = data.get("values", [])
        colors = data.get("colors", None)
        ax.bar(categories, values, color=colors)

    elif chart_type == "pie" or "labels" in data and "values" in data and "categories" not in data:
        labels = data.get("labels", [])
        values = data.get("values", [])
        ax.pie(values, labels=labels, autopct="%1.1f%%", startangle=90)

    elif chart_type == "scatter" and series:
        for s in series:
            sizes = s.get("size", 50)
            ax.scatter(s["x"], s["y"], s=sizes, label=s.get("name", ""), alpha=0.7)
        if len(series) > 1:
            ax.legend()

    elif chart_type == "histogram":
        for s in series:
            ax.hist(s["x"], bins=s.get("bins", 20), label=s.get("name", ""), alpha=0.7)
        if len(series) > 1:
            ax.legend()

    elif chart_type == "heatmap":
        import numpy as np
        matrix = data.get("matrix", [])
        row_labels = data.get("row_labels", [])
        col_labels = data.get("col_labels", [])
        im = ax.imshow(matrix, cmap="YlOrRd", aspect="auto")
        if col_labels:
            ax.set_xticks(range(len(col_labels)))
            ax.set_xticklabels(col_labels, rotation=45, ha="right")
        if row_labels:
            ax.set_yticks(range(len(row_labels)))
            ax.set_yticklabels(row_labels)
        fig.colorbar(im, ax=ax)

    elif chart_type == "area" and series:
        for s in series:
            ax.fill_between(s["x"], s["y"], alpha=0.3, label=s.get("name", ""))
            ax.plot(s["x"], s["y"], linewidth=1.5)
        ax.legend()

    elif chart_type in ("3d_surface", "3d_scatter"):
        raise ValueError("3D charts require --engine plotly or an .html output file")

    else:
        raise ValueError(f"Unsupported chart type for matplotlib: {chart_type}")

    if title:
        ax.set_title(title, fontsize=14, fontweight="bold", pad=15)
    if xlabel:
        ax.set_xlabel(xlabel, fontsize=11)
    if ylabel:
        ax.set_ylabel(ylabel, fontsize=11)
    ax.grid(True, alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    plt.tight_layout()

    if fmt == "svg":
        fig.savefig(output_path, format="svg", bbox_inches="tight")
    elif fmt == "png":
        fig.savefig(output_path, format="png", dpi=150, bbox_inches="tight")
    else:
        fig.savefig(output_path, bbox_inches="tight")

    plt.close(fig)
    print(f"Chart saved to {output_path}")


def generate_plotly(data, output_path):
    """Generate interactive chart using plotly."""
    import plotly.graph_objects as go

    chart_type = normalize_chart_type(data.get("chart_type", "line"))
    title = data.get("title", "")
    xlabel = data.get("xlabel", "")
    ylabel = data.get("ylabel", "")
    series = data.get("series", [])

    fig = go.Figure()

    if chart_type in ("line", None) and series:
        for s in series:
            fig.add_trace(go.Scatter(
                x=s["x"], y=s["y"],
                mode="lines+markers" if len(s["x"]) <= 20 else "lines",
                name=s.get("name", ""),
            ))

    elif chart_type == "bar" or "categories" in data:
        categories = data.get("categories", [])
        values = data.get("values", [])
        fig.add_trace(go.Bar(x=categories, y=values))

    elif chart_type == "scatter" and series:
        for s in series:
            fig.add_trace(go.Scatter(
                x=s["x"], y=s["y"],
                mode="markers",
                marker=dict(size=s.get("size", 10)),
                name=s.get("name", ""),
            ))

    elif chart_type == "3d_surface" and series:
        s = series[0]
        fig.add_trace(go.Surface(x=s["x"], y=s["y"], z=s["z"]))

    elif chart_type == "3d_scatter" and series:
        for s in series:
            fig.add_trace(go.Scatter3d(
                x=s["x"], y=s["y"], z=s["z"],
                mode="markers",
                name=s.get("name", ""),
            ))

    elif chart_type == "heatmap":
        matrix = data.get("matrix", [])
        row_labels = data.get("row_labels", [])
        col_labels = data.get("col_labels", [])
        fig.add_trace(go.Heatmap(z=matrix, x=col_labels or None, y=row_labels or None, colorscale="YlOrRd"))

    elif chart_type == "pie" or "labels" in data and "values" in data and "categories" not in data:
        fig.add_trace(go.Pie(labels=data["labels"], values=data["values"]))

    else:
        raise ValueError(f"Unsupported chart type for plotly: {chart_type}")

    fig.update_layout(
        title=title,
        xaxis_title=xlabel,
        yaxis_title=ylabel,
        template="plotly_white",
        font=dict(size=13),
    )

    fig.write_html(str(output_path), include_plotlyjs="cdn")
    print(f"Interactive chart saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Generate charts from JSON data")
    parser.add_argument("--data", required=True, help="Path to input JSON data file")
    parser.add_argument("--output", required=True, help="Output file path (svg/png/html)")
    parser.add_argument("--type", default=None, help="Chart type: line, bar, scatter, pie, heatmap, area, histogram, 3d_surface, 3d_scatter (auto-detected from data; 3d is accepted as an alias for 3d_surface)")
    parser.add_argument("--engine", choices=["matplotlib", "plotly"], default="matplotlib", help="Chart engine (default: matplotlib)")
    parser.add_argument("--title", default=None, help="Chart title (overrides data)")
    parser.add_argument("--xlabel", default=None, help="X axis label (overrides data)")
    parser.add_argument("--ylabel", default=None, help="Y axis label (overrides data)")

    args = parser.parse_args()

    with open(args.data, "r", encoding="utf-8") as f:
        data = json.load(f)

    if args.type:
        data["chart_type"] = args.type
    if args.title:
        data["title"] = args.title
    if args.xlabel:
        data["xlabel"] = args.xlabel
    if args.ylabel:
        data["ylabel"] = args.ylabel

    output = Path(args.output)
    fmt = output.suffix.lstrip(".")

    if args.engine == "plotly" or fmt == "html":
        generate_plotly(data, output)
    else:
        if fmt not in ("svg", "png"):
            fmt = "svg"
        generate_matplotlib(data, output, fmt)


if __name__ == "__main__":
    main()
