#!/usr/bin/env python3
"""Generate printable PDF study guides.

Usage:
    python -m scripts.gen_study_guide --data guide.json --output guide.pdf

Input JSON format:
    {
        "title": "高一物理力学复习指南",
        "subtitle": "期末考试重点梳理",
        "sections": [
            {
                "heading": "一、受力分析",
                "content": "受力分析是力学的基础...",
                "key_points": ["只画性质力", "一画二查三确认", "每个力找施力物体"],
                "formulas": ["F=ma", "f=μN"],
                "example": "斜面上物体受力：重力+支持力+摩擦力"
            }
        ]
    }
"""

import argparse
import json
import sys
from pathlib import Path


def generate_pdf(data, output_path):
    """Generate PDF study guide using fpdf2."""
    try:
        from fpdf import FPDF
    except ImportError:
        print("Error: fpdf2 is not installed. Install with: pip install fpdf2", file=sys.stderr)
        sys.exit(1)

    class StudyGuidePDF(FPDF):
        def header(self):
            if self.page_no() > 1:
                self.set_font("helvetica", "I", 8)
                self.cell(0, 5, data.get("title", "Study Guide"), align="C")
                self.ln(8)

        def footer(self):
            self.set_y(-15)
            self.set_font("helvetica", "I", 8)
            self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    pdf = StudyGuidePDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Try to add Chinese font support
    font_added = False
    chinese_font_paths = [
        "C:/Windows/Fonts/msyh.ttc",  # Microsoft YaHei
        "C:/Windows/Fonts/simsun.ttc",  # SimSun
        "C:/Windows/Fonts/simhei.ttf",  # SimHei
    ]
    for font_path in chinese_font_paths:
        if Path(font_path).exists():
            try:
                pdf.add_font("chinese", "", font_path, uni=True)
                pdf.add_font("chinese", "B", font_path, uni=True)
                font_added = True
                break
            except Exception:
                continue

    font_name = "chinese" if font_added else "helvetica"

    pdf.add_page()

    # Title
    pdf.set_font(font_name, "B", 22)
    pdf.cell(0, 15, data.get("title", "Study Guide"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # Subtitle
    if data.get("subtitle"):
        pdf.set_font(font_name, "", 12)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 8, data["subtitle"], align="C", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)
        pdf.ln(8)

    # Divider
    pdf.set_draw_color(74, 144, 217)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(8)

    # Sections
    for section in data.get("sections", []):
        # Section heading
        pdf.set_font(font_name, "B", 14)
        pdf.set_text_color(33, 37, 41)
        pdf.cell(0, 10, section.get("heading", ""), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        # Content
        if section.get("content"):
            pdf.set_font(font_name, "", 10)
            pdf.multi_cell(0, 6, section["content"])
            pdf.ln(3)

        # Key points
        if section.get("key_points"):
            pdf.set_font(font_name, "B", 10)
            pdf.cell(0, 6, "Key Points:", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font(font_name, "", 10)
            for point in section["key_points"]:
                pdf.cell(5)
                pdf.cell(0, 6, f"- {point}", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)

        # Formulas
        if section.get("formulas"):
            pdf.set_font(font_name, "B", 10)
            pdf.cell(0, 6, "Formulas:", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font(font_name, "", 10)
            for formula in section["formulas"]:
                pdf.cell(5)
                pdf.cell(0, 6, f"- {formula}", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)

        # Example
        if section.get("example"):
            pdf.set_fill_color(245, 245, 245)
            pdf.set_font(font_name, "B", 10)
            pdf.cell(0, 6, "Example:", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font(font_name, "", 9)
            pdf.multi_cell(0, 5, f"  {section['example']}", fill=True)
            pdf.ln(4)

        # Section divider
        pdf.set_draw_color(200, 200, 200)
        pdf.set_line_width(0.3)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(5)

    pdf.output(str(output_path))
    print(f"PDF study guide saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Generate PDF study guides from JSON data")
    parser.add_argument("--data", required=True, help="Path to input JSON data file")
    parser.add_argument("--output", required=True, help="Output PDF file path")
    parser.add_argument("--title", default=None, help="Title (overrides data)")

    args = parser.parse_args()

    with open(args.data, "r", encoding="utf-8") as f:
        data = json.load(f)

    if args.title:
        data["title"] = args.title

    generate_pdf(data, Path(args.output))


if __name__ == "__main__":
    main()
