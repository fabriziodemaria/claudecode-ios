# 📱 BookLingo Purchase Notification Integration Guide

## ⏱️ 5-Minute Setup

### Step 1: Add the Tracker to BookLingo (1 minute)

1. **Open your BookLingo Xcode project**

2. **Add `PurchaseNotificationTracker.swift`** to your project:
   - Copy from: `/home/user/claudecode-ios/PurchaseNotificationTracker.swift`
   - Drag into Xcode or use File → Add Files to "BookLingo"
   - Make sure "Copy items if needed" is checked
   - Add to your app target

### Step 2: Update Your Purchase Tracking Code (2 minutes)

**Find where you currently log purchases** - search your project for:
```swift
logEvent(AnalyticsEventPurchase
```

You should find code that looks like this:
```swift
var params: [String: Any] = [
    AnalyticsParameterCurrency: currency,
    AnalyticsParameterValue: price * Double(quantity),
    AnalyticsParameterItems: [
        [
            AnalyticsParameterItemID: itemID,
            AnalyticsParameterItemName: itemName,
            AnalyticsParameterQuantity: quantity,
            AnalyticsParameterPrice: price
        ]
    ]
]
if let transactionId { params[AnalyticsParameterTransactionID] = transactionId }
if let affiliation { params[AnalyticsParameterAffiliation] = affiliation }
logEvent(AnalyticsEventPurchase, parameters: params)
```

**Add ONE line after your `logEvent()` call:**
```swift
logEvent(AnalyticsEventPurchase, parameters: params)

// Add this line:
PurchaseNotificationTracker.track(params)  // ✅ Send notification
```

That's it! Do this for every place where you log purchase events.

### Step 3: Verify Firestore Dependency (30 seconds)

Make sure BookLingo has Firebase Firestore installed:

**If using Swift Package Manager:**
- Check that `FirebaseFirestore` is in your package dependencies
- If not, add it from `https://github.com/firebase/firebase-ios-sdk`

**If using CocoaPods:**
- Check your Podfile has: `pod 'Firebase/Firestore'`
- If not, add it and run `pod install`

### Step 4: Deploy Cloud Functions (1 minute)

**One-time setup** - deploy the Cloud Functions that send notifications:

```bash
cd /home/user/claudecode-ios

# Login to Firebase (if not already)
firebase login

# Initialize (select your Firebase project)
firebase init

# Deploy
firebase deploy --only functions,firestore:rules
```

The functions will now listen for purchases and send notifications!

### Step 5: Setup Your Admin App (1 minute)

**On the device where YOU want to receive notifications:**

1. **Add `AdminNotificationSubscriber.swift`** to that app:
   - Copy from: `/home/user/claudecode-ios/AdminNotificationSubscriber.swift`
   - This can be BookLingo itself, or a separate admin app

2. **Enable Push Notifications** in Xcode:
   - Select your target → Signing & Capabilities
   - Add "Push Notifications" capability
   - Add "Background Modes" → check "Remote notifications"

3. **Upload APNs key to Firebase:**
   - Go to [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
   - Create an APNs key (or use existing)
   - Download the .p8 file
   - Go to [Firebase Console](https://console.firebase.google.com) → Project Settings → Cloud Messaging
   - Upload your APNs key under "Apple app configuration"

4. **Add this code to your App or AppDelegate:**

**SwiftUI App:**
```swift
import SwiftUI
import Firebase
import UserNotifications

@main
struct BookLingoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {

        FirebaseApp.configure()
        UNUserNotificationCenter.current().delegate = self

        // Subscribe to purchase notifications
        Task { @MainActor in
            await AdminNotificationSubscriber.shared.configure()
        }

        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    // Show notifications even when app is in foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                               willPresent notification: UNNotification,
                               withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }
}
```

**UIKit AppDelegate:**
```swift
import UIKit
import Firebase
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

        FirebaseApp.configure()
        UNUserNotificationCenter.current().delegate = self

        // Subscribe to purchase notifications
        Task { @MainActor in
            await AdminNotificationSubscriber.shared.configure()
        }

        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }
}

extension AppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                               willPresent notification: UNNotification,
                               withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }
}
```

## ✅ Test It!

1. **Run BookLingo** in DEBUG mode
2. **Make a test purchase** (use sandbox Apple ID)
3. **Check Xcode console** for:
   ```
   ✅ Purchase logged to Firestore for notification: abc123
   ```
4. **Check your admin device** for a notification! 🔔

## 🔔 Expected Notification

**You'll see:**
```
💰 Purchase - USD 9.99
Premium Monthly (x1)
App: BookLingo
Env: sandbox
```

## 🎯 What Happens Behind the Scenes

```
BookLingo Purchase
      ↓
logEvent() → Firebase Analytics ✓
      ↓
PurchaseNotificationTracker.track() → Firestore
      ↓
Cloud Function Trigger
      ↓
FCM Push Notification → Your Device 🔔
```

## 🐛 Troubleshooting

**No notification received?**
1. Check Xcode console for "✅ Purchase logged to Firestore"
2. Check Firebase Console → Functions → Logs for errors
3. Verify APNs key is uploaded to Firebase
4. Check device has notification permissions granted

**"Error logging purchase"?**
1. Make sure Firestore is added to your Firebase project
2. Check firestore.rules were deployed
3. Verify Firebase is configured in your app

**Need help?** Check the full README at `/home/user/claudecode-ios/README.md`

## 📁 Files You Need

From `/home/user/claudecode-ios/`:
- ✅ `PurchaseNotificationTracker.swift` → Add to BookLingo
- ✅ `AdminNotificationSubscriber.swift` → Add to admin app
- ✅ `functions/` directory → Already deployed to Firebase

---

**Total Integration Time: ~5 minutes** ⚡

Once set up, you'll get instant notifications every time someone makes a purchase in BookLingo!
