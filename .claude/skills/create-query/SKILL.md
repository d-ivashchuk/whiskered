---
name: create-query
description: Create a new custom hook for data fetching or derived state.
---

1. Create `lib/hooks/{name}.ts` with a named export hook.
2. Use Zustand selectors for store-derived state.
3. Add TypeScript types for return values.
4. Write a Vitest test in `__tests__/{name}.test.ts` if logic-heavy.
