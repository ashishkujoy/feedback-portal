/** Hono environment shared by every route and middleware. */
export type AppEnv = {
  Variables: {
    /** Set by `requestLogger`; echoed in `x-request-id` and in problem responses. */
    requestId: string;
  };
};
