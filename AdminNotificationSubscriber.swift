//
//  AdminNotificationSubscriber.swift
//  Admin Notification Subscriber
//
//  Add this to your admin app (the app where YOU want to receive notifications)
//  to subscribe to purchase notifications from all your apps.
//

import Foundation
import FirebaseMessaging
import FirebaseCore
import UserNotifications

/// Manages admin device subscription to purchase notifications
@MainActor
class AdminNotificationSubscriber: NSObject {

    // MARK: - Singleton
    static let shared = AdminNotificationSubscriber()

    // MARK: - Properties
    private var fcmToken: String?

    // MARK: - Initialization
    private override init() {
        super.init()
    }

    // MARK: - Public Methods

    /// Request notification permissions and configure FCM
    /// Call this in your AppDelegate or App struct
    func configure() async {
        // Request notification permissions
        await requestNotificationPermissions()

        // Set up FCM delegate
        Messaging.messaging().delegate = self

        // Get FCM token
        do {
            let token = try await Messaging.messaging().token()
            self.fcmToken = token
            print("📱 FCM Token: \(token)")

            // Automatically subscribe to admin notifications
            await subscribeToAdminNotifications()

        } catch {
            print("❌ Error fetching FCM token: \(error.localizedDescription)")
        }
    }

    /// Subscribe this device to admin purchase notifications
    func subscribeToAdminNotifications() async {
        guard let token = fcmToken else {
            print("⚠️ No FCM token available")
            return
        }

        do {
            // Subscribe to topic locally (backup method)
            try await Messaging.messaging().subscribe(toTopic: "admin-purchases")

            // Also call Cloud Function for additional subscription
            // This ensures the subscription is registered on the server
            let functions = Functions.functions()
            let callable = functions.httpsCallable("subscribeToAdminNotifications")

            let result = try await callable.call(["token": token])
            print("✅ Subscribed to admin notifications: \(result)")

        } catch {
            print("❌ Error subscribing to admin notifications: \(error.localizedDescription)")
        }
    }

    /// Unsubscribe this device from admin purchase notifications
    func unsubscribeFromAdminNotifications() async {
        guard let token = fcmToken else {
            print("⚠️ No FCM token available")
            return
        }

        do {
            // Unsubscribe from topic locally
            try await Messaging.messaging().unsubscribe(fromTopic: "admin-purchases")

            // Call Cloud Function
            let functions = Functions.functions()
            let callable = functions.httpsCallable("unsubscribeFromAdminNotifications")

            let result = try await callable.call(["token": token])
            print("✅ Unsubscribed from admin notifications: \(result)")

        } catch {
            print("❌ Error unsubscribing from admin notifications: \(error.localizedDescription)")
        }
    }

    // MARK: - Private Methods

    /// Request notification permissions from the user
    private func requestNotificationPermissions() async {
        do {
            let center = UNUserNotificationCenter.current()
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])

            if granted {
                print("✅ Notification permissions granted")

                // Register for remote notifications
                await UIApplication.shared.registerForRemoteNotifications()
            } else {
                print("⚠️ Notification permissions denied")
            }
        } catch {
            print("❌ Error requesting notification permissions: \(error.localizedDescription)")
        }
    }
}

// MARK: - MessagingDelegate
extension AdminNotificationSubscriber: MessagingDelegate {

    /// Called when FCM token is refreshed
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }

        Task { @MainActor in
            self.fcmToken = token
            print("🔄 FCM Token refreshed: \(token)")

            // Re-subscribe with new token
            await subscribeToAdminNotifications()
        }
    }
}

// MARK: - AppDelegate Integration
/*

 Add this to your AppDelegate (UIKit):

 import UIKit
 import Firebase
 import UserNotifications

 @main
 class AppDelegate: UIResponder, UIApplicationDelegate {

     func application(_ application: UIApplication,
                      didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

         // Configure Firebase
         FirebaseApp.configure()

         // Set UNUserNotificationCenter delegate
         UNUserNotificationCenter.current().delegate = self

         // Configure admin notifications
         Task { @MainActor in
             await AdminNotificationSubscriber.shared.configure()
         }

         return true
     }

     func application(_ application: UIApplication,
                      didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
         // Pass device token to FCM
         Messaging.messaging().apnsToken = deviceToken
     }

     func application(_ application: UIApplication,
                      didFailToRegisterForRemoteNotificationsWithError error: Error) {
         print("Failed to register for remote notifications: \(error.localizedDescription)")
     }
 }

 extension AppDelegate: UNUserNotificationCenterDelegate {

     // Handle notification when app is in foreground
     func userNotificationCenter(_ center: UNUserNotificationCenter,
                                 willPresent notification: UNNotification,
                                 withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
         // Show notification even when app is in foreground
         completionHandler([.banner, .sound, .badge])
     }

     // Handle notification tap
     func userNotificationCenter(_ center: UNUserNotificationCenter,
                                 didReceive response: UNNotificationResponse,
                                 withCompletionHandler completionHandler: @escaping () -> Void) {
         let userInfo = response.notification.request.content.userInfo

         // Handle purchase notification tap
         if let productId = userInfo["productId"] as? String,
            let amount = userInfo["amount"] as? String {
             print("User tapped purchase notification: \(productId) - \(amount)")
             // Navigate to purchase details or analytics screen
         }

         completionHandler()
     }
 }

 */

// MARK: - SwiftUI App Integration
/*

 Add this to your App struct (SwiftUI):

 import SwiftUI
 import Firebase
 import UserNotifications

 @main
 struct YourAdminApp: App {

     @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

     var body: some Scene {
         WindowGroup {
             ContentView()
         }
     }
 }

 class AppDelegate: NSObject, UIApplicationDelegate {

     func application(_ application: UIApplication,
                      didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {

         // Configure Firebase
         FirebaseApp.configure()

         // Set UNUserNotificationCenter delegate
         UNUserNotificationCenter.current().delegate = self

         // Configure admin notifications
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

     func userNotificationCenter(_ center: UNUserNotificationCenter,
                                 didReceive response: UNNotificationResponse,
                                 withCompletionHandler completionHandler: @escaping () -> Void) {
         let userInfo = response.notification.request.content.userInfo
         print("Notification tapped: \(userInfo)")
         completionHandler()
     }
 }

 */
