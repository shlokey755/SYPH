package expo.modules.syphcallservice

import android.os.Bundle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JavaScript side of the call foreground service.
 *
 *   show(title, text, startedAt, route)  start the service, or refresh its notification. Returns false when Android
 *                                        refused (then the call simply carries on without background protection).
 *   stop()                               stop the service and remove the notification
 *   consumeEndRequest()                  true once if "End call" was pressed while JavaScript was not listening
 *   event onEndCall                      "End call" was pressed on the notification
 */
class SyphCallServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SyphCallService")

    Events("onEndCall")

    OnCreate {
      CallServiceEvents.listener = { this@SyphCallServiceModule.sendEvent("onEndCall", Bundle()) }
    }

    OnDestroy {
      CallServiceEvents.listener = null
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
  }
}
