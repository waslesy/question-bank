#!/usr/bin/env python3
"""Strict repository validator for canonical medical-question-bank v1 JSON.

No third-party packages required.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

FORMAT = "medical-question-bank"
VERSION = 1
MAX_UTF16_UNITS = 64 * 1024 * 1024
BLOCKED = {"__proto__", "constructor", "prototype"}
SUBJECT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
VALID_TYPES = {"A1", "A2", "A3", "A4", "B1"}
ANALYSIS_HEADINGS = ("本题考查", "考点还原", "全选项解析", "结论")
HEADING_RE = re.compile(r"(?m)^\s*(本题考查|考点还原|全选项解析|结论)\s*[：:]\s*")
OPTION_ANALYSIS_RE = re.compile(r"(?m)^\s*([A-E])\s*[.．、:：)）]\s*(\S.*)$")
BOILERPLATE_RE = re.compile(r"正确答案|错误答案|不符合题意|符合题意|根据相关知识(?:可知)?|本项|该项|选项|正确|错误")
REASON_PUNCTUATION_RE = re.compile(r"[\s，。！？!?、；;：:（）()\[\]【】《》“”‘’\"'.,/_—-]+")
TOP_KEYS = {"format", "version", "subjects", "questions"}
SUBJECT_KEYS = {"id", "name", "short"}
QUESTION_KEYS = {
    "id", "subjectId", "subject", "chapter", "path", "stem", "options",
    "answer", "analysis", "context", "number", "type"
}
QUESTION_REQUIRED = QUESTION_KEYS - {"subject"}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)


def utf16_units(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def nonblank(value: Any, max_len: int) -> bool:
    return isinstance(value, str) and bool(value.strip()) and len(value) <= max_len


def load_json(path: Path, report: Report) -> tuple[Any | None, str | None]:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        report.error(f"{path}: file is not valid UTF-8")
        return None, None
    except OSError as exc:
        report.error(f"{path}: cannot read file: {exc}")
        return None, None

    units = utf16_units(text)
    if units > MAX_UTF16_UNITS:
        report.error(
            f"{path}: {units} UTF-16 code units exceeds app limit {MAX_UTF16_UNITS}"
        )
    try:
        return json.loads(text), text
    except json.JSONDecodeError as exc:
        report.error(f"{path}: invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
        return None, text


def extract_bank(data: Any, report: Report, label: str, allow_full_backup: bool) -> Any | None:
    if not isinstance(data, dict):
        report.error(f"{label}: top level must be an object")
        return None
    if data.get("format") == FORMAT:
        return data
    if allow_full_backup and data.get("format") == "question-bank-data-exchange" and data.get("schemaVersion") == 1:
        payload = data.get("payload")
        if not isinstance(payload, dict):
            report.error(f"{label}: data-exchange file has no valid payload object")
            return None
        if data.get("exportType") == "question_bank":
            return {"format": FORMAT, "version": VERSION, **payload}
        if data.get("exportType") == "full_backup" and isinstance(payload.get("questionBank"), dict):
            return {"format": FORMAT, "version": VERSION, **payload["questionBank"]}
        report.error(f"{label}: data-exchange exportType must be question_bank or full_backup")
        return None
    if allow_full_backup and data.get("format") == "medical-question-data" and data.get("version") == 1:
        bank = data.get("bank")
        if not isinstance(bank, dict):
            report.error(f"{label}: medical-question-data v1 has no valid bank object")
            return None
        return bank
    expected = f"{FORMAT} v{VERSION}"
    if allow_full_backup:
        expected += " or medical-question-data v1"
    report.error(f"{label}: unsupported format; expected {expected}")
    return None


def question_location(label: str, index: int, question: dict[str, Any]) -> str:
    chapter = question.get("chapter")
    qid = question.get("id")
    return f"{label}.questions[{index}] (chapter={chapter!r}, id={qid!r})"


def validate_analysis(value: Any, options: list[Any], where: str, report: Report) -> None:
    if not isinstance(value, str) or not value.strip():
        report.error(f"{where}.analysis: must be non-empty")
        return

    matches = list(HEADING_RE.finditer(value))
    positions: dict[str, list[int]] = {heading: [] for heading in ANALYSIS_HEADINGS}
    for match in matches:
        positions[match.group(1)].append(match.start())

    for heading in ANALYSIS_HEADINGS:
        if not positions[heading]:
            report.error(f"{where}.analysis: missing section {heading!r}")
        elif len(positions[heading]) > 1:
            report.error(f"{where}.analysis: duplicate section {heading!r}")

    if not all(positions[heading] for heading in ANALYSIS_HEADINGS):
        return
    first_positions = [positions[heading][0] for heading in ANALYSIS_HEADINGS]
    if first_positions != sorted(first_positions):
        report.error(f"{where}.analysis: sections must be ordered 本题考查 → 考点还原 → 全选项解析 → 结论")
        return

    first_matches = {match.group(1): match for match in matches if match.start() == positions[match.group(1)][0]}
    for index, heading in enumerate(ANALYSIS_HEADINGS):
        start = first_matches[heading].end()
        end = first_positions[index + 1] if index + 1 < len(ANALYSIS_HEADINGS) else len(value)
        body = value[start:end].strip()
        if not body:
            report.error(f"{where}.analysis: section {heading!r} is empty")

    option_start = first_matches["全选项解析"].end()
    option_end = first_positions[ANALYSIS_HEADINGS.index("结论")]
    option_body = value[option_start:option_end]
    parsed = {match.group(1) for match in OPTION_ANALYSIS_RE.finditer(option_body)}
    expected = {chr(65 + i) for i in range(len(options))}
    for label in sorted(expected - parsed):
        report.error(f"{where}.analysis: 全选项解析缺少选项 {label}")
    for label in sorted(parsed - expected):
        report.error(f"{where}.analysis: 全选项解析包含不存在的选项 {label}")

    def substantive_reason(body: str) -> bool:
        compact = REASON_PUNCTUATION_RE.sub("", body)
        residual = BOILERPLATE_RE.sub("", compact)
        return len(residual) >= 8

    knowledge_start = first_matches["考点还原"].end()
    knowledge_end = first_positions[ANALYSIS_HEADINGS.index("全选项解析")]
    knowledge_body = value[knowledge_start:knowledge_end].strip()
    if not substantive_reason(knowledge_body):
        report.error(f"{where}.analysis: section '考点还原' must contain substantive medical rationale, not boilerplate-only text")

    option_matches = {match.group(1): match.group(2).strip() for match in OPTION_ANALYSIS_RE.finditer(option_body)}
    for label in sorted(expected & set(option_matches)):
        if not substantive_reason(option_matches[label]):
            report.error(f"{where}.analysis: option {label} explanation must contain a substantive reason, not only correct/incorrect boilerplate")


def validate_bank(bank: Any, report: Report, label: str = "bank", allow_empty: bool = False) -> dict[str, Any] | None:
    if not isinstance(bank, dict):
        report.error(f"{label}: bank must be an object")
        return None

    extra = set(bank) - TOP_KEYS
    missing = TOP_KEYS - set(bank)
    if extra:
        report.error(f"{label}: unknown top-level fields: {', '.join(sorted(extra))}")
    if missing:
        report.error(f"{label}: missing top-level fields: {', '.join(sorted(missing))}")

    if bank.get("format") != FORMAT:
        report.error(f"{label}.format must be {FORMAT!r}")
    if bank.get("version") != VERSION:
        report.error(f"{label}.version must be {VERSION}")

    subjects_raw = bank.get("subjects")
    questions_raw = bank.get("questions")
    if not isinstance(subjects_raw, list) or (not allow_empty and not subjects_raw):
        report.error(f"{label}.subjects must be {'an array' if allow_empty else 'a non-empty array'}")
        subjects_raw = []
    if not isinstance(questions_raw, list) or (not allow_empty and not questions_raw):
        report.error(f"{label}.questions must be {'an array' if allow_empty else 'a non-empty array'}")
        questions_raw = []

    subjects: dict[str, dict[str, str]] = {}
    subject_names: dict[str, str] = {}

    for i, subject in enumerate(subjects_raw, 1):
        where = f"{label}.subjects[{i - 1}]"
        if not isinstance(subject, dict):
            report.error(f"{where}: must be an object")
            continue
        extra = set(subject) - SUBJECT_KEYS
        missing = SUBJECT_KEYS - set(subject)
        if extra:
            report.error(f"{where}: unknown fields: {', '.join(sorted(extra))}")
        if missing:
            report.error(f"{where}: missing fields: {', '.join(sorted(missing))}")

        sid = subject.get("id")
        name = subject.get("name")
        short = subject.get("short")
        if not isinstance(sid, str) or not SUBJECT_ID_RE.fullmatch(sid) or sid in BLOCKED:
            report.error(f"{where}.id: invalid subject ID")
        elif sid in subjects:
            report.error(f"{where}.id: duplicate subject ID {sid!r}")
        if not nonblank(name, 100):
            report.error(f"{where}.name: must be non-blank and <=100 chars")
        elif name in subject_names:
            report.error(
                f"{where}.name: duplicate subject name {name!r} also used by {subject_names[name]!r}"
            )
        if not nonblank(short, 8):
            report.error(f"{where}.short: must be non-blank and <=8 chars")

        if isinstance(sid, str) and SUBJECT_ID_RE.fullmatch(sid) and sid not in BLOCKED and sid not in subjects:
            normalized = {"id": sid, "name": name if isinstance(name, str) else "", "short": short if isinstance(short, str) else ""}
            subjects[sid] = normalized
            if isinstance(name, str) and name not in subject_names:
                subject_names[name] = sid

    ids: set[str] = set()
    canonical_questions: dict[str, dict[str, Any]] = {}

    for i, q in enumerate(questions_raw, 1):
        where = f"{label}.questions[{i - 1}]"
        if not isinstance(q, dict):
            report.error(f"{where}: must be an object")
            continue
        where = question_location(label, i - 1, q)

        extra = set(q) - QUESTION_KEYS
        missing = QUESTION_REQUIRED - set(q)
        if extra:
            report.error(f"{where}: unknown fields: {', '.join(sorted(extra))}")
        if missing:
            report.error(f"{where}: missing fields: {', '.join(sorted(missing))}")

        qid = q.get("id")
        if (
            not isinstance(qid, str)
            or not (1 <= len(qid) <= 200)
            or CONTROL_RE.search(qid)
            or qid in BLOCKED
        ):
            report.error(f"{where}.id: invalid question ID")
        elif qid in ids:
            report.error(f"{where}.id: duplicate question ID {qid!r}")
        else:
            ids.add(qid)

        sid = q.get("subjectId")
        if not isinstance(sid, str) or sid not in subjects:
            report.error(f"{where}.subjectId: unknown subject ID {sid!r}")
            subject = None
        else:
            subject = subjects[sid]

        chapter = q.get("chapter")
        if not nonblank(chapter, 200) or chapter in BLOCKED:
            report.error(f"{where}.chapter: must be non-blank, <=200 chars, and not reserved")

        path = q.get("path")
        path_ok = True
        if not isinstance(path, list) or not (2 <= len(path) <= 8):
            report.error(f"{where}.path: must contain 2-8 segments")
            path_ok = False
        else:
            for j, segment in enumerate(path):
                if not nonblank(segment, 100) or segment in BLOCKED:
                    report.error(f"{where}.path[{j}]: invalid path segment")
                    path_ok = False
            if path_ok and subject is not None and isinstance(chapter, str):
                if path[-2] != subject["name"]:
                    report.error(
                        f"{where}.path: penultimate segment must equal subject name {subject['name']!r}"
                    )
                if path[-1] != chapter:
                    report.error(f"{where}.path: final segment must exactly equal chapter {chapter!r}")

        subject_field = q.get("subject")
        if subject_field is not None:
            if not nonblank(subject_field, 100):
                report.error(f"{where}.subject: must be non-blank and <=100 chars when present")
            elif subject is not None and subject_field != subject["name"]:
                report.error(
                    f"{where}.subject: must equal referenced subject name {subject['name']!r}"
                )

        stem = q.get("stem")
        if not nonblank(stem, 20000):
            report.error(f"{where}.stem: must be non-blank and <=20000 chars")

        options = q.get("options")
        if not isinstance(options, list) or not (2 <= len(options) <= 5):
            report.error(f"{where}.options: must contain 2-5 options")
            options = []
        else:
            stripped: list[str] = []
            for j, option in enumerate(options):
                if not nonblank(option, 10000):
                    report.error(f"{where}.options[{j}]: must be non-blank and <=10000 chars")
                elif isinstance(option, str):
                    stripped.append(option.strip())
            if len(stripped) != len(set(stripped)):
                report.error(f"{where}.options: duplicate options after trimming whitespace")

        answer = q.get("answer")
        max_letter = chr(64 + len(options)) if options else None
        if not isinstance(answer, str) or len(answer) != 1 or not options or not ("A" <= answer <= max_letter):
            report.error(
                f"{where}.answer: must be one uppercase letter within the actual option range"
            )

        validate_analysis(q.get("analysis"), options, where, report)
        if not isinstance(q.get("context"), str):
            report.error(f"{where}.context: must be a string (use empty string when absent)")

        number = q.get("number")
        if not isinstance(number, int) or isinstance(number, bool) or number <= 0:
            report.error(f"{where}.number: must be a positive integer")

        qtype = q.get("type")
        if qtype not in VALID_TYPES:
            report.error(f"{where}.type: must be one of {', '.join(sorted(VALID_TYPES))}")

        if qtype in {"A3", "A4", "B1"} and isinstance(q.get("context"), str) and not q["context"].strip():
            report.warn(f"{where}: type {qtype} has empty context; verify source grouping")

        if isinstance(qid, str) and qid not in canonical_questions:
            canonical_questions[qid] = q

    return {"subjects": subjects, "questions": canonical_questions}


def compare_existing(new: dict[str, Any], existing: dict[str, Any], report: Report) -> None:
    old_subjects = existing["subjects"]
    old_questions = existing["questions"]

    for sid, subject in new["subjects"].items():
        if sid in old_subjects:
            old = old_subjects[sid]
            if subject.get("name") != old.get("name"):
                report.error(
                    f"subject ID collision {sid!r}: existing name {old.get('name')!r}, new name {subject.get('name')!r}"
                )
            if subject.get("short") and old.get("short") and subject.get("short") != old.get("short"):
                report.warn(
                    f"subject ID {sid!r}: existing short {old.get('short')!r}, new short {subject.get('short')!r}; existing app subject wins"
                )

    collisions = sorted(set(new["questions"]) & set(old_questions))
    for qid in collisions[:50]:
        report.error(f"question ID collision with existing bank: {qid!r}; app would silently skip the new question")
    if len(collisions) > 50:
        report.error(f"... and {len(collisions) - 50} more question ID collisions")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate canonical medical-question-bank v1 JSON")
    parser.add_argument("bank", type=Path, help="new medical-question-bank JSON")
    parser.add_argument(
        "--existing",
        type=Path,
        help="optional current medical-question-bank export or medical-question-data v1 backup for collision checks",
    )
    args = parser.parse_args()

    report = Report()
    raw, _ = load_json(args.bank, report)
    bank = extract_bank(raw, report, str(args.bank), allow_full_backup=False) if raw is not None else None
    validated = validate_bank(bank, report, "bank") if bank is not None else None

    if args.existing:
        existing_raw, _ = load_json(args.existing, report)
        existing_bank = (
            extract_bank(existing_raw, report, str(args.existing), allow_full_backup=True)
            if existing_raw is not None
            else None
        )
        existing_validated = validate_bank(existing_bank, report, "existing.bank", allow_empty=True) if existing_bank is not None else None
        if validated is not None and existing_validated is not None:
            compare_existing(validated, existing_validated, report)

    for warning in report.warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    for error in report.errors:
        print(f"ERROR: {error}", file=sys.stderr)

    if report.errors:
        print(f"FAIL: {len(report.errors)} error(s), {len(report.warnings)} warning(s)")
        return 1

    subject_count = len(validated["subjects"]) if validated else 0
    question_count = len(validated["questions"]) if validated else 0
    print(
        f"PASS: canonical medical-question-bank v1; "
        f"{subject_count} subject(s), {question_count} question(s), {len(report.warnings)} warning(s)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
