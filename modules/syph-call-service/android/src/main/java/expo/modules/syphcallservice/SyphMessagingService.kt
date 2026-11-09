package expo.modules.syphcallservice

import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/**
 * Receives every push first (this service is declared with a higher priority than expo-notifications' own, which it extends).
 * A push that [ClosedAppAlerts] handles, a call that must ring or the end of one, stops here; everything else goes on to
 * expo-notifications exactly as before, so ordinary notifications, taps and the JavaScript handlers are untouched. If the
 * handling fails for any reason, the push also goes on to the ordinary notification, so a call is never lost.
 *
 * Not yet verified on a device.
 */
class SyphMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val handled = try {
      ClosedAppAlerts.handle(applicationContext, remoteMessage.data)
    } catch (error: Exception) {
      Log.w("SyphMessaging", "Could not handle the push here", error)
      false
    }
    if (!handled) super.onMessageReceived(remoteMessage)
  }
}
