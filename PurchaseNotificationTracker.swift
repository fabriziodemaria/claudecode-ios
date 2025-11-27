//
//  PurchaseNotificationTracker.swift
//  Purchase Notification System
//
//  Integrate this into your existing Firebase Analytics purchase tracking.
//  Simply call trackPurchaseForNotification() after your existing logEvent() call.
//

import Foundation
import FirebaseFirestore
import FirebaseAnalytics

/// Tracks purchases to Firestore for realtime admin notifications
/// Works alongside your existing Firebase Analytics purchase tracking
class PurchaseNotificationTracker {

    // MARK: - Singleton
    static let shared = PurchaseNotificationTracker()

    // MARK: - Properties
    private let db = Firestore.firestore()

    // MARK: - Configuration
    struct Configuration {
        /// Collection name in Firestore where purchases will be logged
        static let purchasesCollection = "purchases"

        /// Your app identifier (set this to identify which app the purchase came from)
        static var appIdentifier: String = Bundle.main.bundleIdentifier ?? "unknown"

        /// App display name (optional, for better notifications)
        static var appDisplayName: String? = Bundle.main.infoDictionary?["CFBundleDisplayName"] as? String

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
    private init() {}

    // MARK: - Public Methods

    /// Track a purchase for admin notifications
    /// Call this RIGHT AFTER your existing Analytics.logEvent() call
    ///
    /// - Parameters:
    ///   - currency: Currency code (e.g., "USD")
    ///   - totalValue: Total purchase value
    ///   - itemID: Product/item identifier
    ///   - itemName: Human-readable product name
    ///   - quantity: Number of items purchased
    ///   - price: Price per item
    ///   - transactionId: Optional transaction ID
    ///   - affiliation: Optional affiliation (e.g., "App Store")
    func trackPurchaseForNotification(
        currency: String,
        totalValue: Double,
        itemID: String,
        itemName: String,
        quantity: Int = 1,
        price: Double,
        transactionId: String? = nil,
        affiliation: String? = nil
    ) {
        Task {
            await logPurchaseToFirestore(
                currency: currency,
                totalValue: totalValue,
                itemID: itemID,
                itemName: itemName,
                quantity: quantity,
                price: price,
                transactionId: transactionId,
                affiliation: affiliation
            )
        }
    }

    /// Alternative: Track using Analytics event parameters directly
    /// If you already have the parameters dict, use this
    ///
    /// - Parameter analyticsParams: The same parameters you pass to Analytics.logEvent()
    func trackPurchaseForNotification(analyticsParams: [String: Any]) {
        // Extract values from Analytics parameters
        let currency = analyticsParams[AnalyticsParameterCurrency] as? String ?? "USD"
        let totalValue = analyticsParams[AnalyticsParameterValue] as? Double ?? 0.0
        let transactionId = analyticsParams[AnalyticsParameterTransactionID] as? String
        let affiliation = analyticsParams[AnalyticsParameterAffiliation] as? String

        // Extract item details
        var itemID = "unknown"
        var itemName = "Unknown Item"
        var quantity = 1
        var price = 0.0

        if let items = analyticsParams[AnalyticsParameterItems] as? [[String: Any]],
           let firstItem = items.first {
            itemID = firstItem[AnalyticsParameterItemID] as? String ?? itemID
            itemName = firstItem[AnalyticsParameterItemName] as? String ?? itemName
            quantity = firstItem[AnalyticsParameterQuantity] as? Int ?? quantity
            price = firstItem[AnalyticsParameterPrice] as? Double ?? price
        }

        // Track the purchase
        trackPurchaseForNotification(
            currency: currency,
            totalValue: totalValue,
            itemID: itemID,
            itemName: itemName,
            quantity: quantity,
            price: price,
            transactionId: transactionId,
            affiliation: affiliation
        )
    }

    // MARK: - Private Methods

    /// Log purchase to Firestore (triggers Cloud Function notification)
    private func logPurchaseToFirestore(
        currency: String,
        totalValue: Double,
        itemID: String,
        itemName: String,
        quantity: Int,
        price: Double,
        transactionId: String?,
        affiliation: String?
    ) async {
        do {
            // Create purchase data matching your Analytics structure
            let purchaseData: [String: Any] = [
                // Transaction details
                "transactionId": transactionId ?? UUID().uuidString,
                "purchaseDate": Timestamp(date: Date()),
                "timestamp": FieldValue.serverTimestamp(),

                // Product details
                "productId": itemID,
                "productName": itemName,
                "quantity": quantity,
                "price": price,
                "totalValue": totalValue,

                // Currency and locale
                "currencyCode": currency,
                "displayPrice": formatCurrency(totalValue, currency: currency),

                // App context
                "appIdentifier": Configuration.appIdentifier,
                "appDisplayName": Configuration.appDisplayName ?? Configuration.appIdentifier,
                "environment": Configuration.environment,

                // Additional metadata
                "affiliation": affiliation ?? NSNull(),
                "purchaseType": "purchase", // vs "subscription" for StoreKit monitoring

                // For analytics consistency
                "source": "analytics" // Indicates this came from Analytics tracking
            ]

            // Save to Firestore - this triggers the Cloud Function
            let docRef = try await db.collection(Configuration.purchasesCollection)
                .addDocument(data: purchaseData)

            print("✅ Purchase logged to Firestore for notification: \(docRef.documentID)")
            print("   Product: \(itemName) (\(itemID))")
            print("   Amount: \(formatCurrency(totalValue, currency: currency))")

        } catch {
            print("❌ Error logging purchase for notification: \(error.localizedDescription)")
        }
    }

    /// Format currency for display
    private func formatCurrency(_ amount: Double, currency: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        return formatter.string(from: NSNumber(value: amount)) ?? "\(currency) \(amount)"
    }
}

// MARK: - Convenience Extensions

extension PurchaseNotificationTracker {

    /// Quick track from Analytics parameters with one-liner
    /// Usage: PurchaseNotificationTracker.track(params)
    static func track(_ analyticsParams: [String: Any]) {
        shared.trackPurchaseForNotification(analyticsParams: analyticsParams)
    }

    /// Quick track with individual parameters
    static func track(
        currency: String,
        totalValue: Double,
        itemID: String,
        itemName: String,
        quantity: Int = 1,
        price: Double,
        transactionId: String? = nil,
        affiliation: String? = nil
    ) {
        shared.trackPurchaseForNotification(
            currency: currency,
            totalValue: totalValue,
            itemID: itemID,
            itemName: itemName,
            quantity: quantity,
            price: price,
            transactionId: transactionId,
            affiliation: affiliation
        )
    }
}

// MARK: - Usage Examples
/*

 ══════════════════════════════════════════════════════════════════
 OPTION 1: Add one line after your existing Analytics logging
 ══════════════════════════════════════════════════════════════════

 // Your existing code:
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

 // ADD THIS ONE LINE:
 PurchaseNotificationTracker.track(params)

 // That's it! ✅


 ══════════════════════════════════════════════════════════════════
 OPTION 2: Track with individual parameters
 ══════════════════════════════════════════════════════════════════

 PurchaseNotificationTracker.track(
     currency: "USD",
     totalValue: 9.99,
     itemID: "premium_subscription",
     itemName: "Premium Monthly",
     quantity: 1,
     price: 9.99,
     transactionId: "abc123",
     affiliation: "App Store"
 )


 ══════════════════════════════════════════════════════════════════
 OPTION 3: Wrap both in a helper function (recommended)
 ══════════════════════════════════════════════════════════════════

 func trackPurchase(
     currency: String,
     price: Double,
     itemID: String,
     itemName: String,
     quantity: Int = 1,
     transactionId: String? = nil,
     affiliation: String? = nil
 ) {
     // Build parameters
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

     // Log to Analytics
     Analytics.logEvent(AnalyticsEventPurchase, parameters: params)

     // Log for notifications
     PurchaseNotificationTracker.track(params)
 }

 // Then use it:
 trackPurchase(
     currency: "USD",
     price: 9.99,
     itemID: "premium_subscription",
     itemName: "Premium Monthly",
     transactionId: transactionId,
     affiliation: "App Store"
 )

 */
