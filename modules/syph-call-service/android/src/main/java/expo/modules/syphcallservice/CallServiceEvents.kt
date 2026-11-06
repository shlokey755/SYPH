package expo.modules.syphcallservice

/**
 * Hands button presses from native screens to the JavaScript side.
 *
 * Two things are handed over:
 *   - "End call" on the ongoing-call notification (handled by the service)
 *   - "Accept" or "Decline" on the incoming-call screen or its notification (handled by the activity)
 *
 * Either can happen while the app's JavaScript is not attached to this module (for example while the screen is being
 * rebuilt). The press is then remembered, and JavaScript collects it the next time SYPH is on screen
 * (`consumeEndRequest`, `consumeIncomingAction`).
 */
internal object CallServiceEvents {
  @Volatile
  var listener: (() -> Unit)? = null

  @Volatile
  private var pendingEnd = false

  /** Called with the action ("accept" or "decline") and the key of the call it is about. */
  @Volatile
  var incomingListener: ((String, String) -> Unit)? = null

  @Volatile
  private var pendingIncoming: String? = null

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

  /** Returns true when JavaScript received the press; otherwise keeps the latest one for later. */
  fun incomingAction(action: String, key: String): Boolean {
    val current = incomingListener
    if (current == null) {
      pendingIncoming = "$action:$key"
      return false
    }
    return try {
      current(action, key)
      true
    } catch (error: Exception) {
      pendingIncoming = "$action:$key"
      false
    }
  }

  /** "accept:<key>" or "decline:<key>" if a press was missed, else an empty string. */
  fun consumePendingIncoming(): String {
    val pending = pendingIncoming ?: ""
    pendingIncoming = null
    return pending
  }
}
