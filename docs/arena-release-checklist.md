# Arena V2 production release checklist

Automated smoke tests validate MiniApp contracts against a deterministic mock. They do not replace the following production checks against deployed Backend, Bot, Telegram and PostgreSQL.

## Environment

- [ ] MiniApp public API URL points to the production Backend.
- [ ] Telegram WebApp supplies non-empty `X-Telegram-Init-Data`.
- [ ] Bot and Backend use the same `INTERNAL_API_KEY`.
- [ ] Bot MiniApp URL points to the deployed MiniApp.
- [ ] Admin group/channel IDs and Bot permissions are valid.

## Happy path

- [ ] Creator creates a match and EFC is locked once.
- [ ] Opponent joins and the open-list item disappears.
- [ ] Five-minute countdown and Ready panel appear only when Backend opens the window.
- [ ] Both players press Ready; duplicate taps create no duplicate request.
- [ ] Creator submits Room Code once; opponent sees it through polling.
- [ ] Match reaches `PLAYING`.
- [ ] Screenshot and video buttons return each participant to the Bot chat.
- [ ] Bot accepts both media items and MiniApp polling shows `0/2 → 1/2 → 2/2`.
- [ ] After both participants finish evidence, match reaches `WAITING_ADMIN`.
- [ ] Admin resolves Player 1 and Player 2 winner paths; payout and winner notification are correct.

## Alternative terminal paths

- [ ] Refund returns both locked stakes and sends notifications.
- [ ] Cancel unlocks stakes once and sends notifications.
- [ ] Technical review remains pending until an admin decision.

## Resilience and privacy

- [ ] 400/401/403/404/409/422 responses show safe Uzbek messages.
- [ ] Timeout/network failure exposes Retry and preserves recoverable UI state.
- [ ] Reload recovers match state from Backend; polling stops after leaving detail.
- [ ] Telegram IDs, usernames, file IDs, internal keys and raw errors never appear in UI/logs.
- [ ] Backend/Bot internal endpoints cannot be called without the internal key.

## Automated commands

```bash
node --test tests/arena-api.test.js tests/arena-smoke.test.js
node --check miniapp/pages/arena.js
node --check miniapp/api.js
node --check miniapp/app.js
git diff --check
```
