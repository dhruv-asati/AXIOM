# AI usage disclosure

AI coding assistance (OpenAI Codex) was used during AXIOM planning, implementation, debugging, testing support, and documentation. Human team members supplied requirements, selected product behavior, inspected generated changes, and ran local and integration checks.

## AI-assisted work

AI assistance contributed to the project foundation and modular backend; SQLAlchemy models and Alembic setup; dataset import, booking, timetable, and disruption workflows; API integration and tests; and React/TypeScript interface components, styling, and documentation. It also helped diagnose and refine UI behavior from user-provided screenshots and recordings. The final repository contains a mix of human-authored, AI-assisted, and iteratively edited work; individual lines are not attributed to a particular author.

AXIOM's in-app request assistant uses deterministic local parsing and rules. User request text is not sent to a hosted LLM by the application. AI used during development is separate from runtime behavior.

## Review and limitations

AI output was treated as a draft and reviewed against repository contracts, starter-pack constraints, and observed test/validator results. Review does not replace operator verification of the deployed database, role accounts, third-party license terms, or the final judge workflow. The compliance evidence and remaining checks are recorded in [docs/FINAL_SUBMISSION_AUDIT.md](docs/FINAL_SUBMISSION_AUDIT.md).
