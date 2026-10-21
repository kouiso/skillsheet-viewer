#!/usr/bin/env python3
"""月間モデルの表と normal の感度分析の表を PNG にする。

SHA と生成時刻は引数にしない。各 generate-*.log の先頭2行
（checkout で実行した git rev-parse HEAD と date -u）を、そのまま画像の上部に描く。
相手と文字が違うセルだけ黄色にする。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
)

# 生成表の列は長いので、はみ出したセルだけ折り返す。
CELL_FONT_SIZE = 18
HEADER_FONT_SIZE = 22
SECTION_FONT_SIZE = 22
LABEL_FONT_SIZE = 16
CELL_PAD_X = 10
CELL_PAD_Y = 8
MARGIN = 24
MAX_COL = 560
MIN_COL = 96
YELLOW = (255, 236, 120)
HEADER_BG = (226, 232, 240)
BODY_BG = (255, 255, 255)
BANNER_BG = (15, 23, 42)
GRID = (100, 116, 139)
TEXT = (15, 23, 42)
BANNER_TEXT = (248, 250, 252)
MUTED = (71, 85, 105)


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    raise SystemExit("日本語を描けるフォントが無い")


def split_row(line: str) -> list[str]:
    inner = line.strip()
    if inner.startswith("|"):
        inner = inner[1:]
    if inner.endswith("|"):
        inner = inner[:-1]
    return [cell.strip() for cell in inner.split("|")]


def is_separator(cells: list[str]) -> bool:
    if not cells:
        return False
    return all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def alignment_of(cell: str) -> str:
    left = cell.startswith(":")
    right = cell.endswith(":")
    if left and right:
        return "center"
    if right:
        return "right"
    return "left"


def first_table_after(lines: list[str], start: int) -> tuple[list[list[str]], list[str]]:
    """start の次から最初の表を返す。区切り行は描かず、列の揃えだけ残す。"""
    table_lines: list[str] = []
    in_table = False
    for line in lines[start + 1 :]:
        if line.startswith("|"):
            in_table = True
            table_lines.append(line)
            continue
        if in_table:
            break
    if len(table_lines) < 2:
        raise SystemExit(f"表が見つからない: line {start + 1}")
    header = split_row(table_lines[0])
    separator = split_row(table_lines[1])
    if not is_separator(separator):
        raise SystemExit(f"表の区切り行が無い: line {start + 1}")
    if len(separator) != len(header):
        raise SystemExit("表の列数が揃っていない")
    aligns = [alignment_of(cell) for cell in separator]
    rows = [header]
    for line in table_lines[2:]:
        cells = split_row(line)
        if is_separator(cells):
            continue
        if len(cells) != len(header):
            raise SystemExit(f"列数が違う行: {line}")
        rows.append(cells)
    return rows, aligns


def find_heading(lines: list[str], prefix: str) -> int:
    for index, line in enumerate(lines):
        if line.startswith(prefix):
            return index
    raise SystemExit(f"見出しが無い: {prefix}")


def monthly_table(text: str) -> tuple[str, list[list[str]], list[str]]:
    lines = text.splitlines()
    index = find_heading(lines, "## 月間モデル")
    rows, aligns = first_table_after(lines, index)
    if rows[0][0] != "負荷" or len(rows) != 6:
        raise SystemExit(f"月間モデルの表が想定と違う: {len(rows)} 行")
    return lines[index], rows, aligns


def normal_sensitivity_table(text: str) -> tuple[str, list[list[str]], list[str]]:
    lines = text.splitlines()
    section = find_heading(lines, "## 感度分析")
    index = None
    for cursor in range(section + 1, len(lines)):
        if lines[cursor].startswith("## "):
            break
        if lines[cursor] == "### normal":
            index = cursor
            break
    if index is None:
        raise SystemExit("感度分析の ### normal が無い")
    rows, aligns = first_table_after(lines, index)
    if rows[0][0] != "変えた前提" or len(rows) != 14:
        raise SystemExit(f"normal の感度分析の表が想定と違う: {len(rows)} 行")
    return "感度分析 / normal", rows, aligns


def read_header(path: Path) -> tuple[str, str]:
    """ログの1行目は rev-parse、2行目は date -u。生成後に追記してもここは変えない。"""
    lines = path.read_text().splitlines()
    if len(lines) < 2:
        raise SystemExit(f"ログが短い: {path}")
    sha, generated = lines[0], lines[1]
    if not SHA_RE.fullmatch(sha):
        raise SystemExit(f"ログの1行目が SHA ではない: {path}")
    if "UTC" not in generated:
        raise SystemExit(f"ログの2行目が date -u ではない: {path}")
    return sha, generated


def text_width(font: ImageFont.FreeTypeFont, text: str) -> int:
    return int(font.getlength(text))


def wrap_text(font: ImageFont.FreeTypeFont, text: str, max_width: int) -> list[str]:
    if text == "":
        return [""]
    lines: list[str] = []
    current = ""
    for char in text:
        trial = current + char
        if current and text_width(font, trial) > max_width:
            lines.append(current)
            current = char
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


def column_widths(
    rows_a: list[list[str]], rows_b: list[list[str]], font: ImageFont.FreeTypeFont
) -> list[int]:
    count = len(rows_a[0])
    widths: list[int] = []
    for column in range(count):
        widest = MIN_COL
        for rows in (rows_a, rows_b):
            for row in rows:
                widest = max(widest, text_width(font, row[column]) + CELL_PAD_X * 2)
        widths.append(min(widest, MAX_COL))
    return widths


def row_heights(
    rows: list[list[str]],
    widths: list[int],
    font: ImageFont.FreeTypeFont,
) -> list[int]:
    line_height = CELL_FONT_SIZE + 6
    heights: list[int] = []
    for row in rows:
        used = 1
        for column, cell in enumerate(row):
            used = max(used, len(wrap_text(font, cell, widths[column] - CELL_PAD_X * 2)))
        heights.append(used * line_height + CELL_PAD_Y * 2)
    return heights


def draw_table(
    draw: ImageDraw.ImageDraw,
    origin_x: int,
    origin_y: int,
    rows: list[list[str]],
    other: list[list[str]],
    aligns: list[str],
    widths: list[int],
    heights: list[int],
    font: ImageFont.FreeTypeFont,
) -> int:
    line_height = CELL_FONT_SIZE + 6
    y = origin_y
    for row_index, row in enumerate(rows):
        x = origin_x
        height = heights[row_index]
        for column, cell in enumerate(row):
            width = widths[column]
            other_cell = other[row_index][column] if row_index < len(other) and column < len(other[row_index]) else None
            differs = other_cell is not None and cell != other_cell
            if row_index == 0 and not differs:
                fill = HEADER_BG
            elif differs:
                fill = YELLOW
            else:
                fill = BODY_BG
            draw.rectangle((x, y, x + width, y + height), fill=fill, outline=GRID)
            wrapped = wrap_text(font, cell, width - CELL_PAD_X * 2)
            text_block = len(wrapped) * line_height
            text_y = y + (height - text_block) / 2
            for line in wrapped:
                line_w = text_width(font, line)
                if aligns[column] == "right":
                    text_x = x + width - CELL_PAD_X - line_w
                elif aligns[column] == "center":
                    text_x = x + (width - line_w) / 2
                else:
                    text_x = x + CELL_PAD_X
                draw.text((text_x, text_y), line, font=font, fill=TEXT)
                text_y += line_height
            x += width
        y += height
    return y


def differing_cells(title: str, rows: list[list[str]], other: list[list[str]]) -> list[str]:
    notes: list[str] = []
    for row_index, row in enumerate(rows):
        for column, cell in enumerate(row):
            other_cell = other[row_index][column]
            if cell != other_cell:
                notes.append(f"  {title} r{row_index} c{column}: {cell!r} != {other_cell!r}")
    return notes


def render_one(
    sha: str,
    generated_at: str,
    monthly_title: str,
    monthly: list[list[str]],
    monthly_aligns: list[str],
    monthly_widths: list[int],
    monthly_heights: list[int],
    other_monthly: list[list[str]],
    sensitivity_title: str,
    sensitivity: list[list[str]],
    sensitivity_aligns: list[str],
    sensitivity_widths: list[int],
    sensitivity_heights: list[int],
    other_sensitivity: list[list[str]],
    out_path: Path,
) -> None:
    cell_font = load_font(CELL_FONT_SIZE)
    header_font = load_font(HEADER_FONT_SIZE)
    section_font = load_font(SECTION_FONT_SIZE)
    label_font = load_font(LABEL_FONT_SIZE)
    table_width = max(sum(monthly_widths), sum(sensitivity_widths))
    image_width = MARGIN * 2 + table_width
    banner_lines = [
        (label_font, "git rev-parse HEAD"),
        (header_font, sha),
        (label_font, "date -u"),
        (header_font, generated_at),
        (label_font, "黄色のセルは相手の表と値が違う"),
    ]
    banner_height = 16
    for font, _text in banner_lines:
        banner_height += font.size + 8
    banner_height += 8
    section_gap = 18
    section_title_h = SECTION_FONT_SIZE + 16
    image_height = (
        MARGIN
        + banner_height
        + section_gap
        + section_title_h
        + sum(monthly_heights)
        + section_gap
        + section_title_h
        + sum(sensitivity_heights)
        + MARGIN
    )
    image = Image.new("RGB", (image_width, image_height), BODY_BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, image_width, banner_height), fill=BANNER_BG)
    y = 12
    for font, text in banner_lines:
        draw.text((MARGIN, y), text, font=font, fill=BANNER_TEXT)
        y += font.size + 8
    y = banner_height + section_gap
    draw.text((MARGIN, y), monthly_title, font=section_font, fill=TEXT)
    y += section_title_h
    y = draw_table(
        draw, MARGIN, y, monthly, other_monthly, monthly_aligns, monthly_widths, monthly_heights, cell_font
    )
    y += section_gap
    draw.text((MARGIN, y), sensitivity_title, font=section_font, fill=MUTED)
    y += section_title_h
    draw_table(
        draw,
        MARGIN,
        y,
        sensitivity,
        other_sensitivity,
        sensitivity_aligns,
        sensitivity_widths,
        sensitivity_heights,
        cell_font,
    )
    image.save(out_path, format="PNG")


def main() -> None:
    before_md = (HERE / "projection-before.md").read_text()
    after_md = (HERE / "projection-after.md").read_text()
    before_sha, before_at = read_header(HERE / "generate-before.log")
    after_sha, after_at = read_header(HERE / "generate-after.log")
    before_monthly_title, before_monthly, monthly_aligns = monthly_table(before_md)
    after_monthly_title, after_monthly, _after_monthly_aligns = monthly_table(after_md)
    before_sens_title, before_sens, sens_aligns = normal_sensitivity_table(before_md)
    after_sens_title, after_sens, _after_sens_aligns = normal_sensitivity_table(after_md)
    cell_font = load_font(CELL_FONT_SIZE)
    monthly_widths = column_widths(before_monthly, after_monthly, cell_font)
    sens_widths = column_widths(before_sens, after_sens, cell_font)
    before_monthly_heights = row_heights(before_monthly, monthly_widths, cell_font)
    after_monthly_heights = row_heights(after_monthly, monthly_widths, cell_font)
    monthly_heights = [max(a, b) for a, b in zip(before_monthly_heights, after_monthly_heights, strict=True)]
    before_sens_heights = row_heights(before_sens, sens_widths, cell_font)
    after_sens_heights = row_heights(after_sens, sens_widths, cell_font)
    sens_heights = [max(a, b) for a, b in zip(before_sens_heights, after_sens_heights, strict=True)]

    before_png = HERE / "projection-before.png"
    after_png = HERE / "projection-after.png"
    render_one(
        before_sha,
        before_at,
        before_monthly_title,
        before_monthly,
        monthly_aligns,
        monthly_widths,
        monthly_heights,
        after_monthly,
        before_sens_title,
        before_sens,
        sens_aligns,
        sens_widths,
        sens_heights,
        after_sens,
        before_png,
    )
    render_one(
        after_sha,
        after_at,
        after_monthly_title,
        after_monthly,
        monthly_aligns,
        monthly_widths,
        monthly_heights,
        before_monthly,
        after_sens_title,
        after_sens,
        sens_aligns,
        sens_widths,
        sens_heights,
        before_sens,
        after_png,
    )
    notes = differing_cells("月間モデル", before_monthly, after_monthly)
    notes += differing_cells("感度分析 normal", before_sens, after_sens)
    print(f"before rev-parse: {before_sha}")
    print(f"before date -u: {before_at}")
    print(f"after rev-parse: {after_sha}")
    print(f"after date -u: {after_at}")
    print(f"wrote {before_png.name} bytes={before_png.stat().st_size}")
    print(f"wrote {after_png.name} bytes={after_png.stat().st_size}")
    print(f"yellow cells: {len(notes)}")
    print("\n".join(notes))


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
