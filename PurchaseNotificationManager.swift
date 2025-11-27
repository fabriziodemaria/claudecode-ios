//
//  PurchaseNotificationManager.swift
//  Purchase Notification System
//
//  Integrate this into your existing Firebase-enabled iOS app to track
//  in-app purchases and subscriptions, sending realtime notifications.
//

import Foundation
import StoreKit
import FirebaseFirestore
import FirebaseAnalytics

/// Manages purchase tracking and notification system
/// This class monitors StoreKit transactions and logs them to Firestore
/// which triggers Cloud Functions to send push notifications to admin devices
@MainActor
class PurchaseNotificationManager: NSObject {

    // MARK: - Singleton
    static let shared = PurchaseNotificationManager()

    // MARK: - Properties
    private let db = Firestore.firestore()
    private var transactionListener: Task<Void, Error>?

    // MARK: - Configuration
    struct Configuration {
        /// Collection name in Firestore where purchases will be logged
        static let purchasesCollection = "purchases"

        /// Your app identifier (set this to identify which app the purchase came from)
        static var appIdentifier: String = Bundle.main.bundleIdentifier ?? "unknown"

        /// Environment (production/sandbox)
        static var environment: String {
            #if DEBUG
            return "sandbox"
            #else
            return "production"
            #endif
        }
    }

    // MARK: - Initialization
    private override init() {
        super.init()
    }

    // MARK: - Public Methods

    /// Start listening for purchase transactions
    /// Call this in your AppDelegate or App struct on launch
    func startObserving() {
        transactionListener = Task {
            // Monitor transaction updates
            for await result in Transaction.updates {
                await handleTransaction(result)
            }
        }

        // Check for any unfinished transactions on launch
        Task {
            await checkForUnfinishedTransactions()
        }
    }

    /// Stop listening for transactions
    func stopObserving() {
        transactionListener?.cancel()
    }

    // MARK: - Private Methods

    /// Handle incoming transaction updates
    private func handleTransaction(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else {
            print("⚠️ Transaction verification failed")
            return
        }

        // Log the purchase
        await logPurchase(transaction)

        // Finish the transaction
        await transaction.finish()
    }

    /// Check for any unfinished transactions on app launch
    private func checkForUnfinishedTransactions() async {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else {
                continue
            }

            // You may want to check if this transaction was already logged
            // to avoid duplicate notifications
            await logPurchase(transaction, isBackfill: true)
        }
    }

    /// Log purchase to Firestore and Firebase Analytics
    private func logPurchase(_ transaction: Transaction, isBackfill: Bool = false) async {
        do {
            // Get product details
            let productID = transaction.productID
            let purchaseDate = transaction.purchaseDate
            let transactionID = String(transaction.id)

            // Determine purchase type
            let purchaseType = determinePurchaseType(transaction)

            // Create purchase data
            let purchaseData: [String: Any] = [
                "transactionId": transactionID,
                "productId": productID,
                "purchaseDate": Timestamp(date: purchaseDate),
                "purchaseType": purchaseType,
                "appIdentifier": Configuration.appIdentifier,
                "environment": Configuration.environment,
                "isBackfill": isBackfill,
                "revocationDate": transaction.revocationDate != nil ? Timestamp(date: transaction.revocationDate!) : NSNull(),
                "expirationDate": transaction.expirationDate != nil ? Timestamp(date: transaction.expirationDate!) : NSNull(),
                "timestamp": FieldValue.serverTimestamp()
            ]

            // Try to fetch the localized price (requires product lookup)
            var enrichedData = purchaseData
            if let product = await fetchProduct(productID) {
                enrichedData["price"] = product.price as NSDecimalNumber
                enrichedData["currencyCode"] = product.priceLocale.currencyCode ?? "USD"
                enrichedData["displayPrice"] = product.displayPrice
            }

            // Save to Firestore
            let docRef = try await db.collection(Configuration.purchasesCollection)
                .addDocument(data: enrichedData)

            print("✅ Purchase logged to Firestore: \(docRef.documentID)")

            // Also log to Firebase Analytics
            logToAnalytics(transaction, enrichedData: enrichedData)

        } catch {
            print("❌ Error logging purchase: \(error.localizedDescription)")
        }
    }

    /// Determine if purchase is a subscription or one-time purchase
    private func determinePurchaseType(_ transaction: Transaction) -> String {
        if transaction.subscriptionGroupID != nil {
            return transaction.revocationDate != nil ? "subscription_revoked" : "subscription"
        } else {
            return transaction.revocationDate != nil ? "purchase_revoked" : "purchase"
        }
    }

    /// Fetch product details from StoreKit
    private func fetchProduct(_ productID: String) async -> Product? {
        do {
            let products = try await Product.products(for: [productID])
            return products.first
        } catch {
            print("⚠️ Could not fetch product details for \(productID): \(error.localizedDescription)")
            return nil
        }
    }

    /// Log event to Firebase Analytics
    private func logToAnalytics(_ transaction: Transaction, enrichedData: [String: Any]) {
        var analyticsParams: [String: Any] = [
            AnalyticsParameterTransactionID: String(transaction.id),
            AnalyticsParameterItemID: transaction.productID,
        ]

        // Add price if available
        if let price = enrichedData["price"] as? NSDecimalNumber {
            analyticsParams[AnalyticsParameterValue] = price.doubleValue
        }

        if let currency = enrichedData["currencyCode"] as? String {
            analyticsParams[AnalyticsParameterCurrency] = currency
        }

        // Log purchase event
        Analytics.logEvent(AnalyticsEventPurchase, parameters: analyticsParams)

        print("📊 Purchase logged to Firebase Analytics")
    }
}

// MARK: - Usage Example
/*

 In your App struct (SwiftUI):

 @main
 struct YourApp: App {
     init() {
         // Configure Firebase (if not already done)
         FirebaseApp.configure()

         // Start observing purchases
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

 Or in AppDelegate (UIKit):

 func application(_ application: UIApplication,
                  didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

     FirebaseApp.configure()

     Task { @MainActor in
         PurchaseNotificationManager.shared.startObserving()
     }

     return true
 }

 */
