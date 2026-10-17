# Handoff: new version on the `preview` branch (Oct 17, 2026)

Supabase is done: `supabase/005_public_social_game.sql` is applied, "Confirm email" is on, redirect URLs are set.

## Done (builds cleanly)
- Database + API: public/private accounts, follows, posts (likes, comments, saves, photos), feeds `get_feed2(foryou|following|friends|all)`, trending, discover, Call of the Day tables, XP, invite rewards + shared key (`invite_keys`), contact messages, delete account. API at the end of `src/social/api.js` ("v3").
- Signal math moved to `src/lib/signals.js`.
- Front door (`src/landing/`): PublicSite router (`?page=`), Landing (hero "Try it free", live preview, how it works, track record, social preview, practice, game teaser, FAQ), AuthPage, InfoPages (About, Contact with email + phone, Privacy, Terms), KeyGuide. Wired in App.jsx (logged out -> PublicSite; invite links open signup; landing ticker added after login).
- Track record: `scripts/track-record.mjs` (writes public/track-record.json in CI) + `src/landing/TrackRecord.jsx`.
- Game (`src/game/`): Call of the Day, XP card, levels, streaks, InviteRewards (+ practice bonus). Wired on Home; InviteRewards passed to SocialPage as `renderInvite`; practice bonus applied once via `paper.bonusApplied`.
- App.jsx: invited friends get the inviter's key, KeyGuide after sign up, Delete my account in Settings, footer links to About/Contact/Privacy/Terms, `?post=<id>` links stored and routed to `socialRoute {tab:'post', postId}`.
- Workflow: `.github/workflows/deploy.yml` on `preview` builds main at / and preview at /preview/. **This change still has to be put on `main`** (cherry-pick commit "Publish a preview branch under /preview/" onto main and push; the owner approved it). After that, run the "Deploy to GitHub Pages" workflow to publish https://elaijed.github.io/stock-signal-dashboard/preview/

## Left to do
1. Put the workflow change on main and push (see above), then run the workflow.
2. Rewire `src/social/SocialPage.jsx` to the new pieces (they compile but aren't used yet):
   - Wrap in `SocialCtx.Provider` (from `ui.jsx`) with `{ uid, me, quoteOf, getQuote, ensureSymbols, onOpenStock, onOpenProfile, toast, onEditPrivacy }`, render `<SocialStyles/>`.
   - Sections: Feed / Discover (badge = incoming requests) / Groups / Compete / Me.
   - Feed sub-tabs **For you** (default), Following, Friends: `ComposerBar` + `CreatePostSheet` (Composer.jsx) and `FeedList` (Feed.jsx) with `pinned={mode==='foryou' && dailyPicks ? <DailyPicksPost picks={dailyPicks}/> : null}`; empty Following/Friends show `PeopleToFollow` (Discover.jsx).
   - Discover section: `<Discover/>`. Profiles: `<CreatorProfile/>` (Profile.jsx); Me = `<CreatorProfile self ... renderInvite/>`.
   - Route tabs: requests/connections/friends/discover -> Discover; `post` + `postId` -> `PostPage` (Feed.jsx).
   - New prop `dailyPicks` ([{symbol, score, reason}]): pass from App's `pickCache.ranked` top 5.
3. Groups visual refresh (Groups.jsx): generated cover + initials, stacked avatars, chat bubbles (mine right, orange), sticky composer, watchlist chips with live change, challenge podium.
4. Notifications (Notifications.jsx): `follow` -> "started following you" + Follow back; `reaction` with ❤️ -> "liked your post"; icons per kind. In App.jsx `onNotification`: follow -> openProfile(actor); reaction/comment/reply/vote with activity_id -> goSocial('post', { postId }).
5. Password reset: handle Supabase `PASSWORD_RECOVERY` in App.jsx with a "set new password" form (`supabase.auth.updateUser({ password })`).
6. Pass `quoteOf`, `getQuote`, `ensureSymbols` to the `Feed` in StockDetail/Home so posts keep score there.
7. Test in the browser at phone and desktop sizes, light and dark, with a real login, then push `preview` and re-run the workflow. The live site (main) only changes once the owner approves the preview.
