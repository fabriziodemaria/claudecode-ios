/**
 * Firebase Cloud Functions for Purchase Notifications
 *
 * This function triggers when a new purchase is added to Firestore
 * and sends push notifications to admin devices.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Firestore trigger: Sends notification when a new purchase is detected
 * Triggers on document creation in the 'purchases' collection
 */
exports.onPurchaseCreated = functions.firestore
  .document('purchases/{purchaseId}')
  .onCreate(async (snap, context) => {
    try {
      const purchaseData = snap.data();
      const purchaseId = context.params.purchaseId;

      console.log('New purchase detected:', purchaseId);
      console.log('Purchase data:', purchaseData);

      // Extract purchase details
      const {
        productId,
        transactionId,
        purchaseType,
        price,
        currencyCode,
        displayPrice,
        appIdentifier,
        environment,
        isBackfill
      } = purchaseData;

      // Skip backfilled transactions to avoid notification spam on first launch
      if (isBackfill) {
        console.log('Skipping notification for backfilled transaction');
        return null;
      }

      // Format the notification message
      const amount = displayPrice || (price ? `${currencyCode} ${price}` : 'Unknown amount');
      const appName = appIdentifier || 'Unknown app';
      const type = purchaseType === 'subscription' ? '🔄 Subscription' : '💰 Purchase';

      // Create notification payload
      const notification = {
        title: `${type} - ${amount}`,
        body: `New ${purchaseType} in ${appName}\nProduct: ${productId}\nEnv: ${environment}`,
      };

      const payload = {
        notification: notification,
        data: {
          purchaseId: purchaseId,
          transactionId: transactionId || '',
          productId: productId || '',
          amount: String(price || 0),
          currencyCode: currencyCode || '',
          purchaseType: purchaseType || '',
          appIdentifier: appIdentifier || '',
          environment: environment || '',
          timestamp: new Date().toISOString()
        },
        // Priority for immediate delivery
        android: {
          priority: 'high',
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      // Send to admin topic
      // All admin devices should be subscribed to the 'admin-purchases' topic
      const topic = 'admin-purchases';

      const response = await admin.messaging().send({
        ...payload,
        topic: topic,
      });

      console.log('Successfully sent notification:', response);
      return response;

    } catch (error) {
      console.error('Error sending purchase notification:', error);
      throw error;
    }
  });

/**
 * HTTP endpoint to subscribe a device token to admin notifications
 * Call this from your admin app to register devices for notifications
 *
 * POST /subscribeToAdminNotifications
 * Body: { "token": "FCM_DEVICE_TOKEN" }
 */
exports.subscribeToAdminNotifications = functions.https.onCall(async (data, context) => {
  try {
    const { token } = data;

    if (!token) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Device token is required'
      );
    }

    // Subscribe token to admin topic
    await admin.messaging().subscribeToTopic(token, 'admin-purchases');

    console.log('Device subscribed to admin-purchases topic:', token);

    return {
      success: true,
      message: 'Successfully subscribed to admin purchase notifications',
    };
  } catch (error) {
    console.error('Error subscribing to topic:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to subscribe to notifications',
      error
    );
  }
});

/**
 * HTTP endpoint to unsubscribe a device token from admin notifications
 *
 * POST /unsubscribeFromAdminNotifications
 * Body: { "token": "FCM_DEVICE_TOKEN" }
 */
exports.unsubscribeFromAdminNotifications = functions.https.onCall(async (data, context) => {
  try {
    const { token } = data;

    if (!token) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Device token is required'
      );
    }

    // Unsubscribe token from admin topic
    await admin.messaging().unsubscribeFromTopic(token, 'admin-purchases');

    console.log('Device unsubscribed from admin-purchases topic:', token);

    return {
      success: true,
      message: 'Successfully unsubscribed from admin purchase notifications',
    };
  } catch (error) {
    console.error('Error unsubscribing from topic:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to unsubscribe from notifications',
      error
    );
  }
});

/**
 * Scheduled function to send daily purchase summary (optional)
 * Runs every day at 9 AM UTC
 * Uncomment to enable daily summaries
 */
/*
exports.dailyPurchaseSummary = functions.pubsub
  .schedule('0 9 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Query purchases from yesterday
      const snapshot = await admin.firestore()
        .collection('purchases')
        .where('purchaseDate', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('purchaseDate', '<', admin.firestore.Timestamp.fromDate(today))
        .get();

      if (snapshot.empty) {
        console.log('No purchases yesterday');
        return null;
      }

      let totalRevenue = 0;
      let purchaseCount = 0;
      let subscriptionCount = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.price) {
          totalRevenue += data.price;
        }
        if (data.purchaseType === 'subscription') {
          subscriptionCount++;
        } else {
          purchaseCount++;
        }
      });

      // Send summary notification
      const message = {
        notification: {
          title: '📊 Daily Purchase Summary',
          body: `Yesterday: ${purchaseCount} purchases, ${subscriptionCount} subscriptions\nTotal: $${totalRevenue.toFixed(2)}`,
        },
        topic: 'admin-purchases',
      };

      await admin.messaging().send(message);
      console.log('Daily summary sent');

      return null;
    } catch (error) {
      console.error('Error sending daily summary:', error);
      throw error;
    }
  });
*/
