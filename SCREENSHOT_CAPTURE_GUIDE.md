# Screenshot Capture Guide for STUAPS App Store

**Target Size:** 1080×1920 pixels (mobile portrait)  
**Format:** PNG  
**Quantity Needed:** 5 high-quality screenshots  
**Time Estimate:** 30-45 minutes

---

## Quick Setup

### Option 1: Local Development (Recommended)

```bash
# Clone repo to your machine
git clone https://github.com/phalipitse/STUAPS.git
cd STUAPS

# Install dependencies
npm install

# Start dev server
npm run dev:client
# Opens at http://localhost:5173
```

### Option 2: Live Production App

Simply open: **https://stuaps.vercel.app**

*(Production already has demo data ready to use)*

---

## Screenshot Capture Method

### Using Chrome DevTools Mobile Emulation

**Steps:**

1. **Open the app** in Chrome:
   - Local: http://localhost:5173
   - Or live: https://stuaps.vercel.app

2. **Enable Mobile Emulation:**
   - Press `F12` to open DevTools
   - Press `Ctrl+Shift+M` (Windows/Linux) or `Cmd+Shift+M` (Mac)
   - Or click ☰ → More Tools → Device Toolbar

3. **Set Device & Resolution:**
   - Click "Responsive" dropdown
   - Select "Pixel 5" (or any 1080×1920 device)
   - Resolution: 1080×1920

4. **Take Screenshot:**
   - Chrome DevTools → ⋮ → More tools → Screenshots
   - Select "Capture screenshot"
   - Automatically saves as PNG to Downloads

5. **Crop to 1080×1920:**
   - Open screenshot in image editor (Preview, GIMP, Photoshop)
   - Verify dimensions are exactly 1080×1920
   - If taller, crop top/bottom equally

**Tip:** Each screenshot should show one key feature, with minimal scrolling needed.

---

## Required Screenshots (In Order)

### Screenshot 1: Login/Welcome
**Purpose:** First impression, show branding

**Steps:**
1. Navigate to: http://localhost:5173 (or stuaps.vercel.app)
2. You should see login screen
3. Capture screenshot (full height, logo + login form visible)

**What to show:**
- STUAPS logo/branding
- Login fields (email, password)
- "Sign up" link
- Professional, clean design

**Caption for store:** "Secure login for accommodation providers"

---

### Screenshot 2: Billing Dashboard
**Purpose:** Main feature - revenue tracking

**Steps:**
1. Login with demo credentials:
   - Username: `demo`
   - Password: `demo123`
2. Navigate to "Billing" page
3. Scroll to see:
   - Subscription status (Active)
   - Usage stats (Students billed: X/50)
   - Next billing date
4. Capture screenshot showing dashboard overview

**What to show:**
- Subscription plan (Monthly/Annual)
- Student usage (X/50 included)
- Overage calculation
- Next billing amount
- Charge history table

**Caption for store:** "Track subscription usage and billing at a glance"

---

### Screenshot 3: Outstanding Invoices Report
**Purpose:** Revenue recovery - core feature

**Steps:**
1. In sidebar, click "Reports"
2. Select "Outstanding" tab
3. Scroll to see student list with:
   - Student names
   - Outstanding amounts
   - "Request payment" buttons
4. Capture screenshot

**What to show:**
- List of students with outstanding invoices
- Amount owed per student
- "Request payment" call-to-action
- Clean table layout
- Ability to generate demand letters

**Caption for store:** "Generate payment demand letters for outstanding invoices"

---

### Screenshot 4: Pest Control Tracking
**Purpose:** Compliance feature - property maintenance

**Steps:**
1. In sidebar, click "Pest Control"
2. Scroll to see properties with:
   - Property names (North Wing, South Wing)
   - Last treatment date
   - Next due date
   - Status badges (Overdue, Due soon, Up to date)
3. Capture screenshot

**What to show:**
- Properties listed
- Treatment history
- Due dates
- Status indicators (colors)
- "Log treatment" button
- "Find pest control nearby" link

**Caption for store:** "Track pest control treatments and compliance schedules"

---

### Screenshot 5: Student Management
**Purpose:** Multi-feature view - organization

**Steps:**
1. In sidebar, click "Students"
2. Show student list with:
   - Student names & numbers
   - Contact info (if visible)
   - Associated properties
3. Scroll to show multiple students
4. Capture screenshot

**What to show:**
- Student list with details
- Search/filter capability (if visible)
- Clean, organized layout
- "Add student" button
- Professional appearance

**Caption for store:** "Manage students and their accommodation records"

---

## Optional Screenshots (If you want more)

### Screenshot 6: Property Management
- Show properties list
- Multiple institutions support
- Edit/add property functionality
- **Caption:** "Manage multiple properties and institutions"

### Screenshot 7: Mobile-Optimized Feature
- Show any modal or form working well on mobile
- Demonstrate responsive design
- **Caption:** "Fully responsive design - works on all devices"

---

## Image Editing After Capture

### Crop to Exact Size
```bash
# Using ImageMagick (command line)
convert screenshot.png -crop 1080x1920+0+0 cropped.png

# Using Python PIL
python3 << 'EOF'
from PIL import Image
img = Image.open("screenshot.png")
cropped = img.crop((0, 0, 1080, 1920))
cropped.save("cropped.png")
EOF
```

### Add Captions (Optional but Recommended)

**Using GIMP:**
1. Open screenshot
2. Tools → Text
3. Add caption at bottom (white text, semi-transparent background)
4. Examples:
   - "Check outstanding invoices"
   - "Track pest control schedules"
   - "Manage student billing"

**Using Photoshop/Canva:**
- Add text layer at bottom
- Font: 16-20pt, white, centered
- Background: 50% transparent black bar

### Save for App Stores

**Before uploading, ensure:**
- ✅ Dimensions: 1080×1920 pixels (exactly)
- ✅ Format: PNG
- ✅ File size: < 5MB (usually auto-compressed)
- ✅ Quality: High (no pixelation)
- ✅ Captions: Readable, not covering important UI

**File naming:**
```
stuaps-screenshot-1-login.png
stuaps-screenshot-2-billing.png
stuaps-screenshot-3-outstanding.png
stuaps-screenshot-4-pest-control.png
stuaps-screenshot-5-students.png
```

---

## Upload to App Stores

### Google Play Console

1. Go to your app → Store Listing → Screenshots
2. Click "Add screenshot"
3. Upload each PNG (1080×1920)
4. Add description/caption for each
5. Google auto-resizes for different device types
6. Preview on different phones (shows in console)

### Huawei App Gallery

1. Go to app info → Screenshots
2. Upload same PNGs (1080×1920)
3. Add captions
4. Preview across Huawei devices

---

## Pro Tips

### Make Screenshots Stand Out

1. **Clear Content:**
   - Ensure UI is not cluttered
   - Highlight key features
   - Avoid sensitive data (blur if needed)

2. **Consistent Branding:**
   - Use STUAPS colors (Blue #1D4ED8)
   - Maintain app theme
   - Professional presentation

3. **User Context:**
   - Show realistic demo data (students, invoices)
   - Display full features (not empty states)
   - Feature active subscription/billing

4. **Mobile-Optimized:**
   - Text readable without zooming
   - Buttons/CTAs clearly visible
   - No horizontal scrolling needed

### Demo Data Tips

- **Demo account ready to use:**
  - Username: `demo`
  - Password: `demo123`
  - Includes 52 students, 3 invoices, pest control records
  
- **All demo data is realistic:**
  - Valid student numbers
  - Real invoice amounts (R4,600/student)
  - Proper date ranges (90-day window)
  - Complete billing information

### Avoid These Mistakes

❌ **Don't:**
- Screenshot at wrong resolution (use 1080×1920 exactly)
- Include personal real data (use demo account)
- Show error messages or crashes
- Blur critical features
- Use very small text (unreadable in screenshots)
- Include browser chrome (address bar, tabs)

✅ **Do:**
- Use demo credentials (pre-populated data)
- Show clean, functional UI
- Use consistent device (Pixel 5 emulation)
- Highlight key features in each screenshot
- Add clear captions describing features

---

## Alternative: Screenshot Tools

### If Chrome DevTools doesn't work:

**Online Screenshot Tools:**
- https://responsively.app/ (Free, precise sizing)
- https://www.browserstack.com/screenshots (Free tier)
- https://litmus.com/screenshots (Screenshot service)

**Mobile Emulators:**
- Android Studio Emulator (more realistic)
- Xcode Simulator (if on Mac)

**Simple Method:**
- Open on actual phone (if available)
- Screenshot at native resolution
- Crop to 1080×1920 in image editor

---

## Checklist Before Upload

- [ ] 5 screenshots captured (1080×1920 each)
- [ ] All PNGs are high quality (no pixelation)
- [ ] Each screenshot shows different feature
- [ ] Screenshots use demo account (demo/demo123)
- [ ] No sensitive real data visible
- [ ] Captions are clear and descriptive
- [ ] File naming is consistent
- [ ] Files are < 5MB each
- [ ] Verified on mobile phone (if possible)
- [ ] Ready to upload to stores

---

## Timeline

| Step | Time |
|------|------|
| Setup (dev server or login) | 5 min |
| Enable mobile emulation | 2 min |
| Capture 5 screenshots | 15 min |
| Add captions (optional) | 10 min |
| Crop/verify sizes | 5 min |
| **Total** | **~35 minutes** |

---

## Need Help?

**If screenshots don't look good:**
1. Verify resolution is exactly 1080×1920
2. Check that demo data is loading (login with demo/demo123)
3. Try different device (Pixel 5, Pixel 4a, etc.)
4. Ensure DevTools is in mobile portrait mode
5. Zoom out if text is too small (Chrome zoom: Ctrl+Minus)

**If login fails:**
1. Try production app: https://stuaps.vercel.app
2. Demo account: demo / demo123
3. Check internet connection
4. Try incognito window (clears cache)

**If you need different data:**
- Production already has demo data seeded
- Screenshots will show: 52 students, 3 invoices, pest control records
- All data is realistic and test-safe

---

## Ready to Capture?

1. **Open Chrome** and go to: http://localhost:5173 (or live: https://stuaps.vercel.app)
2. **Press F12** to open DevTools
3. **Press Ctrl+Shift+M** (Cmd+Shift+M on Mac) for mobile view
4. **Follow the 5 screenshot steps** above
5. **Save PNGs** to a folder
6. **Upload to both app stores**

Good luck! Your screenshots will help users understand STUAPS's key features. 📸
