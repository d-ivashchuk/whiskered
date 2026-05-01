# Mewgenics Scanner

Expo SDK 54 + React Native 0.81 + Expo Router 6 + TypeScript strict.
iOS app that identifies Mewgenics game items using ML and camera.

See `PRD.md` for the full v0 build plan.

## Quick Reference

```bash
npm start              # Expo dev server
npm run ios            # iOS simulator
npm run android        # Android emulator
npm run web            # Web version
npm test               # Vitest unit tests
npm run test:e2e       # Maestro E2E tests
npm run crawl          # Fetch items + sprites from mewgenics.wiki.gg
npm run crawl:bosses   # Fetch bosses from mewgenics.wiki.gg
npm run crawl:events   # Fetch events (choices/checks/outcomes) from mewgenics.wiki.gg
npm run combine        # Merge raw crawl output into data/combined/*.json
```

## What's Included

- **Navigation**: Expo Router with a custom tab bar (Home + Settings)
- **State**: Zustand stores with AsyncStorage persistence + safe storage wrapper
- **Styling**: NativeWind (Tailwind) with light/dark theme support
- **Analytics**: PostHog integration with screen tracking, opt-out, and feature flags
- **Error Tracking**: Sentry with session replay, startup error boundary
- **Monetization**: RevenueCat IAP with paywall and subscription management
- **UI Components**: Button, Card, Switch, Text, Input, Label, Progress, Skeleton, Separator, Badge
- **Haptic Feedback**: Configurable haptics with user preference
- **App Store Review**: Auto-prompt after configurable threshold
- **Storybook**: On-device component library
- **Testing**: Vitest unit tests + Maestro E2E tests
- **Wiki Crawler**: TypeScript script to fetch item data + sprites from mewgenics.wiki.gg

## Testing

When asked to "run tests", ALWAYS run **both** suites:
1. `npm test` — Vitest unit tests
2. `npm run test:e2e` — Maestro E2E tests

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
  _layout.tsx           # Root layout (providers, Sentry, PostHog)
  paywall.tsx           # RevenueCat paywall
  settings.tsx          # Full settings screen (stack)
  debug.tsx             # Debug tools (dev only)

components/
  ui/                   # NativeWind UI primitives
  custom-tab-bar.tsx    # Custom bottom tab bar
  animated-splash.tsx   # Animated launch screen
  typing-text.tsx       # Typewriter text animation

lib/
  stores/                    # Zustand state management
    settings-store.ts        # App preferences
    subscription-store.ts    # Trial & purchase state
    safe-storage.ts          # AsyncStorage wrapper
  services/                  # External integrations
    posthog.ts               # Analytics
    revenue-cat.ts           # In-app purchases
    device-id.ts             # Device UUID
    rate-app.ts              # App Store review
  hooks/                     # Custom React hooks
    use-premium.ts           # Premium access gating
    use-responsive.ts        # Responsive breakpoints
  theme.ts                   # Light/dark theme colors
  utils.ts                   # Utilities (cn() for Tailwind class merging)
  haptics.ts                 # Haptic feedback

scripts/
  crawl-wiki.ts        # Items + classes + abilities crawler
  crawl-bosses.ts      # Bosses crawler (infobox + behavior + sprites)
  crawl-events.ts      # Events crawler (choices, stat checks, outcomes)
  combine-data.ts      # Merge raw crawls into data/combined/*.json

data/                  # Crawled data (gitignored, regenerable)
  item-list.json       # All item names
  items/               # Individual item JSON files
  bosses/              # Individual boss JSON files
  events/              # Individual event JSON files (choices + outcomes)
  combined/            # Merged data the app reads
  sprites/
    png/               # 224x224 PNGs for ML training
    bosses/            # Boss sprites
    events/            # Event sprites (when present on the wiki)
  missing-sprites.json # Items without sprites
```

## TODO for New Projects

Search for `TODO:` comments throughout the codebase for items that need customization:
- Sentry DSN in `app/_layout.tsx`
- PostHog API key via `EXPO_PUBLIC_POSTHOG_API_KEY` env var
- RevenueCat API key via `EXPO_PUBLIC_REVENUECAT_API_KEY_APPLE` env var
- Product IDs in `lib/services/revenue-cat.ts`
- Paywall benefits in `app/paywall.tsx`
- App name in `app.json` and `components/animated-splash.tsx`
- Terms/Privacy URLs in `app/paywall.tsx`
- Theme colors in `lib/theme.ts` and `global.css`
- Bundle identifier in `app.json`
