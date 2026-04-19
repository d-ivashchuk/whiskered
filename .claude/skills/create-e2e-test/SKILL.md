---
name: create-e2e-test
description: Create a Maestro E2E test for a flow, page, or feature.
---

1. Create `.maestro/{name}.yaml`.
2. Use `helpers/setup.yaml` for fast launch (skips onboarding if done).
3. Use `helpers/fresh-setup.yaml` if the test needs a clean slate.
4. Test the happy path end-to-end.
5. Run `npm run test:e2e:single .maestro/{name}.yaml` to verify.
