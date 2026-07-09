# Publishing STUAPS to Google Play and Huawei AppGallery

Everything code-side is done: a real Android project at `android-twa/` (see
`android-twa/README.md`), a signing key already generated, Digital Asset
Links already wired up, and a GitHub Actions workflow
(`.github/workflows/build-android.yml`) that builds a signed `.aab` and
`.apk` on demand.

What's left needs your own Google/Huawei developer accounts and payment —
that can't be done on your behalf. Here's exactly what to do, in order.

## 1. Set the two GitHub Actions secrets (2 minutes)

You were sent a file called `stuaps-android.keystore` plus a
`READ_ME_KEEP_SAFE.txt` with the password. **Back that file up somewhere
safe first** — password manager, encrypted drive. If it's lost, you can
never publish an update to the same Play Store listing again, and Huawei
has no recovery at all.

Then, on `github.com/phalipitse/STUAPS` → **Settings → Secrets and
variables → Actions → New repository secret**, add:

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | paste the full contents of `keystore-base64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | the password from `READ_ME_KEEP_SAFE.txt` |

## 2. Build the app

Go to the **Actions** tab → **Build Android app** → **Run workflow**. Takes
a few minutes. When it finishes, download the `stuaps-release-aab` and
`stuaps-release-apk` artifacts from the run's summary page — those are the
actual files you upload to each store.

## 3. Google Play Console

1. Create a developer account at [play.google.com/console](https://play.google.com/console/) — **$25 one-time fee**, needs identity verification (can take a day or two).
2. Create a new app, package name `com.stuaps.app`.
3. Under **Testing → Internal testing** (or straight to Production once ready), upload the `.aab`.
4. Fill in the store listing:
   - Screenshots and feature graphic: already generated in `playstore-assets/`.
   - App icon: `android-twa/store_icon.png`.
   - Privacy policy URL: `https://stuaps-server.vercel.app/privacy`
   - Category: Business.
5. Complete the **Data safety** form and **content rating** questionnaire — answer honestly based on what's in the privacy policy (account info, financial data collected; no ads, no data sold).
6. **After your first upload**, go to **Setup → App integrity** and copy the *App signing key certificate* SHA-256 fingerprint Google generates for you (Play App Signing takes over distribution signing from here). Add that second fingerprint into `client/public/.well-known/assetlinks.json` (ask me to do this, or add it directly) — otherwise real Play Store installs will show a browser address bar instead of a clean full-screen app.
7. Submit for review.

## 4. Huawei AppGallery Connect

1. Create a developer account at [developer.huawei.com](https://developer.huawei.com/consumer/en/console) — free, but requires identity/business verification (can take longer than Google's).
2. Create a new app, same package name `com.stuaps.app`.
3. Upload the `.apk` (Huawei AppGallery accepts standard Android APKs directly — no HMS/Kit integration needed for a TWA).
4. Same store listing assets as above (`playstore-assets/huawei-*.png` were generated specifically for this).
5. Note: on Huawei devices that ship without Google Play Services (common on newer models), the TWA needs Huawei's own browser (or Chrome, if installed) to render — most Huawei phones still have one of these, but it's worth testing on an actual device before or shortly after submitting.
6. Submit for review.

## 5. After approval

Both stores will show STUAPS as an installable app, just like WhatsApp.
Since it's a TWA pointing at the live site, **ordinary feature and content
changes need no rebuild or resubmission** — pushing to `main` and Vercel
deploying is enough. You only need to repeat steps 1-2 (and re-upload) for
things that change the native shell itself: app name, icon, colors, or the
package/signing identity.

The 14-day trial and paywall (already enforced server-side) apply exactly
the same whether someone reaches STUAPS through the installed app or a
browser — there's nothing extra to configure for that.
