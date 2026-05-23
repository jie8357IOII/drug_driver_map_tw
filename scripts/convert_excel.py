#!/usr/bin/env python3
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
CITY_COLUMNS = [
    "新北市",
    "臺北市",
    "桃園市",
    "臺中市",
    "臺南市",
    "高雄市",
    "宜蘭縣",
    "新竹縣",
    "苗栗縣",
    "彰化縣",
    "南投縣",
    "雲林縣",
    "嘉義縣",
    "屏東縣",
    "臺東縣",
    "花蓮縣",
    "澎湖縣",
    "基隆市",
    "新竹市",
    "嘉義市",
    "金門縣",
    "連江縣",
]


def column_name(cell_ref):
    return re.sub(r"\d+", "", cell_ref)


def read_shared_strings(zf):
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []

    strings = []
    for item in root.findall("a:si", NS):
        strings.append("".join(text.text or "" for text in item.findall(".//a:t", NS)))
    return strings


def read_sheet_rows(zf, sheet_path, shared_strings):
    root = ET.fromstring(zf.read(sheet_path))
    rows = []

    for row in root.findall(".//a:sheetData/a:row", NS):
        values = {}
        for cell in row.findall("a:c", NS):
            ref = cell.attrib.get("r")
            value_node = cell.find("a:v", NS)
            value = "" if value_node is None else value_node.text or ""
            if cell.attrib.get("t") == "s" and value:
                value = shared_strings[int(value)]
            values[column_name(ref)] = value.strip() if isinstance(value, str) else value
        rows.append(values)

    return rows


def parse_month(label):
    match = re.match(r"^(\d{3})年\s+(\d{1,2})月$", label)
    if not match:
        return None
    year = int(match.group(1)) + 1911
    month = int(match.group(2))
    return f"{year:04d}-{month:02d}"


def parse_number(value):
    if value in ("", "-", "－", None):
        return 0
    return int(str(value).replace(",", ""))


def convert(input_path, output_path):
    with zipfile.ZipFile(input_path) as zf:
        shared_strings = read_shared_strings(zf)
        rows = read_sheet_rows(zf, "xl/worksheets/sheet1.xml", shared_strings)

    header = rows[3]
    city_by_column = {
        column: city for column, city in header.items() if city in CITY_COLUMNS
    }

    records = []
    for row in rows[4:]:
        month = parse_month(row.get("A", ""))
        if not month:
            continue

        for column, city in city_by_column.items():
            records.append(
                {
                    "month": month,
                    "city": city,
                    "suspects": parse_number(row.get(column, 0)),
                }
            )

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} records to {output}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: convert_excel.py INPUT.xlsx OUTPUT.json")
    convert(sys.argv[1], sys.argv[2])
