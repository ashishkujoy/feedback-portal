# 3.9 Replace Arctic — Plan

**Phase:** 3 — Identity (users, roles, login)
**Status:** Not started

## Goal
Replace Arctic, which npm marks as no longer supported, behind the existing `GoogleAuth` port

## Done when
The 3.6 route and adapter tests pass unchanged against the new adapter, and `arctic` is gone from the lockfile

## Carried over
- Found in 4.1: `arctic@3.7.0` and its `@oslojs/*` dependencies carry npm's "Package no longer supported. Contact Support" deprecation. The registry integrity still matches our lockfile.
- Candidates: `openid-client`, or a small hand-written PKCE + authorization-code exchange (Google's token endpoint) with the existing Zod claim checks.

## Plan
_Written before work starts, then approved by the reviewer._

### Scope

### Out of scope

### Steps

### Verification
