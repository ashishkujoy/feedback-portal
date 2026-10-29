import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import type { ManageBatchesDeps } from './modules/cohort/application/manage-batches.ts';
import { batchesRoutes } from './modules/cohort/http/batches.routes.ts';
import { type AuthRoutesDeps, authRoutes } from './modules/identity/http/auth.routes.ts';
import type { UserAdminTransaction } from './modules/identity/application/user-admin.ts';
import type { ManageFeedbackDeps } from './modules/feedback/application/manage-feedback.ts';
import { overviewRoutes } from './modules/intern/http/overview.routes.ts';
import { commentRoutes } from './modules/feedback/http/comment.routes.ts';
import { conversationRoutes } from './modules/feedback/http/conversation.routes.ts';
import { feedbackRoutes } from './modules/feedback/http/feedback.routes.ts';
import type { ManageInternsDeps } from './modules/intern/application/manage-interns.ts';
import { importsRoutes } from './modules/intern/http/imports.routes.ts';
import { internsRoutes } from './modules/intern/http/interns.routes.ts';
import { meRoutes } from './modules/identity/http/me.routes.ts';
import { usersRoutes } from './modules/identity/http/users.routes.ts';
import type { AppEnv } from './shared/http/app-env.ts';
import { errorHandler, notFoundHandler } from './shared/http/error-handler.ts';
import { type HealthDeps, healthRoutes } from './shared/http/health.routes.ts';
import { requestLogger } from './shared/http/request-logger.ts';
import { type SettingsDeps, settingsRoutes } from './shared/http/settings.routes.ts';
import { traceRoute } from './shared/http/trace-route.ts';

/** Everything the routes need from the outside world; built in `main.ts`, faked in tests. */
export type AppDeps = HealthDeps &
  SettingsDeps &
  Readonly<{
    auth: AuthRoutesDeps;
    userAdmin: UserAdminTransaction;
    manageBatches: ManageBatchesDeps;
    manageInterns: ManageInternsDeps;
    manageFeedback: ManageFeedbackDeps;
  }>;

/** Shared middleware and error handling; routes are mounted by `createApp` (and tests). */
export const createBaseApp = (): Hono<AppEnv> =>
  new Hono<AppEnv>()
    .use(requestLogger(), traceRoute())
    .onError(errorHandler)
    .notFound(notFoundHandler);

/** Builds the HTTP app without binding a port, so tests can call `app.request()`. */
export const createApp = (deps: AppDeps): Hono<AppEnv> =>
  createBaseApp()
    // Form-style or bodyless writes must come from the web app (SameSite=Lax is the first layer).
    .use(csrf({ origin: deps.auth.webAppUrl }))
    .route('/health', healthRoutes(deps))
    .route('/settings', settingsRoutes(deps))
    .route('/auth', authRoutes(deps.auth))
    .route('/me', meRoutes(deps.auth))
    .route('/users', usersRoutes({ ...deps.auth, userAdmin: deps.userAdmin }))
    // Before `/batches`: a request answered here never reaches that router's middleware, so the
    // session is checked once.
    .route(
      '/batches/:batchId/imports',
      importsRoutes({ ...deps.auth, manageInterns: deps.manageInterns }),
    )
    .route(
      '/batches/:batchId/interns/:internId/feedback',
      feedbackRoutes({ ...deps.auth, manageFeedback: deps.manageFeedback }),
    )
    .route(
      '/batches/:batchId/interns/:internId/conversations',
      conversationRoutes({ ...deps.auth, manageFeedback: deps.manageFeedback }),
    )
    .route(
      '/batches/:batchId/interns/:internId/comments',
      commentRoutes({ ...deps.auth, manageFeedback: deps.manageFeedback }),
    )
    .route(
      '/batches/:batchId/overview',
      overviewRoutes({ ...deps.auth, manageInterns: deps.manageInterns }),
    )
    .route(
      '/batches/:batchId/interns',
      internsRoutes({ ...deps.auth, manageInterns: deps.manageInterns }),
    )
    .route('/batches', batchesRoutes({ ...deps.auth, manageBatches: deps.manageBatches }));
