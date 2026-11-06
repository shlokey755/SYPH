package expo.modules.syphcallservice

import android.graphics.Color
import android.os.Bundle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JavaScript side of SYPH's native call helpers.
 *
 * Ongoing call (foreground service, notification with "End call"):
 *   show(title, text, startedAt, route)  start the service, or refresh its notification. Returns false when Android
 *                                        refused (then the call simply carries on without background protection).
 *   stop()                               stop the service and remove the notification
 *   consumeEndRequest()                  true once if "End call" was pressed while JavaScript was not listening
 *   event onEndCall                      "End call" was pressed on the notification
 *
 * Over other apps:
 *   showIncomingCall(key, title, text, isVideo)  put a ringing call on the lock screen / over other apps
 *   hideIncomingCall()                           take it away again (answered, declined, cancelled, or SYPH is back)
 *   consumeIncomingAction()                      "accept:<key>" / "decline:<key>" if a press was missed, else ""
 *   event onIncomingCallAction                   Accept or Decline was pressed: { action, key }
 *   showBubble(startedAt, route, accent)         the floating "return to call" bubble (needs "Display over other apps")
 *   hideBubble()                                 remove it
 *   canDrawOverApps(), openOverlaySettings()     the "Display over other apps" permission and its settings page
 *   canUseFullScreen(), openFullScreenSettings() the full-screen call alert permission (Android 14+) and its page
 */
class SyphCallServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SyphCallService")

    Events("onEndCall", "onIncomingCallAction")

    OnCreate {
      CallServiceEvents.listener = { this@SyphCallServiceModule.sendEvent("onEndCall", Bundle()) }
      CallServiceEvents.incomingListener = { action, key ->
        val body = Bundle()
        body.putString("action", action)
        body.putString("key", key)
        this@SyphCallServiceModule.sendEvent("onIncomingCallAction", body)
      }
    }

    OnDestroy {
      CallServiceEvents.listener = null
      CallServiceEvents.incomingListener = null
    }

    Function("show") { title: String, text: String, startedAt: Double, route: String ->
      val context = appContext.reactContext ?: return@Function false
      CallForegroundService.show(context, title, text, startedAt.toLong(), route)
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      CallForegroundService.stop(context)
    }

    Function("consumeEndRequest") {
      CallServiceEvents.consumePendingEnd()
    }

    Function("showIncomingCall") { key: String, title: String, text: String, isVideo: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      IncomingCallNotifier.show(context, key, title, text, isVideo)
    }

    Function("hideIncomingCall") {
      val context = appContext.reactContext ?: return@Function false
      IncomingCallNotifier.hide(context)
      true
    }

    Function("consumeIncomingAction") {
      CallServiceEvents.consumePendingIncoming()
    }

    Function("showBubble") { startedAt: Double, route: String, accent: String ->
      val context = appContext.reactContext ?: return@Function false
      val color = try {
        Color.parseColor(accent)
      } catch (error: IllegalArgumentException) {
        FALLBACK_ACCENT
      }
      CallBubble.show(context, startedAt.toLong(), route, color)
    }

    Function("hideBubble") {
      CallBubble.hide()
      true
    }

    Function("canDrawOverApps") {
      val context = appContext.reactContext ?: return@Function false
      IncomingCallNotifier.canDrawOverApps(context)
    }

    Function("openOverlaySettings") {
      val context = appContext.reactContext ?: return@Function false
      CallBubble.openSettings(context)
    }

    Function("canUseFullScreen") {
      val context = appContext.reactContext ?: return@Function false
      IncomingCallNotifier.canUseFullScreen(context)
    }

    Function("openFullScreenSettings") {
      val context = appContext.reactContext ?: return@Function false
      IncomingCallNotifier.openFullScreenSettings(context)
    }
  }

  private companion object {
    /** Used when JavaScript sends a colour Android cannot read. */
    val FALLBACK_ACCENT = 0xFF22C55E.toInt()
  }
}
