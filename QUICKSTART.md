# 🚀 Quick Start Guide

## For Your Existing Apps (5 minutes)

### Step 1: Deploy Cloud Functions
```bash
# Login to Firebase
firebase login

# Initialize project (if needed)
firebase init

# Deploy
firebase deploy --only functions,firestore:rules
```

### Step 2: Add to Your Sales Apps
1. Copy `PurchaseNotificationManager.swift` to your app
2. Add these imports to your AppDelegate or App struct:
   ```swift
   import Firebase
   ```
3. Add one line after `FirebaseApp.configure()`:
   ```swift
   Task { @MainActor in
       PurchaseNotificationManager.shared.startObserving()
   }
   ```

**That's it for sales apps!** ✅

### Step 3: Setup Your Admin App

1. Copy `AdminNotificationSubscriber.swift` to your admin app
2. Enable "Push Notifications" capability in Xcode
3. Upload APNs key to Firebase Console
4. Add after `FirebaseApp.configure()`:
   ```swift
   UNUserNotificationCenter.current().delegate = self

   Task { @MainActor in
       await AdminNotificationSubscriber.shared.configure()
   }
   ```
5. Implement `UNUserNotificationCenterDelegate` (see example in the file)

**Done!** ✅

## Test It

1. Run your sales app in DEBUG mode
2. Make a test purchase with a sandbox Apple ID
3. Check your admin device for a notification! 🔔

## Notification Format

**You'll see:**
- Title: `💰 Purchase - $9.99`
- Body: `New purchase in com.yourapp.main`
- Sound & Badge ✓

## Need Help?

See full `README.md` for:
- Detailed setup instructions
- Troubleshooting guide
- Security considerations
- Optional features

## Files You Need

- **Sales apps:** `PurchaseNotificationManager.swift`
- **Admin app:** `AdminNotificationSubscriber.swift`
- **Deploy once:** `functions/` directory

That's all! 🎉
