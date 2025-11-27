# 📱 Firebase Purchase Notification System

Realtime push notification system for iOS in-app purchases and subscriptions using Firebase Analytics, Firestore, Cloud Functions, and Cloud Messaging.

## 🎯 Overview

This system automatically:
1. ✅ Monitors all StoreKit transactions (purchases & subscriptions) in your iOS apps
2. ✅ Logs purchase data to Firestore and Firebase Analytics
3. ✅ Triggers Cloud Functions when new purchases occur
4. ✅ Sends realtime push notifications to your admin device(s) with purchase details

## 📋 Prerequisites

- Existing iOS app(s) with Firebase already integrated
- Firebase project with these services enabled:
  - ✓ Cloud Firestore
  - ✓ Firebase Analytics
  - ✓ Cloud Functions
  - ✓ Cloud Messaging (FCM)
- Node.js 18+ (for deploying Cloud Functions)
- Firebase CLI (`npm install -g firebase-tools`)
- Xcode 14+ (iOS 15+ required for StoreKit 2)

## 🚀 Setup Instructions

### Part 1: Deploy Cloud Functions

1. **Initialize Firebase in this directory (if not already done):**
   ```bash
   firebase login
   firebase init
   ```
   - Select your existing Firebase project
   - Choose "Functions" and "Firestore"
   - Select JavaScript
   - Install dependencies when prompted

2. **Install function dependencies:**
   ```bash
   cd functions
   npm install
   cd ..
   ```

3. **Deploy Firestore security rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

4. **Deploy Cloud Functions:**
   ```bash
   firebase deploy --only functions
   ```

   This deploys three functions:
   - `onPurchaseCreated` - Triggers on new purchases and sends notifications
   - `subscribeToAdminNotifications` - Subscribes devices to admin topic
   - `unsubscribeFromAdminNotifications` - Unsubscribes devices

### Part 2: Integrate into Your Existing iOS Apps

#### A. Add Purchase Tracking (to apps that make sales)

1. **Add the file to your project:**
   - Copy `PurchaseNotificationManager.swift` to your iOS app project
   - Add it to your Xcode project

2. **Ensure Firebase dependencies are installed:**

   **Using Swift Package Manager (recommended):**
   - In Xcode: File → Add Package Dependencies
   - Add: `https://github.com/firebase/firebase-ios-sdk`
   - Select modules:
     - FirebaseFirestore
     - FirebaseAnalytics

   **Using CocoaPods:**
   ```ruby
   pod 'Firebase/Firestore'
   pod 'Firebase/Analytics'
   ```

3. **Initialize in your App/AppDelegate:**

   **SwiftUI:**
   ```swift
   import SwiftUI
   import Firebase

   @main
   struct YourApp: App {
       init() {
           FirebaseApp.configure()

           Task { @MainActor in
               PurchaseNotificationManager.shared.startObserving()
           }
       }

       var body: some Scene {
           WindowGroup {
               ContentView()
           }
       }
   }
   ```

   **UIKit:**
   ```swift
   import UIKit
   import Firebase

   @main
   class AppDelegate: UIResponder, UIApplicationDelegate {
       func application(_ application: UIApplication,
                        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

           FirebaseApp.configure()

           Task { @MainActor in
               PurchaseNotificationManager.shared.startObserving()
           }

           return true
       }
   }
   ```

4. **That's it!** The manager will now automatically track all purchases and subscriptions.

#### B. Setup Admin App (to receive notifications)

This is the app YOU use to receive notifications about purchases from all your apps.

1. **Add the file to your admin app:**
   - Copy `AdminNotificationSubscriber.swift` to your admin app project
   - Add it to your Xcode project

2. **Ensure Firebase dependencies are installed:**

   **Using Swift Package Manager:**
   - Add modules:
     - FirebaseMessaging
     - FirebaseFunctions
     - FirebaseAuth (optional, for security)

   **Using CocoaPods:**
   ```ruby
   pod 'Firebase/Messaging'
   pod 'Firebase/Functions'
   ```

3. **Enable Push Notifications capability:**
   - In Xcode, select your target
   - Go to "Signing & Capabilities"
   - Click "+ Capability"
   - Add "Push Notifications"
   - Add "Background Modes" and check "Remote notifications"

4. **Configure APNs (Apple Push Notification service):**
   - Go to [Apple Developer Portal](https://developer.apple.com)
   - Create/update your App ID with Push Notifications enabled
   - Create an APNs Key (or certificate)
   - Upload the APNs key to Firebase Console:
     - Go to Project Settings → Cloud Messaging
     - Under "Apple app configuration", upload your APNs Auth Key

5. **Initialize in your admin app:**

   See the complete integration example in `AdminNotificationSubscriber.swift` file (commented at the bottom).

   **Quick SwiftUI example:**
   ```swift
   import SwiftUI
   import Firebase

   @main
   struct AdminApp: App {
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

## 📊 Data Structure

### Firestore Collection: `purchases`

Each purchase document contains:

```javascript
{
  transactionId: "123456789",           // StoreKit transaction ID
  productId: "com.yourapp.premium",     // Product identifier
  purchaseDate: Timestamp,              // When purchase occurred
  purchaseType: "subscription",         // "subscription", "purchase", etc.
  appIdentifier: "com.yourapp.main",    // Which app made the purchase
  environment: "production",            // "production" or "sandbox"
  isBackfill: false,                    // True if from initial transaction check
  price: 9.99,                          // Price (if available)
  currencyCode: "USD",                  // Currency code
  displayPrice: "$9.99",                // Localized price string
  expirationDate: Timestamp,            // For subscriptions
  revocationDate: null,                 // If purchase was revoked
  timestamp: ServerTimestamp            // Server-side timestamp
}
```

## 🔔 Notification Format

When a purchase occurs, you'll receive a notification like:

**Title:** `💰 Purchase - $9.99`
**Body:**
```
New purchase in com.yourapp.main
Product: com.yourapp.premium
Env: production
```

For subscriptions:

**Title:** `🔄 Subscription - $4.99`
**Body:**
```
New subscription in com.yourapp.main
Product: com.yourapp.monthly
Env: production
```

## 🧪 Testing

### Test in Sandbox Environment

1. **Build your app in DEBUG mode** (uses sandbox environment automatically)
2. **Sign in with a Sandbox Apple ID** in Settings → App Store
3. **Make a test purchase** in your app
4. **Check logs:**
   ```
   ✅ Purchase logged to Firestore: abc123
   📊 Purchase logged to Firebase Analytics
   ```
5. **Check your admin device** for the push notification

### Test Cloud Functions Locally

```bash
cd functions
npm run serve
```

Then trigger a test by manually adding a document to Firestore.

### View Logs

**Firebase Console:**
- Go to Firebase Console → Functions → Logs

**Command line:**
```bash
firebase functions:log
```

## 🔒 Security Considerations

1. **Firestore Rules:** The included `firestore.rules` allows authenticated users to create purchases. Adjust based on your needs.

2. **Admin Topic Security:** Only trusted devices should subscribe to the `admin-purchases` topic. Consider:
   - Adding authentication to the subscribe/unsubscribe functions
   - Using Firebase App Check to prevent abuse
   - Implementing admin user verification

3. **Transaction Verification:** The code uses StoreKit 2's built-in verification. For additional security, consider server-side receipt validation.

## 📈 Optional Enhancements

### Enable Daily Summary Notifications

Uncomment the `dailyPurchaseSummary` function in `functions/index.js` to receive daily purchase summaries at 9 AM UTC.

### Custom App Identifiers

To distinguish between multiple apps, customize the app identifier in each app:

```swift
// In your app
PurchaseNotificationManager.Configuration.appIdentifier = "My Shopping App"
```

### Analytics Dashboard

All purchases are also logged to Firebase Analytics. View them in:
- Firebase Console → Analytics → Events → `purchase`

## 🐛 Troubleshooting

### No notifications received

1. **Check Cloud Functions logs:**
   ```bash
   firebase functions:log
   ```

2. **Verify the function deployed:**
   ```bash
   firebase functions:list
   ```

3. **Check device is subscribed:**
   - Look for log: `✅ Subscribed to admin notifications`

4. **Check APNs configuration:**
   - Firebase Console → Project Settings → Cloud Messaging
   - Verify APNs key is uploaded

5. **Test notification manually:**
   ```bash
   # Install Firebase CLI
   npm install -g firebase-tools

   # Send test message
   firebase messaging:send --topic admin-purchases \
     --notification '{"title":"Test","body":"Testing notifications"}'
   ```

### Purchases not logged to Firestore

1. **Check Firestore rules** allow writes
2. **Verify Firebase is configured** in your app
3. **Check console logs** for errors
4. **Ensure StoreKit 2 is available** (iOS 15+)

### "Backfilled" purchases sending notifications

This is normal on first launch. The code skips backfilled transactions automatically:

```swift
if isBackfill {
    console.log('Skipping notification for backfilled transaction')
    return null;
}
```

## 📁 File Reference

- `PurchaseNotificationManager.swift` - Add to your sales apps
- `AdminNotificationSubscriber.swift` - Add to your admin app
- `functions/index.js` - Cloud Functions (deploy to Firebase)
- `functions/package.json` - Dependencies
- `firestore.rules` - Security rules
- `README.md` - This file

## 🆘 Support

If you encounter issues:

1. Check Firebase Console → Functions → Logs
2. Check Xcode console for app logs
3. Verify all Firebase services are enabled
4. Ensure APNs is properly configured

## 📝 License

This code is provided as-is for integration into your projects.

---

**Built with ❤️ using Firebase, StoreKit 2, and Swift**
