# STUAPS Android app (Trusted Web Activity)

This is a real, buildable Android project generated with
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) that wraps the
live STUAPS PWA (`https://stuaps-server.vercel.app`) as a
[Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity) —
a full-screen Chrome tab with no browser UI, installed via the Play Store /
AppGallery like a native app. There is no separate app codebase to maintain:
this project just points at the deployed website, so every change pushed to
`main` and deployed by Vercel appears in the installed app automatically —
no rebuild or re-submission needed for ordinary feature/content changes.

- **Package ID:** `com.stuaps.app`
- **Signing key:** not committed here (see repo root `.gitignore`) — lives
  only in GitHub Actions secrets and a private backup. See
  `ANDROID_PUBLISHING.md` at the repo root for the full checklist.

## Building

This sandbox couldn't reach `dl.google.com` (blocked network policy), so the
actual compile step runs in **GitHub Actions** instead, which has full
internet access — see `.github/workflows/build-android.yml` at the repo
root. Trigger it manually from the Actions tab (`Build Android app` →
`Run workflow`) once the two required secrets are set, or just push a change
under `android-twa/`.

To build locally instead (with Android Studio / a full Android SDK
installed):

```sh
export ANDROID_KEYSTORE_PASSWORD="..."   # from the keystore handoff file
./gradlew bundleRelease   # -> app/build/outputs/bundle/release/app-release.aab
./gradlew assembleRelease # -> app/build/outputs/apk/release/app-release.apk
```

## Digital Asset Links

`client/public/.well-known/assetlinks.json` (served at
`https://stuaps-server.vercel.app/.well-known/assetlinks.json`) declares this
app's signing certificate so Android shows it with no browser address bar.
**After the first Play Store upload**, Google Play App Signing re-signs the
app with its own key for distribution — add that second fingerprint (Play
Console → your app → Setup → App integrity → App signing key certificate) to
`assetlinks.json` too, or real Play Store installs will show a browser bar.
