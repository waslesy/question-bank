# Repository instructions

## Product boundary

Maintain the question-bank App, its import/export tools, and repository Skills. Do not batch-author medical questions or answer explanations in this repository.

## Question-bank data contract

For every task that creates, edits, merges, reviews, imports, validates, or converts `medical-question-bank` JSON, read and follow `.agents/skills/question-bank-json/SKILL.md`.

- Do not invent another JSON shape.
- Run the validator before calling a question bank import-ready.
- Keep question content outside the App binary; a fresh install must contain zero questions.
- Never commit real user backups, signing keys, keystores, passwords, or local signing configuration.
