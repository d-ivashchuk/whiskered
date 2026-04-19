---
name: create-component
description: Create a new UI component with TypeScript, NativeWind, and optional Storybook story.
---

1. Create `components/{name}.tsx` with props interface and named export.
2. Use `cva` for variants if the component has visual variants.
3. Use the `cn()` utility from `lib/utils` for className merging.
4. Add to barrel export if placing in `components/ui/`.
5. Create a Storybook story at `components/{name}.stories.tsx` if visual.
