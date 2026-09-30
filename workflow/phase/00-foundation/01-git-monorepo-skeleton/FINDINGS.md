# 0.1 Git + monorepo skeleton — Findings

_Reviewer feedback and how each item was resolved._

| # | Finding | Resolution | Status |
|---|---|---|---|
| F1 | (Raised after approval, 2026-09-30) Never hard-code the program or org name ("STEP", "Thoughtworks") in code, and never use them in file or folder names. Names must come from config. | Root package renamed `step-feedback-portal` → `feedback-portal`. Doc titles made neutral. `PROGRAM_NAME`/`ORG_NAME` made required env vars with no defaults (TECH_STACK §6). `app_settings` table dropped (DATA_MODEL), and roadmap 4.5 now reads branding from config. Shipped with the 0.2 commit. | Resolved |
