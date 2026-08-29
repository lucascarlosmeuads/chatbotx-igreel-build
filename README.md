# chatbotx-igreel-build

Reproducible build of [ChatbotX](https://github.com/ChatbotXIO/ChatbotX) at a
pinned upstream revision, with one minimal cherry-picked fix applied.

## Why

On revision `064ff2d305c6e76404562db372ee40bce75aae8e`, the Instagram integration
rejects direct messages whose `attachments[].type` is `ig_reel`:

```ts
const attachmentTypeSchema = z.enum([
  "image", "video", "audio", "file", "sticker", "location", "share", "fallback",
])
```

The webhook handler validates the **whole payload** and returns early on failure:

```ts
const parsed = schema.safeParse(JSON.parse(body))
if (!parsed.success) return void logger.warn({ issues }, "instagram webhook payload unrecognized — skipping")
```

Two consequences:

1. **Inbound DMs carrying a shared Reel are dropped.** Sharing a Reel in DM is a
   common way a conversation starts, so these are often first-contact messages.
2. **Batching amplifies it.** Meta batches multiple messaging events per POST, so
   one unrecognised attachment type discards *every* message in that batch —
   including unrelated, perfectly valid text messages.

Because this happens after signature verification, the sending platform receives a
normal response and never retries. Text-only DMs are unaffected, which is why the
failure is easy to miss.

Upstream fixed this in commit `4caf7e8` (PR
[#1053](https://github.com/ChatbotXIO/ChatbotX/pull/1053)), but that landed after
the most recent tagged release, so operators pinning to releases have no fixed
version to move to yet. This repository exists to run the pinned base revision
with **only** that fix, until a patch release is available.

## What the patch changes

Two files, cherry-picked from `4caf7e8` and nothing else:

| file | change |
|---|---|
| `integrations/instagram/src/schemas.ts` | adds `story_mention`, `ig_reel`, `reel`, `template` to the attachment enum, and wraps it in `.catch("fallback")` |
| `integrations/messenger/src/schema.ts` | adds `.catch("fallback")` only — matching what upstream did there |

`.catch("fallback")` is the important half: an attachment type nobody enumerated
yet degrades to `fallback` in that one field instead of invalidating the payload.

Everything else in PR #1053 is deliberately excluded — the private-reply feature,
`is_deleted`, `reply_to.story`, the referral/postback changes and the reaction
schema. 45 of its 46 files are untouched.

## Guarantees the workflow enforces

The build aborts rather than producing a questionable image:

- upstream `HEAD` must equal the pinned revision
- `git apply --check` must pass before the patch is applied
- `git diff --name-only` must list **exactly** the two schema files — any third
  file aborts the run
- all 12 acceptance tests must pass before anything is published

## Tests

`schema-tests.mjs` imports the **real patched TypeScript**, not a copy of the
schema, and drives it through the same "validate whole payload, bail on failure"
path production uses. Fixtures are synthetic — no real account or message data.

| # | case | expected |
|---|---|---|
| 1 | inbound text | delivered |
| 2 | inbound `ig_reel` | delivered |
| 3 | `ig_reel` with `is_echo` | parsed, not treated as inbound |
| 4 | `image` / `video` / `audio` / `file` / `share` | all still delivered |
| 5-7 | `story_mention` / `reel` / `template` | delivered |
| 8 | unknown attachment type | degrades to `fallback` |
| 9 | **batch: text + `ig_reel`** | **both survive** |
| 10 | **batch: text + unknown type** | **both survive** |
| 11 | structurally invalid payload | still rejected, explicitly |
| 12 | `read` / `reaction` / `message_edit` | no change in behaviour |

Cases 9 and 10 are the ones that matter most: without the patch both messages in
the batch are lost, including the plain text one that would have passed on its own.

## Usage

Actions → **build-chatbotx-builder-igreel-fix** → *Run workflow*.

It publishes to GHCR and prints the image digest in the run summary. **Pin by
digest, not by tag** — the tag is a convenience, the digest is the identity.

## Contents

```
ig-reel-minimal.patch          the two-file patch
schema-tests.mjs               the 12 acceptance tests
.github/workflows/build.yml    pinned checkout, guards, tests, build, publish
```

## Notes

The build needs no secrets. Publication uses the workflow's own ephemeral
`GITHUB_TOKEN` with `contents: read` and `packages: write`; no long-lived
credential is created. Upstream's Dockerfile does not copy any `.env` into the
image — that line is commented out in the original, and the release stage starts
from a clean base, so build-time placeholders never reach the runtime image.

ChatbotX is open source; this patch is derived from the project's own upstream fix.
