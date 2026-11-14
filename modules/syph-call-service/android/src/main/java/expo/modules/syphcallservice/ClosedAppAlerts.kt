package expo.modules.syphcallservice

import android.content.Context
import android.util.Log
import org.json.JSONObject

/**
 * What SYPH does with a push that arrives while the app is closed, before the ordinary notification is made (see
 * [SyphMessagingService]).
 *
 * Messages need nothing here: the ordinary notification is on the "messages" channel and Android plays the phone's own
 * notification sound for it.
 *
 * Calls do. With SYPH closed there is no JavaScript to ring and no call screen, so:
 *   - a call push ("call") rings with the phone's ringtone and opens the full-screen call screen from here
 *     ([IncomingCallNotifier.showRinging]);
 *   - a "call-ended" push (the caller gave up) stops that ring.
 *
 * Every call push is handled this way, whatever its payload says about the recipient's account, so nothing has to be saved
 * on the account first. It is for every case except SYPH being on the screen (see [AppVisibility]): then the app rings and
 * shows its own call screen, so the push is left to the ordinary handling.
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
    val callId = body.optString("callId")
    if (callId.isEmpty()) return false // not a call this handler understands: the ordinary notification
    // SYPH is on the screen: it rings and shows its own Accept / Decline screen. Anywhere else (closed, in the background with its
    // JavaScript still alive, phone locked) it is rung from here: a background JavaScript may be frozen or offline.
    if (AppVisibility.onScreen(context)) return false

    val key = if (body.optString("group") == "1") "group:$callId" else callId
    val title = data["title"] ?: "SYPH call"
    val text = data["message"] ?: "Incoming call"
    val isVideo = text.contains("video", ignoreCase = true)
    Log.i(TAG, "Ringing for a call while SYPH is closed")
    return IncomingCallNotifier.showRinging(context, key, title, text, isVideo)
  }
}
