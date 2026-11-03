package expo.modules.syphcallservice

/**
 * Hands the "End call" button on the notification to the JavaScript side.
 *
 * The notification button is handled by the service, which may run while the app's JavaScript is not attached to this
 * module (for example while the screen is being rebuilt). In that case the request is remembered, and JavaScript
 * collects it with `consumeEndRequest` the next time SYPH is on screen.
 */
internal object CallServiceEvents {
  @Volatile
  var listener: (() -> Unit)? = null

  @Volatile
  private var pendingEnd = false

  /** Returns true when JavaScript received the request; otherwise keeps it for later. */
  fun requestEnd(): Boolean {
    val current = listener
    if (current == null) {
      pendingEnd = true
      return false
    }
    return try {
      current()
      true
    } catch (error: Exception) {
      pendingEnd = true
      false
    }
  }

  fun consumePendingEnd(): Boolean {
    val pending = pendingEnd
    pendingEnd = false
    return pending
  }
}
