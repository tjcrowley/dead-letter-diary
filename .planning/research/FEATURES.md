# Features Research: Dead Letter Diary

**Researched:** 2026-06-06
**Mode:** Ecosystem (features dimension)
**Confidence:** MEDIUM-HIGH (most claims verified across 2+ sources; some PWA/iOS specifics verified against current Apple/MDN documentation)

## Executive Summary

Dead Letter Diary sits at the intersection of three product categories: **encrypted personal journals** (Day One, Standard Notes, Notesnook), **commitment devices** (Beeminder, StickK, 750words), and **self-hostable PWAs** (Notesnook-style E2E + bring-your-own-server). Each category has well-established user expectations. The product's hard constraints (no export, no recovery, no sharing) eliminate ~40% of features competitors ship, so the bar is much higher on the remaining ~60% — write experience, streak feedback, deadline communication, and the wipe ceremony itself.

The single biggest UX risk is **deadline anxiety becoming user-hostile**. Beeminder solved this with the "Akrasia Horizon" (changes take a week to take effect) and clear visual countdown. 750words solved it with badges and gentle daily reminders. The product must steal from both: visceral countdown clarity + reward-driven daily ritual, without nagging.

---

## Table Stakes

Features users expect from a v1 production diary PWA. Missing any of these causes abandonment within the first session.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Distraction-free write surface** | Every diary app since Day One has this. Cursor in textarea, minimal chrome. | Low | Auto-focus on open; no toolbars by default |
| **Live word count** | Required because the deadline IS the word count. Must be visible at all times. | Low | Counter in corner; updates as user types; turns green when minimum hit |
| **Today's deadline countdown** | The product *is* the deadline. Must be visible from every screen. | Low | "T-4h 23m" style; persistent header element |
| **Auto-save** | Users expect zero-loss writing. Especially critical given dead man's switch — losing draft = catastrophic. | Med | Debounced save to IndexedDB every 1-2s; never lose a keystroke |
| **Installable PWA with home-screen icon** | Required for iOS push notifications (iOS 16.4+ only delivers push to home-screen PWAs). | Med | Manifest, icons, install prompt UX, "add to home screen" coaching for iOS Safari |
| **Biometric unlock (WebAuthn)** | Users opening a diary expect Face ID / Touch ID. Password-only feels antiquated. | Med | Same API for biometric and hardware key; biometric primary, PIN/passphrase as fallback |
| **Visible fallback auth at unlock** | Per FIDO Alliance research, hiding fallback options is a top WebAuthn anti-pattern that crashes adoption. | Low | "Use PIN instead" link always present below biometric prompt |
| **Push notifications for deadline warnings** | The dead man's switch only works if the user gets warned. Without push, the product fails its core promise. | High | Web Push API; iOS requires home-screen install; permission flow must be earned (see Soft-Ask pattern) |
| **Offline writing** | PWA without offline = broken promise. User opens app on subway = expects to write. | Med | IndexedDB-first with Dexie; outbox pattern for server sync |
| **Sync status indicator** | Industry standard for offline-first apps (Notion, Standard Notes, Obsidian sync). Users panic without it. | Low | Small status dot: "Synced" / "Saving..." / "Offline — 3 entries pending" |
| **Encryption status indicator** | Encrypted note apps (Standard Notes, Notesnook) all surface "End-to-end encrypted" prominently. Builds trust. | Low | Persistent badge or padlock; clickable for explanation |
| **Streak counter** | Every accountability app shows a streak. 750words, Duolingo, Beeminder. Loss aversion is the core mechanic. | Low | Days written / days missed; visible on dashboard |
| **Past entries browsing (read-only)** | Even though no export, users still want to re-read. Day One's "On This Day" is universally loved. | Med | Calendar grid + chronological list; client-side decryption only |
| **Grace day UI** | User explicitly requested grace days; must be discoverable and unambiguous. | Med | "Use grace day" button shown on deadline screen; weekly budget visible; confirmation modal |
| **Settings page** | Word minimum, timeout, warning thresholds, grace budget all configurable per PROJECT.md. | Low | Standard form; Akrasia Horizon for tightening settings (see Differentiators) |
| **Account creation + first-time setup** | Diary needs an owner. WebAuthn enrollment is the heart of this flow. | High | Multi-step: passphrase → register passkey → set diary title → set commitments → confirm "no recovery" |
| **Explicit "no recovery" acknowledgment** | Standard Notes, Notesnook, Bitwarden all force users to acknowledge "we cannot recover this." Without it, support burden explodes. | Low | Checkbox + signed acknowledgment during setup; cannot proceed without it |
| **HTTPS** | WebAuthn, service workers, push, and IndexedDB persistence all require it. Non-negotiable. | Low | Caddy reverse proxy is the 2026 default for self-hosters |

---

## Differentiators

Features that distinguish Dead Letter Diary from existing diary apps and commitment devices. These should land in v1 because they're the reason the product exists.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **The Wipe Ceremony** | This *is* the product. Must feel ritualistic, irreversible, dignified. Not a generic error toast. | High | Final 5-minute window: fullscreen countdown → key shard deletion → animated wipe of IndexedDB → final blank screen showing only diary title. Survivor of the rapture aesthetic. |
| **Server-verified word count** | Distinguishes from honor-system journaling apps. The server is the bouncer, not just storage. | Med | Server computes word count on submission; rejects entries below minimum; client cannot bypass |
| **Akrasia Horizon for weakening commitments** | Stolen from Beeminder. Making the deadline easier (lower word count, longer window) requires 7-day advance commitment. Tightening is immediate. | Med | One-way ratchet for stricter; one-week delay for looser. Prevents heat-of-moment weakening that defeats the product. |
| **Tiered warning notifications** | 24h / 4h / 1h / 15min thresholds per PROJECT.md. Visceral escalation. Tone shifts from gentle → urgent → final. | Med | Push notification copy varies by threshold. "You've got 4 hours" vs. "FIFTEEN MINUTES — the diary is about to die." |
| **Decoy state on wipe** | After wipe, the diary doesn't say "DELETED." It shows the title and a blank screen — as if the user had never written. Like the diary went on without them. | Med | More emotionally devastating than an error screen; preserves the artifact of the commitment |
| **First-paint deadline clarity** | App opens to: deadline time, word count progress, single CTA "Write today." No dashboard scroll. | Low | Inspired by Beeminder's Yellow Brick Road but for prose |
| **Optional public "wall of shame/honor"** | StickK-style: opt-in commitment statement that publishes only your survival/death status to a public URL. No content. Pure accountability. | Med | Anti-feature for some; differentiator for the writers segment. Defer to v2. |
| **Setup ritual** | First-run is a ceremony, not a wizard. User signs a "contract with future self," names the diary, picks the death window. Feels weighty. | Med | Multi-page progressive disclosure; calligraphic typography for the contract; explicit "I understand this can die" |
| **Diary epitaph / final words on wipe** | Optional — user can set a short message that displays on the wipe screen if the diary dies. "Here lies the second draft of my novel, 2026." | Low | Set at creation; immutable; only thing visible post-wipe besides the title |
| **Local-only "panic encrypt"** | User-triggered immediate wipe button buried in settings (with confirmation). Some diarists want this for personal-safety reasons. | Low | Same as missing the deadline, but on-demand. Aligns with dead man's switch use case. |

---

## Anti-Features (with warnings)

Things to deliberately NOT build. PROJECT.md already excludes some (sharing, social, media, export, multi-diary); below adds features that *seem* good but would undermine the product.

| Anti-Feature | Why It Hurts | What to Do Instead |
|--------------|--------------|-------------------|
| **Cloud backup of diary contents** | Backups are the inverse of a dead man's switch. If the user can restore, the death has no teeth. Worse, it implies the server has access to plaintext — destroying the zero-knowledge model. | Document the threat model clearly. Make the "no recovery" property a feature, not a bug. |
| **"Forgot my passphrase" recovery email** | Same as above. Any recovery path = the server can decrypt = E2E is a lie. Standard Notes and Notesnook are explicit about this; users accept it because it's a security property. | Mandatory acknowledgment at signup. Optional recovery-passphrase printout that user stores offline (acknowledging it's an escape hatch). |
| **Auto-extending the deadline if user "almost made it"** | Defeats the product. The deadline must be inviolable. Fuzzy deadlines = no commitment device. | Grace day is the only safety valve. Period. |
| **Snooze / dismiss notifications** | Snoozing the warning that the diary is about to die is the wrong affordance. Dismissing the notification doesn't dismiss the deadline. | Notifications are informational; tapping opens the app. No snooze button. |
| **Streak freezes / streak insurance** | Duolingo-style streak freezes feel good but defeat the loss-aversion mechanic. 750words deliberately doesn't offer them. | Grace day is the only insurance; weekly budget; manually invoked. |
| **Rich text editor with toolbars** | Toolbars destroy distraction-free writing. Day One's premium feel comes from chrome-less surfaces. | Markdown-aware textarea. No buttons. Maybe `Cmd+B` if users ask. |
| **Sharing entries (even via copy/paste)** | Copy/paste cannot be prevented in browsers, but the UI should never encourage it. No "share entry" button. | Acknowledge browser limitations in threat model docs; don't build features that imply sharing is supported. |
| **AI prompts / writing suggestions** | Sends plaintext to a third-party LLM, breaking E2E. Even local LLM is a distraction from the product's purpose. | Optional rotating prompts list (canned, client-side). Defer LLM features indefinitely. |
| **Mood/weather/location metadata** | Day One does this, but it leaks plaintext-equivalent metadata to the server (timestamps already do this; don't add more). | Client-side only mood tagging if at all. Defer to v2. |
| **Web-only "tabs" mode (no PWA install)** | Without home-screen install, iOS push notifications don't fire. Without push, the dead man's switch can't warn the user. Without warnings, the product is cruel. | Strongly funnel users into install; degrade gracefully on platforms that can't install (warn loudly) |
| **Multi-device sync of encrypted content** | Tempting, but every device needs its own WebAuthn enrollment for the device-shard. Multi-device makes key splits 10x harder. | One-device-per-account in v1. Add device-pairing ceremony in v2. |
| **Public/private toggle per entry** | Mixing private and public defeats the product. Either commit to public (Substack) or commit to private (this). | Single mode: private. |
| **Open registration on self-hosted instances** | Single-user app. Open registration on self-hosted = abandoned instances become spam relays / random users. | Owner creates account on first run; no public signup; admin can invite if multi-user added later. |
| **Telemetry / crash reporting that includes entry content** | Even line numbers from a crash report could leak structure. | Opt-in, content-free telemetry only; default OFF on self-hosted |

---

## Self-Hosting Requirements

What a production-ready self-hostable PWA needs. Notesnook and Standard Notes are the closest analogs; both ship official Docker Compose stacks.

### Configuration

| Requirement | Why | Implementation |
|-------------|-----|----------------|
| **`.env` file for all secrets** | Standard self-hosting hygiene; don't bake secrets into image | `JWT_SECRET`, `DATABASE_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SMTP_*`, `PUBLIC_URL` |
| **`docker-compose.yml` with sane defaults** | Users expect one-command install: `docker compose up -d` | Single compose file; named volumes for Postgres data; bind-mountable config |
| **VAPID key generation on first run** | Web Push requires server-generated keys; manual is footgun | Startup script generates if not present; writes to `.env` |
| **HTTPS via Caddy or Traefik reverse proxy example** | WebAuthn, service workers, and push all require HTTPS. Self-signed won't work for push. | Ship a `Caddyfile` example next to compose; recommend Let's Encrypt; docs warn that LAN-only install needs special handling |
| **`PUBLIC_URL` env var** | WebAuthn `rpId` and Web Push origin must match the public hostname | Single source of truth; CSP and CORS derive from it |
| **Database migrations on startup** | Self-hosters won't run migrations manually | Run on boot; lockfile to prevent dual-runner races |
| **Health check endpoint** | Required for Docker `healthcheck` and reverse proxies | `GET /healthz` returns 200 if DB reachable and key shard store healthy |

### First-Run Admin Experience

| Step | Why | Notes |
|------|-----|-------|
| **Server detects empty DB → renders setup page** | Plane and similar self-hosted apps use this pattern; no need for separate admin CLI | Locks setup mode until first account created; afterwards setup route 404s |
| **Owner account creation (email + passphrase + WebAuthn)** | Single-user app; owner = admin | Multi-step: passphrase → WebAuthn enrollment → confirm |
| **Diary setup (title, word minimum, timeout, warning thresholds, grace budget)** | All commitments set during setup, not later | Inline help text explains tradeoffs; defaults from PROJECT.md (50 words, 24h) |
| **VAPID keys + SMTP test** | Self-hoster needs to know push and email work before relying on them | "Send test push" and "Send test email" buttons; setup blocks completion if push fails (since it's load-bearing) |
| **No-recovery acknowledgment** | Final step before setup completes | Checkbox + retyped phrase: "I understand this diary cannot be recovered." |

### SMTP

| Requirement | Why | Implementation |
|-------------|-----|----------------|
| **Optional but recommended** | For password-reset (on *account*, not diary contents), email notification fallback when push fails, alerts to admin | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; graceful fallback if unset |
| **Email is NEVER for entries** | Sending entries by email defeats E2E | Email only for system events: deadline warnings (no content), grace-day used, wipe occurred |
| **Test email button in admin** | Standard self-hosted UX | One click; surface SMTP errors in plain language |

### Observability

| Requirement | Why | Implementation |
|-------------|-----|----------------|
| **Structured logs to stdout** | Docker-native; users tail logs with `docker compose logs` | JSON logs; level configurable via env |
| **Metrics endpoint (optional)** | Power users want Prometheus | `GET /metrics`; opt-in; never includes entry content or counts that could identify users |
| **Admin dashboard for instance health** | Status of: DB, key shard store, push subscriptions, last successful sync | One page; auth-gated; no entry content visible |

### Documentation Requirements

- `README.md` with one-command install
- `SELF_HOSTING.md` with: domain setup, HTTPS, VAPID, SMTP, backup of *non-content* data (account records, audit log)
- Threat model document explaining what self-hoster can and cannot see (they hold the server shard — they CAN make the diary survive past deadline if they're malicious, but they CANNOT read content)
- Migration / upgrade guide
- A clear statement of what self-hosting does NOT protect against (compromised client device)

---

## UX Patterns Worth Adopting

Patterns proven in adjacent products that map cleanly to this domain.

### From Day One / Journey
- **Calendar grid for past entries** — universal in journaling apps; users navigate by date
- **"On This Day" surface** — re-surfaces entries from prior years on same date; high engagement driver
- **Auto-focus on open** — cursor in textarea instantly; zero clicks to start writing
- **Typography matters** — serif body text, generous line height, neutral background. Day One's writing surface is its moat.

### From Beeminder
- **Yellow Brick Road equivalent** — visual today/this-week graph showing pace vs. minimum
- **Akrasia Horizon** — weakening commitments takes 7 days; strengthening is immediate. (Already in Differentiators.)
- **Charge-the-credit-card visceralness** — translate to "destroy the diary" visceralness. The threat must be felt.

### From StickK
- **Public commitment option** — opt-in only; just status (alive/dead), no content
- **Naming a stakes-holder** — could be implemented as "epitaph recipient" — someone gets notified if diary dies (no content, just notification)

### From 750words
- **Daily badges for streaks** — 5, 10, 30, 100, 365 days. Animal badges work; users love them.
- **"Cheating" detection** — 750words flags suspicious patterns (pasting, lorem ipsum). Server-side word count verification per PROJECT.md should detect: repeated single character, copy-paste of prior entry, all-same-word
- **Stats and word clouds** — client-side only (no plaintext to server); user sees own patterns
- **The "I made it" moment** — when the word minimum is hit, a small, satisfying visual confirmation. Color change + subtle animation.

### From Standard Notes / Notesnook
- **Persistent "End-to-end encrypted" badge** — trust signal; tap for explanation
- **Zero-knowledge claims backed by documentation** — public threat model; published audit if budget allows
- **No-account "demo" mode** — try without commitment; useful for screenshots and onboarding

### From WebAuthn UX Research (FIDO Alliance, 2024-2025)
- **Auto-trigger biometric enrollment after passphrase setup** — 30-50% higher adoption than manual opt-in
- **Always-visible fallback** — "Use PIN instead" link below biometric prompt; never hidden
- **No jargon** — never say "WebAuthn," "FIDO2," "passkey credential." Say "Use Face ID" or "Use your fingerprint."
- **Cross-device sign-in via QR code** — for desktop install where mobile holds the credential; label as "Use your phone to sign in"
- **Failure handling** — after 2 biometric retries, present fallback prominently; don't loop the prompt
- **Don't nag** — if user declines biometric setup, don't re-prompt in the same session

### From Web Push UX Research (PushEngage, OneSignal, 2026)
- **Soft-ask pre-prompt** — never trigger the browser's native permission prompt cold. First show an in-app modal explaining the value, then trigger the OS prompt only after user clicks "Yes, enable warnings."
- **Event-based timing** — request push permission AFTER setup is complete, not at first page load. Best moment: right after user sets the deadline ("Get warnings before this fires?")
- **Plain-language copy** — "We'll warn you 24h, 4h, 1h, and 15min before the diary is at risk" not "Enable notifications"
- **Show declined-state path** — if user denies, surface email fallback option ("We'll email you instead if SMTP is configured")
- **iOS-specific coaching** — for Safari users not yet installed: "Install to home screen first to enable warnings. [How]"

### From Offline-First PWA Patterns (LogRocket, 2026)
- **Optimistic UI** — entry appears immediately on save, even if sync hasn't completed
- **Outbox pattern** — mutations queued with idempotency keys; survive page reloads
- **Last-write-wins for entries** — single-user, single-device in v1 means LWW is fine; no CRDT needed yet
- **Soft deletes / tombstones** — for sync metadata; not for entry content (entries are immutable after the day rolls)
- **Recovery UI** — if sync fails persistently, surface "Retry sync" button with reason ("Server returned 503")
- **Sync status line** — always visible: "Synced 3 minutes ago" / "Offline — 2 entries pending" / "Sync failed — tap to retry"

---

## Complexity Notes per Feature

Rough effort estimates to inform roadmap phasing.

### Phase 1 candidates (foundation)
- **Auth + WebAuthn enrollment** — High. WebAuthn flow, fallback chain, passphrase derivation. 1-2 weeks.
- **Encrypted entry storage (client-side)** — High. Web Crypto, HKDF, AES-GCM, IndexedDB encryption envelope. 1-2 weeks.
- **Distraction-free write surface + auto-save + word count** — Low. 2-3 days.
- **Self-hosting baseline (Docker Compose, .env, Postgres, HTTPS docs)** — Med. 1 week.

### Phase 2 candidates (the switch)
- **Key-split architecture (server shard + client shard)** — High. Crypto design, server endpoints for shard release, time-based shard destruction. 2 weeks.
- **Word count server verification** — Low. 1-2 days.
- **Deadline tracking + warning push notifications** — High. Cron/scheduled jobs, push subscriptions, VAPID, iOS install coaching. 2 weeks.
- **The wipe ceremony** — Med. The mechanics are simple (delete shard, wipe IDB); the UX is the hard part. 1 week.

### Phase 3 candidates (production polish)
- **First-run setup flow** — Med. Multi-step form, validation, irreversibility acknowledgments. 1 week.
- **Settings page + Akrasia Horizon for weakening** — Med. Form + delayed-effect persistence. 3-5 days.
- **Grace day UI** — Low. 2-3 days.
- **Past entries browsing (calendar + chronological)** — Med. Client-side decryption on demand; pagination. 1 week.
- **Streak counter + badges** — Low. Client-side derivation from entry log. 3 days.
- **Sync status + offline status indicators** — Low. 2 days.

### Phase 4 candidates (self-hosting hardening)
- **Admin dashboard (health, push stats, audit log)** — Med. 1 week.
- **SMTP integration + test buttons** — Low. 2-3 days.
- **Observability (logs, metrics)** — Low. 2 days.
- **Documentation (README, SELF_HOSTING.md, threat model)** — Med. 1 week.

### Deferred to v2 (do NOT build in v1)
- Multi-device sync — fundamentally changes key split
- Multi-diary support — out of scope per PROJECT.md
- Public commitment (StickK-style) — useful but optional; ship without
- Mood/weather/location metadata — explicit anti-feature for v1

---

## Sources

- [Day One Features](https://dayoneapp.com/features/) — feature reference for journaling table stakes
- [Best Diary App of 2026 (Journey blog)](https://blog.journey.cloud/best-diary-app-2026/) — comparative feature analysis
- [Beeminder vs Competitors (Beeminder blog)](https://blog.beeminder.com/competitors/) — commitment device UX
- [StickK](https://www.stickk.com/) — commitment contracts model
- [How 750words.com Uses Gamification](https://yukaichou.com/gamification-study/gamification-750wordscom-writing-day/) — writing streak mechanics
- [750 Words testimonials analysis (Buster Benson)](https://medium.com/750-words/i-analyzed-15-years-of-testimonials-from-users-of-750words-com-to-learn-how-journaling-helped-them-9665c93814e8) — what makes daily writing stick
- [Standard Notes self-hosting](https://standardnotes.com/help/47/can-i-self-host-standard-notes) — self-hosted E2E reference
- [Notesnook](https://notesnook.com/) — modern open-source E2E note app
- [10 UX Patterns That Drive 80%+ Passkey Adoption](https://securityboulevard.com/2026/04/10-ux-patterns-that-drive-80-passkey-adoption-with-real-examples/) — WebAuthn enrollment + fallback UX
- [Biometric Authentication App Design 2026](https://www.orbix.studio/blogs/biometric-authentication-app-design) — biometric UX guide
- [Push Notification Best Practices 2026 (Reteno)](https://reteno.com/blog/push-notification-best-practices-ultimate-guide-for-2026) — opt-in conversion patterns
- [7 High-Converting Push Notification Opt In Examples (PushEngage)](https://www.pushengage.com/push-notification-opt-in-examples/) — soft-ask pattern
- [PWA iOS Limitations and Safari Support 2026 (MagicBell)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — iOS PWA push constraints
- [Offline-First PWA Architecture](https://beefed.ai/en/offline-first-pwa-architecture) — outbox + sync patterns
- [Offline-first frontend apps in 2025 (LogRocket)](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) — IndexedDB + sync architecture
- [Self-Hosting Plane with Docker Compose](https://medium.com/@elizabethsosacherian/self-hosting-plane-with-docker-compose-installation-admin-setup-first-project-7ad416144c8a) — first-run admin UI pattern
- [Best Self-Hosted Docker Dashboards 2026](https://infrapilot.org/blog/best-self-hosted-docker-dashboards-2026) — self-hosting tooling landscape

## Confidence Notes

- **HIGH:** Table stakes claims (every diary app sources confirm), iOS PWA push limitations (verified across Apple-aligned sources and MagicBell deep-dive), WebAuthn fallback anti-patterns (FIDO Alliance research cited)
- **MEDIUM:** Specific conversion rates for push opt-in (PushEngage data; vendor source so may be optimistic), gamification badge specifics (750words case study is single-source but well-documented), self-hosting setup wizard pattern (consistent across Plane, Notesnook, Standard Notes)
- **LOW:** Specific Akrasia Horizon adoption metrics, decoy state UX value (no precedent; product-original idea)
