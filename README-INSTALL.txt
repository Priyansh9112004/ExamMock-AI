ExamMock AI - Instant Question Bank Engine v1

Replace project-root files: server.js, database.js, exam-config.js
Add: bank-engine.js, import-question-bank.js, question-bank-template.json
Do NOT delete/replace .env or data/exammock.db.

Then:
npm.cmd run check
npm.cmd start

AI generation worker is disabled.
Start Mock now assembles instantly from SQLite question_bank.
If the bank is short, API returns BANK_INSUFFICIENT instead of waiting.

Import future bank JSON:
node import-question-bank.js question-bank-ibps-clerk.json
