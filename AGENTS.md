# Agent Instructions

## Before Starting Work

- Always fetch the latest `main` branch before beginning any work:

  ```bash
  git fetch origin main
  ```

- When creating a working branch, base it on the freshly fetched `origin/main`.

## Production Sign-In Verification

- When validating sign-in, use the environment-provided secrets:
  - `ENGLISH_NAVY_TEST_EMAIL`
  - `ENGLISH_NAVY_TEST_PASSWORD`
  - `ENGLISH_NAVY_PRODUCTION_URL`
- Do not print, log, commit, or otherwise expose secret values.
- Verify the sign-in flow against `ENGLISH_NAVY_PRODUCTION_URL` before reporting completion when the task touches authentication or deployment behavior.
