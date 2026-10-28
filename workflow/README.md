# Workflow

We work on **one task at a time**. Each task has its own folder under `workflow/phase/<phase>/<task>/` containing three files:

| File | Written by | When | Purpose |
|---|---|---|---|
| `PLAN.md` | Claude | Before any code | Scope, out of scope, steps, verification |
| `REVIEW.md` | Claude | After implementation | What changed, how to verify, decisions, deviations from the plan |
| `FINDINGS.md` | Reviewer (with Claude logging the resolutions) | During review | Feedback items and how each was resolved |

## Task lifecycle

```
Not started → Planning → Plan approved → In progress → In review → Done
                  ↑______ feedback ______↓        ↑____ findings ____↓
```

1. **Planning:** Claude writes `PLAN.md`. The reviewer approves it or gives feedback.
2. **In progress:** Claude implements only what the approved plan covers.
3. **In review:** Claude writes `REVIEW.md`. The reviewer records feedback in `FINDINGS.md` (or in chat, and Claude logs it there).
4. **Done:** every finding is resolved, the reviewer approves, and the work is committed.

Update the status in both `PLAN.md` and the board below whenever it changes.

## Status board

### Phase 0 — Foundation

| Task | Folder | Status |
|---|---|---|
| 0.1 Git + monorepo skeleton | [`phase/00-foundation/01-git-monorepo-skeleton`](phase/00-foundation/01-git-monorepo-skeleton/PLAN.md) | Done |
| 0.2 Shared TS config | [`phase/00-foundation/02-shared-ts-config`](phase/00-foundation/02-shared-ts-config/PLAN.md) | Done |
| 0.3 Lint + format | [`phase/00-foundation/03-lint-format`](phase/00-foundation/03-lint-format/PLAN.md) | Done |
| 0.4 Contracts package | [`phase/00-foundation/04-contracts-package`](phase/00-foundation/04-contracts-package/PLAN.md) | Done |

### Phase 1 — Backend skeleton

| Task | Folder | Status |
|---|---|---|
| 1.1 Hono app | [`phase/01-backend-skeleton/01-hono-app`](phase/01-backend-skeleton/01-hono-app/PLAN.md) | Done |
| 1.2 Config | [`phase/01-backend-skeleton/02-config`](phase/01-backend-skeleton/02-config/PLAN.md) | Done |
| 1.3 Logging | [`phase/01-backend-skeleton/03-logging`](phase/01-backend-skeleton/03-logging/PLAN.md) | Done |
| 1.4 Error handling | [`phase/01-backend-skeleton/04-error-handling`](phase/01-backend-skeleton/04-error-handling/PLAN.md) | Done |
| 1.5 Postgres + Drizzle | [`phase/01-backend-skeleton/05-postgres-drizzle`](phase/01-backend-skeleton/05-postgres-drizzle/PLAN.md) | Done |
| 1.6 Testcontainers harness | [`phase/01-backend-skeleton/06-testcontainers-harness`](phase/01-backend-skeleton/06-testcontainers-harness/PLAN.md) | Done |

### Phase 2 — Docker & observability

| Task | Folder | Status |
|---|---|---|
| 2.1 Compose: postgres + api | [`phase/02-docker-observability/01-compose-postgres-api`](phase/02-docker-observability/01-compose-postgres-api/PLAN.md) | Done |
| 2.2 OpenTelemetry (api) | [`phase/02-docker-observability/02-opentelemetry-api`](phase/02-docker-observability/02-opentelemetry-api/PLAN.md) | Done |
| 2.3 Grafana LGTM in Compose | [`phase/02-docker-observability/03-grafana-lgtm-in-compose`](phase/02-docker-observability/03-grafana-lgtm-in-compose/PLAN.md) | Done |

### Phase 3 — Identity (users, roles, login)

| Task | Folder | Status |
|---|---|---|
| 3.1 Schema | [`phase/03-identity-users-roles-login/01-schema`](phase/03-identity-users-roles-login/01-schema/PLAN.md) | Done |
| 3.2 User domain | [`phase/03-identity-users-roles-login/02-user-domain`](phase/03-identity-users-roles-login/02-user-domain/PLAN.md) | Done |
| 3.3 User repository | [`phase/03-identity-users-roles-login/03-user-repository`](phase/03-identity-users-roles-login/03-user-repository/PLAN.md) | Done |
| 3.4 Bootstrap admin | [`phase/03-identity-users-roles-login/04-bootstrap-admin`](phase/03-identity-users-roles-login/04-bootstrap-admin/PLAN.md) | Done |
| 3.5 Sessions | [`phase/03-identity-users-roles-login/05-sessions`](phase/03-identity-users-roles-login/05-sessions/PLAN.md) | Done |
| 3.6 Google OAuth | [`phase/03-identity-users-roles-login/06-google-oauth`](phase/03-identity-users-roles-login/06-google-oauth/PLAN.md) | Done |
| 3.7 Auth middleware + `GET /me` | [`phase/03-identity-users-roles-login/07-auth-middleware-get-me`](phase/03-identity-users-roles-login/07-auth-middleware-get-me/PLAN.md) | Done |
| 3.8 Admin user management API | [`phase/03-identity-users-roles-login/08-admin-user-management-api`](phase/03-identity-users-roles-login/08-admin-user-management-api/PLAN.md) | Done |
| 3.9 Replace Arctic | [`phase/03-identity-users-roles-login/09-replace-arctic`](phase/03-identity-users-roles-login/09-replace-arctic/PLAN.md) | Done |

### Phase 4 — Frontend skeleton

| Task | Folder | Status |
|---|---|---|
| 4.1 Vite + React + Tailwind v4 | [`phase/04-frontend-skeleton/01-vite-react-tailwind-v4`](phase/04-frontend-skeleton/01-vite-react-tailwind-v4/PLAN.md) | Done |
| 4.2 Router + Query | [`phase/04-frontend-skeleton/02-router-query`](phase/04-frontend-skeleton/02-router-query/PLAN.md) | Done |
| 4.3 API client | [`phase/04-frontend-skeleton/03-api-client`](phase/04-frontend-skeleton/03-api-client/PLAN.md) | Done |
| 4.4 Login flow | [`phase/04-frontend-skeleton/04-login-flow`](phase/04-frontend-skeleton/04-login-flow/PLAN.md) | Done |
| 4.5 Branding | [`phase/04-frontend-skeleton/05-branding`](phase/04-frontend-skeleton/05-branding/PLAN.md) | Done |
| 4.6 Web in Compose + OTel web | [`phase/04-frontend-skeleton/06-web-in-compose-otel-web`](phase/04-frontend-skeleton/06-web-in-compose-otel-web/PLAN.md) | Done |

### Phase 5 — Admin: users

| Task | Folder | Status |
|---|---|---|
| 5.1 Users list page | [`phase/05-admin-users/01-users-list-page`](phase/05-admin-users/01-users-list-page/PLAN.md) | Done |
| 5.2 Add user form | [`phase/05-admin-users/02-add-user-form`](phase/05-admin-users/02-add-user-form/PLAN.md) | Done |
| 5.3 Edit roles and deactivate | [`phase/05-admin-users/03-edit-roles-and-deactivate`](phase/05-admin-users/03-edit-roles-and-deactivate/PLAN.md) | Done |

### Phase 6 — Batches (cohort)

| Task | Folder | Status |
|---|---|---|
| 6.1 Schema | [`phase/06-batches-cohort/01-schema`](phase/06-batches-cohort/01-schema/PLAN.md) | Done |
| 6.2 Batch domain | [`phase/06-batches-cohort/02-batch-domain`](phase/06-batches-cohort/02-batch-domain/PLAN.md) | Done |
| 6.3 Batch API | [`phase/06-batches-cohort/03-batch-api`](phase/06-batches-cohort/03-batch-api/PLAN.md) | Done |
| 6.4 Visibility scope | [`phase/06-batches-cohort/04-visibility-scope`](phase/06-batches-cohort/04-visibility-scope/PLAN.md) | Done |
| 6.5 Batches UI | [`phase/06-batches-cohort/05-batches-ui`](phase/06-batches-cohort/05-batches-ui/PLAN.md) | Done |
| 6.6 Assign/unassign UI | [`phase/06-batches-cohort/06-assign-unassign-ui`](phase/06-batches-cohort/06-assign-unassign-ui/PLAN.md) | Done |

### Phase 7 — Interns

| Task | Folder | Status |
|---|---|---|
| 7.1 Schema | [`phase/07-interns/01-schema`](phase/07-interns/01-schema/PLAN.md) | Done |
| 7.2 Intern domain | [`phase/07-interns/02-intern-domain`](phase/07-interns/02-intern-domain/PLAN.md) | Done |
| 7.3 Manual add intern API + UI | [`phase/07-interns/03-manual-add-intern-api-ui`](phase/07-interns/03-manual-add-intern-api-ui/PLAN.md) | Done |
| 7.4 Batch roster UI | [`phase/07-interns/04-batch-roster-ui`](phase/07-interns/04-batch-roster-ui/PLAN.md) | Done |
| 7.5 Intern profile page | [`phase/07-interns/05-intern-profile-page`](phase/07-interns/05-intern-profile-page/PLAN.md) | Done |
| 7.6 Status change API + UI | [`phase/07-interns/06-status-change-api-ui`](phase/07-interns/06-status-change-api-ui/PLAN.md) | Done |
| 7.7 Cloudinary photos | [`phase/07-interns/07-cloudinary-photos`](phase/07-interns/07-cloudinary-photos/PLAN.md) | Done |
| 7.8 Batch card counts | [`phase/07-interns/08-batch-card-counts`](phase/07-interns/08-batch-card-counts/PLAN.md) | Done |
| 7.9 Edit intern details | [`phase/07-interns/09-edit-intern-details`](phase/07-interns/09-edit-intern-details/PLAN.md) | Done |

### Phase 8 — Airtable import

| Task | Folder | Status |
|---|---|---|
| 8.1 Airtable adapter | [`phase/08-airtable-import/01-airtable-adapter`](phase/08-airtable-import/01-airtable-adapter/PLAN.md) | Done |
| 8.2 Field mapping | [`phase/08-airtable-import/02-field-mapping`](phase/08-airtable-import/02-field-mapping/PLAN.md) | Done |
| 8.3 Import preview API | [`phase/08-airtable-import/03-import-preview-api`](phase/08-airtable-import/03-import-preview-api/PLAN.md) | Done |
| 8.4 Import commit API | [`phase/08-airtable-import/04-import-commit-api`](phase/08-airtable-import/04-import-commit-api/PLAN.md) | Done |
| 8.5 Import UI | [`phase/08-airtable-import/05-import-ui`](phase/08-airtable-import/05-import-ui/PLAN.md) | Done |
| 8.6 Field mapping per batch | [`phase/08-airtable-import/06-field-mapping-per-batch`](phase/08-airtable-import/06-field-mapping-per-batch/PLAN.md) | Done |

### Phase 9 — Feedback

| Task | Folder | Status |
|---|---|---|
| 9.1 Schema | [`phase/09-feedback/01-schema`](phase/09-feedback/01-schema/PLAN.md) | Done |
| 9.2 Feedback domain | [`phase/09-feedback/02-feedback-domain`](phase/09-feedback/02-feedback-domain/PLAN.md) | Done |
| 9.3 Feedback API | [`phase/09-feedback/03-feedback-api`](phase/09-feedback/03-feedback-api/PLAN.md) | Done |
| 9.4 Markdown components | [`phase/09-feedback/04-markdown-components`](phase/09-feedback/04-markdown-components/PLAN.md) | Done |
| 9.5 Write feedback UI | [`phase/09-feedback/05-write-feedback-ui`](phase/09-feedback/05-write-feedback-ui/PLAN.md) | Done |
| 9.6 Feedback on intern timeline | [`phase/09-feedback/06-feedback-on-intern-timeline`](phase/09-feedback/06-feedback-on-intern-timeline/PLAN.md) | Done |
| 9.7 Color code history | [`phase/09-feedback/07-color-code-history`](phase/09-feedback/07-color-code-history/PLAN.md) | Done |
| 9.8 Edit submitted feedback | [`phase/09-feedback/08-edit-submitted-feedback`](phase/09-feedback/08-edit-submitted-feedback/PLAN.md) | Done |

### Phase 10 — Conversations & comments

| Task | Folder | Status |
|---|---|---|
| 10.1 Schema | [`phase/10-conversations-comments/01-schema`](phase/10-conversations-comments/01-schema/PLAN.md) | Done |
| 10.2 Conversation domain | [`phase/10-conversations-comments/02-conversation-domain`](phase/10-conversations-comments/02-conversation-domain/PLAN.md) | Done |
| 10.3 Conversation API + UI | [`phase/10-conversations-comments/03-conversation-api-ui`](phase/10-conversations-comments/03-conversation-api-ui/PLAN.md) | Done |
| 10.4 Comments API | [`phase/10-conversations-comments/04-comments-api`](phase/10-conversations-comments/04-comments-api/PLAN.md) | Done |
| 10.5 Comments UI | [`phase/10-conversations-comments/05-comments-ui`](phase/10-conversations-comments/05-comments-ui/PLAN.md) | Done |
| 10.6 Unified intern timeline | [`phase/10-conversations-comments/06-unified-intern-timeline`](phase/10-conversations-comments/06-unified-intern-timeline/PLAN.md) | Done |

### Phase 11 — Dashboards & polish

| Task | Folder | Status |
|---|---|---|
| 11.1 Batch dashboard | [`phase/11-dashboards-polish/01-batch-dashboard`](phase/11-dashboards-polish/01-batch-dashboard/PLAN.md) | Not started |
| 11.2 "My pending" view | [`phase/11-dashboards-polish/02-my-pending-view`](phase/11-dashboards-polish/02-my-pending-view/PLAN.md) | Not started |
| 11.3 Playwright E2E | [`phase/11-dashboards-polish/03-playwright-e2e`](phase/11-dashboards-polish/03-playwright-e2e/PLAN.md) | Not started |
| 11.4 Production build | [`phase/11-dashboards-polish/04-production-build`](phase/11-dashboards-polish/04-production-build/PLAN.md) | Not started |
