# App Store Submission Guide for STUAPS

**Target Version:** 1.0.0  
**Publication Date:** August 8, 2026  
**Platforms:** Google Play Store, Huawei App Gallery

---

## Overview

STUAPS is a Progressive Web App (PWA) wrapped in a native shell for app store distribution. This guide covers:

1. **Prerequisites** — Developer accounts, certificates, assets
2. **Google Play Store submission** — Using Bubblewrap
3. **Huawei App Gallery submission** — Direct PWA publishing
4. **Post-Launch** — Maintenance and updates

---

## Part 1: Prerequisites

### 1.1 Developer Accounts

**Google Play Developer Account:**
- Cost: $25 USD (one-time)
- Sign up: https://developer.android.com/
- Process: Google Account → Create Developer Account → Pay fee
- Time to activate: Immediate (payment may take 24-48 hours to clear)

**Huawei Developer Account:**
- Cost: Free
- Sign up: https://developer.huawei.com/
- Process: Create account → Verify email → Set up organization
- Time to activate: 1-2 hours

### 1.2 Required Assets

✅ **App Icon (512×512 PNG)**
- Located: `client/public/icons/icon-512.png`
- Already available in your project

✅ **Feature Graphics**
- Dimensions: 1024×500 PNG
- Purpose: Featured app image on store
- Create via Figma/Canva using logo and brand colors
- Suggested text: "STUAPS v1.0.0 - Now on Mobile"

✅ **Screenshots (Minimum 2, Recommended 5)**
- Dimensions: 1080×1920 (for phones)
- Show: Billing page, Outstanding invoices, Pest Control, Login
- Include captions: "Check outstanding invoices", "Track pest control", etc.
- Take via: Chrome DevTools (phone emulation) or Android simulator

✅ **Description & Marketing Text**
- Short description (80 chars): "Invoice reconciliation for student accommodation"
- Full description (4,000 chars): Already prepared below
- Promotional text (80 chars): "Manage billing, students & pest control"

✅ **Privacy Policy & Terms**
- ✅ Privacy Policy: `PRIVACY_POLICY.md` (created)
- ✅ Terms of Service: `TERMS_OF_SERVICE.md` (created)
- ✅ Data Handling: `DATA_HANDLING_DISCLOSURE.md` (created)
- All must be accessible via HTTPS URLs

### 1.3 Hosting Legal Documents

**Host on your website:**

1. Deploy to STUAPS website:
   ```bash
   # Add to client/public/legal/
   client/public/legal/privacy-policy.md
   client/public/legal/terms-of-service.md
   client/public/legal/data-handling.md
   ```

2. Make accessible at:
   - https://stuaps.vercel.app/legal/privacy
   - https://stuaps.vercel.app/legal/terms
   - https://stuaps.vercel.app/legal/data-handling

3. Alternative: Create plain HTML versions for web display

**Example URLs for store submission:**
- Privacy Policy: https://stuaps.vercel.app/legal/privacy
- Terms of Service: https://stuaps.vercel.app/legal/terms

---

## Part 2: Google Play Store Submission (Bubblewrap)

### 2.1 Install Bubblewrap

```bash
# Install globally
npm install -g @bubblewrap/cli

# Verify installation
bubblewrap --version
# Output: Expected: v1.8.0 or later
```

### 2.2 Generate Project

```bash
# In your project root
bubblewrap init --manifest twa-manifest.json

# This generates:
# - app/
#   ├── src/main/java/com/stuaps/app/  (Java code)
#   ├── src/main/AndroidManifest.xml
#   └── build.gradle
# - gradle/ (build system)
# - keystore.jks (signing key - keep safe!)

# Output:
# ✓ Project generated successfully
# ✓ Android app template created
# ✓ Keystore generated: ./keystore.jks
```

### 2.3 Build Signed APK

```bash
# Build signed APK for Play Store
bubblewrap build --skipPwaValidation

# When prompted:
# - Keystore path: ./keystore.jks
# - Keystore password: [Create a strong password, save it]
# - Key alias: release
# - Key password: [Same as keystore or different]

# Output:
# ✓ Signed APK: ./app/build/outputs/apk/release/app-release.apk
# ✓ Bundle: ./app/build/outputs/bundle/release/app-release.aab

# For Play Store, use the Android App Bundle (.aab):
# ./app/build/outputs/bundle/release/app-release.aab
```

**Security:** 🔒 Keep keystore file and password safe:
- Save keystore.jks in secure location
- Store password in password manager
- **NEVER** commit keystore.jks to Git (add to .gitignore)
- You'll need this for every future update

### 2.4 Create App on Google Play Console

**Steps:**

1. Visit: https://play.google.com/console/
2. Click "Create app"
3. Fill form:
   - **App name:** STUAPS
   - **Default language:** English
   - **App or game:** App
   - **Category:** Business
   - **Content rating:** Choose appropriate (your app doesn't show adult content)
   - **Free or paid:** Free

4. Accept agreements and confirm

### 2.5 Fill Out Store Listing

**In Google Play Console → Your App → Store Listing**

| Field | Value |
|-------|-------|
| **App name** | STUAPS |
| **Short description** | Invoice reconciliation for student accommodation providers |
| **Full description** | (See below) |
| **Category** | Business |
| **Content rating** | (Complete questionnaire) |
| **Contact email** | support@stuaps.com |
| **Website** | https://stuaps.vercel.app |
| **Privacy policy** | https://stuaps.vercel.app/legal/privacy |
| **Permissions** | (System-generated, review below) |

**Full Description (Paste this):**

```
STUAPS - Student Accommodation Management Platform

STUAPS is the essential business app for student accommodation providers in South Africa. Manage invoicing, reconciliation, student records, and property maintenance all in one place.

KEY FEATURES:

📊 Billing & Reconciliation
- Track student payments and outstanding invoices
- Metered usage billing with automatic overage charges
- Send printable payment demand letters
- Monthly billing summaries and invoices

👥 Student Management
- Organize students by institution and property
- View payment history and outstanding balances
- Track contact information and student numbers

🏠 Property Management
- Manage multiple properties and institutions
- Track pest control treatments and due dates
- Flag overdue pest control treatments
- View pest control history and schedules

📈 Financial Reporting
- Generate payment reconciliation reports
- Export data to accounting software
- Track receivables and aging reports

🔐 Security & Compliance
- Enterprise-grade data encryption (HTTPS/TLS)
- Role-based access control
- Secure multi-tenant architecture
- Compliance with South African data protection laws (POPIA)

SUBSCRIPTION PLANS:
- Monthly: R750/month (includes 50 students)
- Annual: R8,100/year
- Overage: R2.50 per student above included limit

GETTING STARTED:
1. Sign up with your email
2. Create your institution and properties
3. Upload student invoices (CSV format)
4. Start tracking payments and pest control

SUPPORT:
- Email: support@stuaps.com
- In-app support tickets
- Documentation: https://stuaps.vercel.app/help

ABOUT US:
Built by Pits Marketing and Distribution for student accommodation providers in South Africa.

Privacy Policy: https://stuaps.vercel.app/legal/privacy
Terms of Service: https://stuaps.vercel.app/legal/terms
Data Handling: https://stuaps.vercel.app/legal/data-handling
```

### 2.6 Upload Screenshots

**In Google Play Console → App content → Screenshots**

1. Upload at least 2 screenshots (recommended 5)
2. **Recommended screenshots:**
   - Screenshot 1: Login screen with tagline
   - Screenshot 2: Billing dashboard with usage chart
   - Screenshot 3: Outstanding invoices report
   - Screenshot 4: Pest control tracking page
   - Screenshot 5: Mobile-optimized property details

3. **Captions (add to each):**
   - "Check outstanding invoices at a glance"
   - "Track pest control and maintenance schedules"
   - "Manage student billing and payments"
   - "Generate professional payment demand letters"
   - "Secure, encrypted business data"

### 2.7 Fill Out App Permissions & Declarations

**Content Rating (questionnaire):**
- No violence, adult content, or offensive material
- No location data collection
- No camera/microphone access

**Target Audience:**
- Select "Not primarily directed at children"

**Health & Safety:**
- No special declarations needed

**Sensitive Data:**
- ✅ Declare: "Handles financial information (invoices, payments)"
- ✅ Declare: "Handles personal data (student records)"
- ✅ Ensure you've linked Privacy Policy

### 2.8 Upload APK/Bundle

**In Google Play Console → Release → Internal Testing (First)**

1. **Create Internal Testing Track:**
   - Click "Create new release"
   - Select "Internal testing"
   
2. **Upload Bundle:**
   - Click "Add app bundle/APK"
   - Upload: `app/build/outputs/bundle/release/app-release.aab`
   - Add release notes: "v1.0.0 - Initial release"
   
3. **Test:**
   - Add test users (your emails)
   - Open Google Play console link
   - Install app on test device
   - Verify:
     - App launches
     - Login works
     - Navigation works
     - No crashes

4. **Promote to Production:**
   - After successful testing, return to Release page
   - Click "Manage releases" → "Internal testing"
   - Click "Review release"
   - Select "Production" and promote

### 2.9 Review & Submit

**Final Checklist:**

- [x] App name and description complete
- [x] Screenshots uploaded (min 2, recommended 5)
- [x] App icon uploaded
- [x] Privacy policy linked and accessible
- [x] Content rating completed
- [x] App bundle uploaded
- [x] Release notes added
- [x] Contact email correct
- [x] Website URL correct

**Submit for Review:**
1. Go to "App releases" → "Production"
2. Click "Review"
3. Click "Rollout to Production"
4. Click "Confirm"

**Review Time:** Google typically reviews within 1-3 days.

**Monitoring:**
- Monitor Google Play Console for review feedback
- Be prepared to make changes if rejected
- Common rejection reasons:
  - Broken links to privacy policy
  - App crashes on launch
  - Misleading description vs. actual features
  - Missing required permissions declaration

---

## Part 3: Huawei App Gallery Submission

### 3.1 Huawei Developer Account Setup

1. Visit: https://developer.huawei.com/
2. Sign up (free)
3. Complete profile:
   - Company/Developer name: "Pits Marketing and Distribution"
   - Country: South Africa
   - App category: Business
4. Verify email

### 3.2 Create App on Huawei AppGallery Connect

**Steps:**

1. Go to https://appgallery.huawei.com/
2. Click "Developer" → "AppGallery Connect"
3. Click "My apps" → "Create"
4. Fill form:
   - **App name:** STUAPS
   - **Package name:** com.stuaps.app
   - **App category:** Business
   - **Publishing region:** South Africa (select all relevant regions)

5. Accept terms and create

### 3.3 Fill Out App Information

**In AppGallery Connect → Your App → Release → Listing**

| Field | Value |
|-------|-------|
| **App name** | STUAPS |
| **Subtitle** | Invoice reconciliation & property management |
| **Short description** | Manage invoicing, students, and pest control for student accommodation |
| **Full description** | (Use same as Google Play Store, above) |
| **Category** | Business |
| **Website** | https://stuaps.vercel.app |
| **Support email** | support@stuaps.com |

### 3.4 Upload App Assets

**Icon:**
- 512×512 PNG (already have: `client/public/icons/icon-512.png`)

**Screenshots:**
- Minimum 2, recommended 5
- 1080×1920 PNG/JPG format
- Same screenshots as Google Play

**Feature graphic:**
- 1024×500 PNG
- Show app name and main features

### 3.5 Submit for PWA Review

**Huawei supports PWA submission without APK:**

1. In AppGallery Connect → Release → Versions
2. Click "Add APK"
3. Choose "Web App" (PWA option if available) or provide APK
4. If PWA option: Enter start URL: https://stuaps.vercel.app
5. Huawei will wrap your PWA automatically

**Alternative: Upload APK if PWA not supported**
- Use same app-release.aab from Google Play
- Or generate APK: `bubblewrap build --skipPwaValidation --outputFormat apk`

### 3.6 Declare Permissions & Privacy

**Privacy & Security:**
- Link to privacy policy: https://stuaps.vercel.app/legal/privacy
- Declare data handling: financial & personal data (student records)
- Content rating: Not for children, handles business data

**Permissions to Declare:**
- Internet (required for API calls)
- Network state (check connectivity)
- NO camera, location, or microphone access

### 3.7 Submit for Review

**Steps:**
1. Complete all sections (green checkmarks)
2. Click "Submit for review"
3. Add review notes: "v1.0.0 - Initial release. PWA-based app for student accommodation management."
4. Confirm and submit

**Review Time:** Huawei typically reviews within 2-5 days.

---

## Part 4: Post-Launch Management

### 4.1 Monitoring & Feedback

**Google Play Console:**
- Check reviews daily for first week
- Monitor crash reports
- Review performance metrics (installs, uninstalls, ratings)
- Respond to user reviews professionally

**Huawei AppGallery Connect:**
- Monitor installation rates
- Check user ratings and feedback
- Respond to negative reviews promptly

### 4.2 Updates & Versioning

**Version Scheme:**
- Current: 1.0.0
- Next: 1.0.1 (bug fixes)
- Then: 1.1.0 (minor features)
- Major: 2.0.0 (significant features)

**Release Process:**

```bash
# 1. Update version in package.json
# "version": "1.0.1"

# 2. Update versionCode in Bubblewrap (Android)
# versionCode increments by 1 each release

# 3. Build new bundle
bubblewrap build --skipPwaValidation

# 4. Upload to Google Play Console
# → Release → Production → Upload new bundle

# 5. Upload to Huawei AppGallery Connect
# → Versions → Upload new APK

# 6. Commit to git
git add package.json
git commit -m "Release v1.0.1 - bug fixes"
git tag v1.0.1
git push origin main --tags
```

### 4.3 App Store Optimization (ASO)

**To improve rankings:**

1. **Maintain high ratings:**
   - Respond to reviews
   - Fix bugs quickly
   - Add features users request

2. **Keywords:**
   - "student accommodation"
   - "invoice management"
   - "billing software"
   - "pest control tracking"
   - "student housing"
   - "reconciliation"

3. **Updates & Changelog:**
   - Release updates regularly (every 2-4 weeks)
   - Write clear release notes
   - Fix bugs and add small features

4. **Screenshots & Description:**
   - Keep updated with latest features
   - Use high-quality, professional screenshots
   - Update description as features improve

### 4.4 Handling Rejections

**If rejected, you'll receive:**
- Reason for rejection
- What to fix
- Time to resubmit (usually 7-14 days)

**Common issues & fixes:**

| Issue | Fix |
|-------|-----|
| **Broken privacy policy link** | Ensure URL accessible, no 404s |
| **App crashes on launch** | Test on Android emulator, check logs |
| **Misleading description** | Align description with actual features |
| **Missing permissions declaration** | Declare all data access in store listing |
| **Generic/placeholder content** | Replace with real app screenshots |

**Resubmission:**
1. Fix the issue
2. Bump version code (1001 → 1002)
3. Rebuild and upload new APK
4. Submit with note: "Fixed [specific issue]"

---

## Part 5: Marketing Strategy

### 5.1 Launch Day

**Email Campaign:**
- Announce to existing users
- Provide download links to both stores
- Highlight mobile-specific features

**Social Media (LinkedIn for B2B):**
- "STUAPS is now available on Google Play and Huawei App Gallery! Manage your student accommodation business from your phone."
- Share link: https://play.google.com/store/apps/details?id=com.stuaps.app

**In-App Announcement:**
- Banner in web app: "📱 Download STUAPS mobile app for iOS-like experience"
- Deep link to play stores

### 5.2 Ongoing Marketing

**Monthly (Recurring):**
- Feature one feature per week on social media
- Share user testimonials
- Highlight new features
- Engage with user reviews

**Quarterly:**
- Release product updates
- Gather user feedback
- Plan next feature releases

### 5.3 Rating & Review Generation

**Strategies:**
- Ask satisfied users to rate app (after first successful payment)
- Include in onboarding: "Rate STUAPS if you find it useful"
- Provide excellent support to earn positive reviews
- Respond to every review (especially negative ones)

**Target Ratings:**
- Google Play: Aim for 4.5+ stars
- Huawei: Aim for 4.5+ stars

---

## Part 6: Troubleshooting

### Issue: App crashes on launch

**Causes:**
- Incompatible Android version
- Missing permissions
- Network connectivity issue

**Fix:**
- Test on Android emulator (Android 9+)
- Check console logs: `bubblewrap build --verbose`
- Verify network requests working
- Use Chrome DevTools to debug

### Issue: Store says "incompatible with device"

**Causes:**
- targetSdkVersion too high
- CPU architecture not supported (arm64-v8a, armeabi-v7a)

**Fix:**
- Bubblewrap sets reasonable defaults
- Verify: `app/build.gradle`
- Rebuild and resubmit

### Issue: Privacy policy link returns 404

**Fix:**
1. Ensure URL is correct: https://stuaps.vercel.app/legal/privacy
2. Test in browser (must be accessible)
3. Deploy markdown files to public folder if needed
4. Update store listing with working URL

### Issue: Slow first load

**Optimize:**
- App shell caching improves after first load
- Subsequent loads should be instant
- Service worker enables offline availability
- Set user expectations in description

---

## Checklists

### Pre-Launch Checklist

- [ ] Version bumped to 1.0.0
- [ ] All three legal documents created
- [ ] Legal documents deployed to web (accessible via HTTPS)
- [ ] Screenshots captured (2-5 per store)
- [ ] App icon and feature graphics ready
- [ ] Bubblewrap installed and configured
- [ ] APK/Bundle built successfully
- [ ] App tested on Android emulator
- [ ] All permissions declared
- [ ] Contact email and website correct
- [ ] Content rating completed

### Google Play Launch Checklist

- [ ] Google Play Developer account created ($25 paid)
- [ ] App created in Google Play Console
- [ ] Store listing completed with description
- [ ] Screenshots and assets uploaded
- [ ] App bundle uploaded and tested
- [ ] Privacy policy linked
- [ ] All required fields marked complete (green checkmarks)
- [ ] Submitted for review
- [ ] Monitoring review status

### Huawei App Gallery Launch Checklist

- [ ] Huawei Developer account created (free)
- [ ] App created in AppGallery Connect
- [ ] Store listing completed
- [ ] Screenshots and assets uploaded
- [ ] APK or PWA option configured
- [ ] Privacy policy linked
- [ ] Submitted for review
- [ ] Monitoring review status

### Post-Launch Checklist

- [ ] Both apps published and visible in stores
- [ ] Download links verified
- [ ] Install and test full app flow
- [ ] Monitor reviews and ratings daily
- [ ] Respond to first reviews
- [ ] Track download numbers
- [ ] Gather user feedback
- [ ] Plan next features/fixes

---

## Support & Resources

**Bubblewrap Documentation:**
- https://github.com/GoogleChromeLabs/bubblewrap

**Google Play Console Help:**
- https://support.google.com/googleplay/android-developer/

**Huawei AppGallery Developer Docs:**
- https://developer.huawei.com/consumer/en/doc/development/appgallery-connect-guides/agcconnect-getstarted/

**PWA Optimization:**
- https://web.dev/install/

---

## Next Steps

1. ✅ Update `package.json` with version 1.0.0 ✓ (Done)
2. ✅ Create legal documents ✓ (Done)
3. 📝 Deploy legal documents to web
4. 📷 Capture 5 app screenshots
5. 🎨 Create feature graphic (1024×500)
6. 🔧 Install Bubblewrap locally
7. 📦 Build signed APK/Bundle
8. 👤 Create Google Play Developer account
9. 👤 Create Huawei Developer account
10. 🚀 Submit both apps for review
11. ⏰ Monitor review process (typically 1-5 days)
12. 📱 Launch and celebrate!

---

**Ready to ship? Let's make it happen! 🚀**

For questions: support@stuaps.com
