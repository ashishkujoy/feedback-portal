import { z } from 'zod';

export const BatchMemberRole = z.enum(['mentor', 'program_manager']);
export type BatchMemberRole = z.infer<typeof BatchMemberRole>;
