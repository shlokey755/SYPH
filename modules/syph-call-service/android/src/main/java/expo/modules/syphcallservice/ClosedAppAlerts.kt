package expo.modules.syphcallservice

import android.content.Context
import android.util.Log
import org.json.JSONObject

/**
 * What SYPH does with a push that arrives while the app is closed, before the ordinary notification is made (see
 * [SyphMessagingService]).
 *
 * Messages need nothing here: the sender's phone puts them on the notification channel that matches the person's message tone
 * and vibration choice, and Android plays that channel's sound by itself.
 *
 * Calls do. With SYPH closed there is no JavaScript to ring and no call screen, so:
 *   - a call push ("call") rings and opens the full-screen call screen from here ([IncomingCallNotifier.showRinging]);
 *   - a "call-ended" push (the caller gave up) stops that ring.
 *
 * Both are only for a push that says it comes from a phone that can use them (a ringtone is in the payload, which the sender
 * adds only for devices that registered as able to), and for a closed SYPH: when SYPH is running it rings and shows the screen
 * itself, so the push is left to the ordinary handling.
 *
 * Not yet verified on a device.
 */
internal object ClosedAppAlerts {
  private const val TAG = "SyphClosedAlerts"

  /**
   * Returns true when the push was dealt with here and the ordinary notification must not also be shown. [data] is the
   * message's data: Expo puts the title in "title", the text in "message" and SYPH's own fields, as JSON, in "body".
   */
  fun handle(context: Context, data: Map<String, String>): Boolean {
    val body = try {
      data["body"]?.let { JSONObject(it) }
    } catch (error: Exception) {
      null
    } ?: return false

    return when (body.optString("type")) {
      "call" -> ring(context, data, body)
      "call-ended" -> {
        val callId = body.optString("callId")
        if (callId.isNotEmpty()) IncomingCallNotifier.stopRingingFor(context, callId)
        true
      }
      else -> false
    }
  }

  private fun ring(context: Context, data: Map<String, String>, body: JSONObject): Boolean {
    val ringtone = body.optString("ringtone")
    val callId = body.optString("callId")
    if (ringtone.isEmpty() || callId.isEmpty()) return false // a push for a phone that cannot do this: the ordinary notification
    if (CallServiceEvents.incomingListener != null) return false // SYPH is running: it rings and shows the screen itself

    val key = if (body.optString("group") == "1") "group:$callId" else callId
    val title = data["title"] ?: "SYPH call"
    val text = data["message"] ?: "Incoming call"
    val isVideo = text.contains("video", ignoreCase = true)
    val vibrate = body.optString("vibrate") != "0"
    Log.i(TAG, "Ringing for a call while SYPH is closed")
    return IncomingCallNotifier.showRinging(context, key, title, text, isVideo, ringtone, vibrate)
  }
}
