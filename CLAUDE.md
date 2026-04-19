# Kickd — App Template

Expo SDK 54 + React Native 0.81 + Expo Router 6 + TypeScript strict. Generic
app scaffold cloned from the sternzeit template with astrology logic removed.

## Quick Reference

```bash
npm start              # Expo dev server
npm run ios            # iOS simulator
npm run android        # Android emulator
npm run web            # Web version
npm test               # Vitest unit tests
npm run test:e2e       # Maestro E2E tests
```

## What's Included

- **Navigation**: Expo Router with a custom tab bar (Home + Settings)
- **Auth**: Stub `AuthProvider` / `AuthGate` — wire up your own auth backend
- **State**: Zustand stores with AsyncStorage persistence + safe storage wrapper
- **Styling**: NativeWind (Tailwind) with light/dark theme support
- **Analytics**: PostHog integration with screen tracking, opt-out, and feature flags
- **Error Tracking**: Sentry with session replay, startup error boundary
- **Monetization**: RevenueCat IAP with paywall and subscription management
- **Notifications**: Expo Notifications with daily reminders, permission flow
- **Onboarding**: Minimal placeholder screen — replace with a real flow
- **Settings**: Full settings screen (subscription, preferences, appearance, notifications, feedback)
- **UI Components**: Button, Card, Switch, Text, Input, Label, Progress, Skeleton, Separator, Badge
- **Haptic Feedback**: Configurable haptics with user preference
- **Data Backup**: Daily automatic backup + manual export via share sheet
- **App Store Review**: Auto-prompt after configurable threshold
- **Storybook**: On-device component library
- **Testing**: Vitest unit tests + Maestro E2E tests

## Testing

When asked to "run tests", ALWAYS run **both** suites:
1. `npm test` — Vitest unit tests
2. `npm run test:e2e` — Maestro E2E tests

## Database migrations

**Source of truth is always files in `supabase/migrations/`.** The remote DB
must only ever see schema changes that exist as committed `.sql` files. This
keeps local, staging, and prod reproducible from git alone.

### The workflow

```
1. Write file:   supabase/migrations/YYYYMMDDHHMMSS_name.sql
2. Test local:   supabase db reset
3. Preview:      supabase db push --dry-run
4. Apply prod:   supabase db push
5. Commit:       git add + commit the .sql file
```

### Hard rules

- **Never** edit an already-applied migration file. Frozen forever once pushed.
- **Never** use the Supabase dashboard SQL editor for schema changes.
- **RLS on every new public table.** Even if it's `using (true)` for reference data.
- **Additive-first for risky changes.** Split column drops / renames across two deploys.

## Coding Rules

- TypeScript strict mode. No `any` — use `unknown` + type guards.
- Prefer small, focused diffs. No unrequested refactors.
- Prefer composition over inheritance. Prefer named exports.
- NativeWind (Tailwind) for styling. Use `cn()` for class merging.
- Zustand stores with AsyncStorage persistence — see `lib/stores/`.

## Project Structure

```
app/                    # Expo Router screens
  (tabs)/
    _layout.tsx         # Tab layout (Home, Settings)
    index.tsx           # Home screen
    settings.tsx        # Settings screen
    activity.tsx        # Activity placeholder (hidden)
  _layout.tsx           # Root layout (providers, Sentry, PostHog)
  auth.tsx              # Sign-in / sign-up
  onboarding.tsx        # Minimal onboarding placeholder
  paywall.tsx           # RevenueCat paywall
  feedback.tsx          # User feedback form
  settings.tsx          # Full settings screen
  settings-notifications.tsx
  debug.tsx             # Debug tools (dev only)

components/
  ui/                   # NativeWind UI primitives
  custom-tab-bar.tsx    # Custom bottom tab bar
  animated-splash.tsx   # Animated launch screen
  typing-text.tsx       # Typewriter text animation

lib/
  contexts/
    auth-context.tsx         # Supabase Auth provider
    subscription-context.tsx # RevenueCat-backed pro flag
  stores/                    # Zustand state management
    session-store.ts         # Example app data store
    settings-store.ts        # App preferences + onboarding flag
    subscription-store.ts    # Trial & purchase state
    safe-storage.ts          # AsyncStorage wrapper
  services/                  # External integrations
    posthog.ts               # Analytics
    revenue-cat.ts           # In-app purchases
    notifications.ts         # Push/local notifications
    device-id.ts             # Device UUID
    rate-app.ts              # App Store review
    backup.ts                # Data backup & export
  hooks/                     # Custom React hooks
    use-premium.ts           # Premium access gating
    use-notifications.ts     # Notification sync
    use-onboarding-check.ts  # Local onboarding flag
    use-responsive.ts        # Responsive breakpoints
  supabase/
    client.ts                # Supabase client + invokeFunction wrapper
    types.ts                 # Database types
    mock-functions.ts        # Dev mocks for edge functions
  theme.ts                   # Light/dark theme colors
  utils.ts                   # Utilities (cn() for Tailwind class merging)
  haptics.ts                 # Haptic feedback

supabase/
  config.toml
  migrations/         # Initial schema: profiles + subscriptions
  functions/          # Add edge functions here
```

## TODO for New Projects

Search for `TODO:` comments throughout the codebase for items that need customization:
- Sentry DSN in `app/_layout.tsx`
- PostHog API key via `EXPO_PUBLIC_POSTHOG_API_KEY` env var
- Supabase URL/anon key via `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- RevenueCat API key via `EXPO_PUBLIC_REVENUECAT_API_KEY_APPLE` env var
- Product IDs in `lib/services/revenue-cat.ts`
- Paywall benefits in `app/paywall.tsx`
- Onboarding content in `app/onboarding.tsx`
- App name in `app.json` and `components/animated-splash.tsx`
- Terms/Privacy URLs in `app/paywall.tsx`
- Notification content in `lib/services/notifications.ts`
- Theme colors in `lib/theme.ts` and `global.css`
- Bundle identifier in `app.json`
