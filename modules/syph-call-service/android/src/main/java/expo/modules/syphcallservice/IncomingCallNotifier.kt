package expo.modules.syphcallservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
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
 * The ringing sound and vibration are not made here: the JavaScript side rings (react-native-incall-manager) while the call
 * is ringing, so this channel is silent. This only works while SYPH's process is running; when it is not, the call arrives
 * as an ordinary push notification, as before.
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

  /** The notification goes away by itself after this long, a little over the longest a call rings. */
  private const val TIMEOUT_MS = 60_000L

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

  /** Removes the notification and closes the call screen. Safe to call when neither is there. */
  fun hide(context: Context) {
    cancel(context)
    IncomingCallActivity.finishCurrent()
  }

  fun cancel(context: Context) {
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
  private fun build(context: Context, key: String, title: String, text: String, isVideo: Boolean): Notification {
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID)
      else Notification.Builder(context).setPriority(Notification.PRIORITY_HIGH)

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
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) builder.setTimeoutAfter(TIMEOUT_MS)
    return builder.build()
  }

  /** SYPH's own notification icon when the app has one (expo-notifications creates it), else a phone glyph. */
  private fun smallIcon(context: Context): Int {
    val own = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    @Suppress("DEPRECATION")
    return if (own != 0) own else android.R.drawable.stat_sys_phone_call
  }
}
