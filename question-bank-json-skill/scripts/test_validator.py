#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

# Test the canonical Validator in this Skill directory.

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_question_bank as validator

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
VALIDATOR = HERE / "validate_question_bank.py"
EXAMPLE = SKILL / "assets" / "example.medical-question-bank.json"
SCHEMA = SKILL / "assets" / "medical-question-bank-v1.schema.json"


def run(path: Path, *extra: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(VALIDATOR), str(path), *extra],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def validate_data(data: dict, *extra: str) -> subprocess.CompletedProcess[str]:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "bank.json"
        path.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
        return run(path, *extra)


def assert_invalid(data: dict, *messages: str) -> None:
    result = validate_data(data)
    assert result.returncode == 1, result.stdout + result.stderr
    for message in messages:
        assert message in result.stderr, result.stderr


def main() -> int:
    example = json.loads(EXAMPLE.read_text("utf-8"))
    schema = json.loads(SCHEMA.read_text("utf-8"))
    assert schema["$defs"]["question"]["properties"]["analysis"]["minLength"] == 1
    assert validator.MAX_UTF16_UNITS == 64 * 1024 * 1024

    good = run(EXAMPLE)
    assert good.returncode == 0, good.stdout + good.stderr

    data = copy.deepcopy(example)
    data["questions"][0]["answer"] = "E"
    assert_invalid(data, "actual option range", "chapter='第七章 超敏反应'", "id='immunology-school-q0001'")

    data = copy.deepcopy(example)
    data["questions"][0]["path"] = ["基础医学执业医师考试辅导题目汇总", "免疫学"]
    assert_invalid(data, "final segment", "id='immunology-school-q0001'")

    data = copy.deepcopy(example)
    data["questions"][0]["analysis"] = ""
    assert_invalid(data, "analysis: must be non-empty")

    for heading in ("本题考查", "考点还原", "全选项解析", "结论"):
        data = copy.deepcopy(example)
        data["questions"][0]["analysis"] = data["questions"][0]["analysis"].replace(heading, "已移除", 1)
        assert_invalid(data, f"missing section '{heading}'")

    data = copy.deepcopy(example)
    data["questions"][0]["analysis"] = data["questions"][0]["analysis"].replace("D. 细胞毒性", "未标注. 细胞毒性")
    assert_invalid(data, "全选项解析缺少选项 D")

    data = copy.deepcopy(example)
    data["questions"][0]["analysis"] = data["questions"][0]["analysis"].replace("结论：", "E. 不存在的第五选项。\n结论：")
    assert_invalid(data, "全选项解析包含不存在的选项 E")

    data = copy.deepcopy(example)
    analysis = data["questions"][0]["analysis"]
    data["questions"][0]["analysis"] = analysis.replace("本题考查：Ⅰ型超敏反应的主要介导抗体。\n", "") + "\n本题考查：移到末尾。"
    assert_invalid(data, "sections must be ordered")

    data = copy.deepcopy(example)
    data["questions"][0]["analysis"] = data["questions"][0]["analysis"].replace(
        "考点还原：Ⅰ型超敏反应属于速发型超敏反应，主要由特异性IgE与肥大细胞、嗜碱性粒细胞参与。",
        "考点还原：根据相关知识。"
    )
    assert_invalid(data, "section '考点还原' must contain substantive medical rationale")

    for phrase in ("正确", "错误", "不符合题意", "根据相关知识"):
        data = copy.deepcopy(example)
        data["questions"][0]["analysis"] = data["questions"][0]["analysis"].replace("A. IgE是Ⅰ型超敏反应的主要介导抗体，符合题意。", f"A. {phrase}")
        assert_invalid(data, "option A explanation must contain a substantive reason")

    data = copy.deepcopy(example)
    data["questions"].append(copy.deepcopy(data["questions"][0]))
    assert_invalid(data, "duplicate question ID", "chapter='第七章 超敏反应'")

    with tempfile.TemporaryDirectory() as directory:
        current = Path(directory) / "current-export.json"
        current.write_text(json.dumps({
            "format": "question-bank-data-exchange",
            "schemaVersion": 1,
            "exportType": "question_bank",
            "appVersion": "1.0.2",
            "exportedAt": "2026-01-01T00:00:00.000Z",
            "payload": {"subjects": [], "questions": []}
        }, ensure_ascii=False), "utf-8")
        result = run(EXAMPLE, "--existing", str(current))
        assert result.returncode == 0, result.stdout + result.stderr

        current.write_text(json.dumps({
            "format": "question-bank-data-exchange",
            "schemaVersion": 1,
            "exportType": "full_backup",
            "payload": {"questionBank": {"subjects": example["subjects"], "questions": example["questions"]}}
        }, ensure_ascii=False), "utf-8")
        collision = run(EXAMPLE, "--existing", str(current))
        assert collision.returncode == 1
        assert "question ID collision" in collision.stderr

    print("PASS: validator self-tests")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
