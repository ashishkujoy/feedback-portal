#!/bin/sh
# `pnpm e2e`: build the stack, start it, run Playwright against it, then remove it all.
# Not `up --exit-code-from`: that stops everything as soon as the one-shot migrate job exits.
compose() { docker compose -f "$(dirname "$0")/compose.yml" "$@"; }

compose build &&
  compose up --detach --wait web &&
  compose run --rm playwright
status=$?
if [ "$status" -ne 0 ]; then mkdir -p "$(dirname "$0")/test-results" && compose logs --no-color api fake-google > "$(dirname "$0")/test-results/stack.log" 2>&1; fi
compose down --volumes --remove-orphans
exit "$status"
