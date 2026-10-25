import {
  ImportColumns,
  ImportPreview,
  ImportRequest,
  ImportResult,
  ImportSourceRequest,
} from '@feedback-portal/contracts';
import { getLogger } from '@logtape/logtape';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../../../shared/http/validate.ts';
import { rootCategory } from '../../../shared/logging/logging.ts';
import { BatchId } from '../../cohort/domain/batch-id.ts';
import { hasRole } from '../../identity/domain/user.ts';
import type { AuthEnv } from '../../identity/http/auth-env.ts';
import { type AuthenticateDeps, authenticate } from '../../identity/http/authenticate.ts';
import { requireRole } from '../../identity/http/require-role.ts';
import {
  type Actor,
  importInterns,
  listImportColumns,
  type ManageInternsDeps,
  previewInternImport,
} from '../application/manage-interns.ts';
import { asProblem } from './airtable-problems.ts';

export type ImportsRoutesDeps = AuthenticateDeps & Readonly<{ manageInterns: ManageInternsDeps }>;

const BatchParams = z.object({ batchId: BatchId });

const logger = getLogger([rootCategory, 'imports']);

const actorOf = (c: Context<AuthEnv>): Actor => {
  const user = c.var.currentUser;
  return { id: user.id, isAdmin: hasRole(user, 'admin') };
};

/**
 * A batch's Airtable imports, mounted at `/batches/:batchId/imports`, for its managers (checked
 * by the use case). The token arrives in the body and is never stored or logged; logs carry ids
 * and counts only.
 */
export const importsRoutes = ({ manageInterns, ...auth }: ImportsRoutesDeps) =>
  new Hono<AuthEnv>()
    .use(authenticate(auth))
    .post(
      '/columns',
      requireRole('admin', 'program_manager'),
      validate('param', BatchParams),
      validate('json', ImportSourceRequest),
      async (c) => {
        const actor = actorOf(c);
        const { batchId } = c.req.valid('param');
        const columns = await listImportColumns(manageInterns, {
          actor,
          batchId,
          source: c.req.valid('json'),
        }).catch((error: unknown) => {
          throw asProblem(error);
        });
        logger.info('import columns read', {
          actorId: actor.id,
          batchId,
          columns: columns.columns.length,
          missing: columns.missing.length,
        });
        return c.json(ImportColumns.parse(columns));
      },
    )
    .post(
      '/preview',
      requireRole('admin', 'program_manager'),
      validate('param', BatchParams),
      validate('json', ImportRequest),
      async (c) => {
        const actor = actorOf(c);
        const { batchId } = c.req.valid('param');
        const { mapping, ...source } = c.req.valid('json');
        const preview = await previewInternImport(manageInterns, {
          actor,
          batchId,
          source,
          mapping,
        }).catch((error: unknown) => {
          throw asProblem(error);
        });
        logger.info('import previewed', { actorId: actor.id, batchId, ...preview.counts });
        return c.json(ImportPreview.parse(preview));
      },
    )
    .post(
      '/',
      requireRole('admin', 'program_manager'),
      validate('param', BatchParams),
      validate('json', ImportRequest),
      async (c) => {
        const actor = actorOf(c);
        const { batchId } = c.req.valid('param');
        const { mapping, ...source } = c.req.valid('json');
        const result = await importInterns(manageInterns, {
          actor,
          batchId,
          source,
          mapping,
        }).catch((error: unknown) => {
          throw asProblem(error);
        });
        logger.info('import completed', {
          actorId: actor.id,
          batchId,
          importId: result.importId,
          ...result.counts,
        });
        c.header('Location', `/batches/${batchId}/imports/${result.importId}`);
        return c.json(ImportResult.parse(result), 201);
      },
    );
