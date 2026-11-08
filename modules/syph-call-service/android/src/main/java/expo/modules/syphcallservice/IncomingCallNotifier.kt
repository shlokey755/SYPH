package expo.modules.syphcallservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * Puts an incoming call in front of the person while SYPH is not on screen.
 *
 * It posts a call notification with a full-screen intent: with the phone locked or asleep Android opens
 * [IncomingCallActivity] over the lock screen; with the phone in use it shows the notification as a banner with Accept and
 * Decline buttons. When the person has also allowed "Display over other apps", Android lets SYPH open the call screen
 * straight away over whatever app is in use, so that is tried as well.
 *
 * With SYPH running, the ringing sound and vibration are not made here: the JavaScript side rings (react-native-incall-manager)
 * while the call is ringing, so [show] uses a silent channel.
 *
 * With SYPH closed there is no JavaScript to ring, so the push handler ([ClosedAppAlerts]) calls [showRinging] instead: the same
 * notification and call screen, but on a channel that carries the person's ringtone and buzz, and flagged to repeat its sound
 * until the call is answered, declined, ended or 45 seconds are up. The channel's sound is fixed once it exists, so there is one
 * channel per ringtone and vibration choice.
 *
 * Not yet verified on a device.
 */
internal object IncomingCallNotifier {
  private const val TAG = "SyphIncomingCall"
  private const val CHANNEL_ID = "syph_incoming_call"
  private const val NOTIFICATION_ID = 7206
  private const val REQUEST_SCREEN = 21
  private const val REQUEST_ACCEPT = 22
  private const val REQUEST_DECLINE = 23

  /** Name of SYPH's ringtone in res/raw: the build copies assets/sounds/incallmanager_ringtone.wav there (app.json sounds). */
  private const val RINGTONE_RESOURCE = "incallmanager_ringtone"

  /** The notification goes away by itself after this long, a little over the longest a call rings. */
  private const val TIMEOUT_MS = 60_000L

  /** A call that rings from a closed SYPH stops by itself after this long (a call rings 30 s, a group call 45 s). */
  private const val RING_TIMEOUT_MS = 45_000L

  /** Buzz, pause, repeated for as long as the notification rings. */
  private val RING_PATTERN = longArrayOf(0, 700, 500, 700, 500)

  /** The key of the call that is ringing from a closed SYPH, so the call-ended push only stops that one. */
  @Volatile
  private var ringingKey: String? = null

  fun show(context: Context, key: String, title: String, text: String, isVideo: Boolean): Boolean {
    val app = context.applicationContext
    try {
      createChannel(app)
      val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(NOTIFICATION_ID, build(app, key, title, text, isVideo))
    } catch (error: Exception) {
      Log.w(TAG, "Could not post the incoming call notification", error)
      return false
    }
    // Allowed to open the screen from the background only with "Display over other apps"; otherwise the full-screen intent
    // above does it (phone locked) or the banner is shown (phone in use).
    if (canDrawOverApps(app)) {
      try {
        app.startActivity(IncomingCallActivity.screenIntent(app, key, title, text, isVideo))
      } catch (error: Exception) {
        Log.w(TAG, "Could not open the incoming call screen", error)
      }
    }
    return true
  }

  /**
   * The same as [show], for a call that arrived by push while SYPH was closed: the notification itself rings (the person's
   * ringtone, repeating) and buzzes. [ringtone] is "syph" or "phone".
   */
  fun showRinging(context: Context, key: String, title: String, text: String, isVideo: Boolean, ringtone: String, vibrate: Boolean): Boolean {
    val app = context.applicationContext
    try {
      val channelId = createRingChannel(app, ringtone, vibrate)
      val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val notification = build(app, key, title, text, isVideo, channelId, RING_TIMEOUT_MS, ringtoneUri(app, ringtone), vibrate)
      // Repeat the sound (and buzz) until the notification is cancelled, answered or times out.
      notification.flags = notification.flags or Notification.FLAG_INSISTENT
      manager.notify(NOTIFICATION_ID, notification)
      ringingKey = key
    } catch (error: Exception) {
      Log.w(TAG, "Could not post the ringing call notification", error)
      return false
    }
    if (canDrawOverApps(app)) {
      try {
        app.startActivity(IncomingCallActivity.screenIntent(app, key, title, text, isVideo))
      } catch (error: Exception) {
        Log.w(TAG, "Could not open the incoming call screen", error)
      }
    }
    return true
  }

  /**
   * The caller gave up: stops the ring started by [showRinging] for this call and closes the call screen. A call-ended push
   * for another call than the one that is ringing is ignored; with no record of which call rings (SYPH's process restarted
   * in between), it is taken to be the one that is.
   */
  fun stopRingingFor(context: Context, callId: String) {
    val ringing = ringingKey
    if (ringing != null && ringing != callId && ringing != "group:$callId") return
    hide(context)
  }

  /** Removes the notification and closes the call screen. Safe to call when neither is there. */
  fun hide(context: Context) {
    cancel(context)
    IncomingCallActivity.finishCurrent()
  }

  fun cancel(context: Context) {
    ringingKey = null
    try {
      val manager = context.applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.cancel(NOTIFICATION_ID)
    } catch (error: Exception) {
      Log.w(TAG, "Could not remove the incoming call notification", error)
    }
  }

  fun canDrawOverApps(context: Context): Boolean =
    try {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
    } catch (error: Exception) {
      false
    }

  /** Android 14 takes full-screen intents away from apps that are not mainly for calls or alarms, unless allowed. */
  fun canUseFullScreen(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    return try {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.canUseFullScreenIntent()
    } catch (error: Exception) {
      false
    }
  }

  /** Opens the page where full-screen call alerts are allowed for SYPH (Android 14+), else SYPH's notification settings. */
  fun openFullScreenSettings(context: Context): Boolean =
    try {
      val intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
        } else {
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (error: Exception) {
      Log.w(TAG, "Could not open the full-screen alert settings", error)
      false
    }

  /** The SYPH ringtone (bundled by the build into res/raw) or the phone's own. */
  private fun ringtoneUri(context: Context, ringtone: String): Uri {
    if (ringtone == "syph" && context.resources.getIdentifier(RINGTONE_RESOURCE, "raw", context.packageName) != 0) {
      return Uri.parse("android.resource://${context.packageName}/raw/$RINGTONE_RESOURCE")
    }
    return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
  }

  /** One channel per ringtone and buzz choice, because a channel's sound cannot be changed once it exists. */
  private fun createRingChannel(context: Context, ringtone: String, vibrate: Boolean): String {
    val tone = if (ringtone == "phone") "phone" else "syph"
    val id = "syph_ringing_${tone}_${if (vibrate) "buzz" else "quiet"}"
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return id
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(id) != null) return id
    val channel = NotificationChannel(id, "Incoming calls: ${if (tone == "phone") "phone ringtone" else "SYPH ringtone"}", NotificationManager.IMPORTANCE_HIGH)
    channel.description = "Rings and shows the call when SYPH is closed."
    channel.setSound(
      ringtoneUri(context, tone),
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    )
    channel.enableVibration(vibrate)
    if (vibrate) channel.vibrationPattern = RING_PATTERN
    channel.setShowBadge(false)
    channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    manager.createNotificationChannel(channel)
    return id
  }

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH)
    channel.description = "Shows the call on the lock screen or over other apps while SYPH rings."
    channel.setSound(null, null) // SYPH rings by itself while the call is ringing
    channel.enableVibration(false)
    channel.setShowBadge(false)
    channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    manager.createNotificationChannel(channel)
  }

  @Suppress("DEPRECATION")
  private fun build(
    context: Context,
    key: String,
    title: String,
    text: String,
    isVideo: Boolean,
    channelId: String = CHANNEL_ID,
    timeoutMs: Long = TIMEOUT_MS,
    ringUri: Uri? = null,
    vibrate: Boolean = false
  ): Notification {
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, channelId)
      else Notification.Builder(context).setPriority(Notification.PRIORITY_HIGH)
    // Before Android 8 the sound and buzz belong to the notification; from 8 on the channel decides.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      if (ringUri != null) builder.setSound(ringUri)
      if (vibrate) builder.setVibrate(RING_PATTERN)
    }

    val screen = PendingIntent.getActivity(
      context,
      REQUEST_SCREEN,
      IncomingCallActivity.screenIntent(context, key, title, text, isVideo),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val decline = Notification.Action.Builder(
      Icon.createWithResource(context, android.R.drawable.ic_menu_close_clear_cancel),
      "Decline",
      PendingIntent.getActivity(
        context,
        REQUEST_DECLINE,
        IncomingCallActivity.actionIntent(context, IncomingCallActivity.ACTION_DECLINE, key),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    ).build()
    val accept = Notification.Action.Builder(
      Icon.createWithResource(context, android.R.drawable.ic_menu_call),
      "Accept",
      PendingIntent.getActivity(
        context,
        REQUEST_ACCEPT,
        IncomingCallActivity.actionIntent(context, IncomingCallActivity.ACTION_ACCEPT, key),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    ).build()

    builder
      .setSmallIcon(smallIcon(context))
      .setContentTitle(title)
      .setContentText(text)
      .setCategory(Notification.CATEGORY_CALL)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(screen)
      .setFullScreenIntent(screen, true)
      .addAction(decline)
      .addAction(accept)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) builder.setTimeoutAfter(timeoutMs)
    return builder.build()
  }

  /** SYPH's own notification icon when the app has one (expo-notifications creates it), else a phone glyph. */
  private fun smallIcon(context: Context): Int {
    val own = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    @Suppress("DEPRECATION")
    return if (own != 0) own else android.R.drawable.stat_sys_phone_call
  }
}
