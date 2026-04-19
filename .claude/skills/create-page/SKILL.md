---
name: create-page
description: Create a new screen/route in the Expo Router app.
---

1. Create `app/{route}.tsx` (or `app/(tabs)/{route}.tsx` for a tab screen).
2. Register in the appropriate `_layout.tsx` if needed.
3. Compose using components from `components/` and hooks from `lib/hooks/`.
4. Use NativeWind classes for styling with `cn()` utility.
