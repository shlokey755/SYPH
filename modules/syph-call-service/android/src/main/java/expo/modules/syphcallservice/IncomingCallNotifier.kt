package expo.modules.syphcallservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager

/**
 * Puts an incoming call in front of the person while SYPH is not on the screen: closed, in the background, or the phone locked.
 *
 * It posts a call notification that rings (the phone's own ringtone, repeating, plus a buzz) and carries a full-screen intent:
 * with the phone locked or asleep Android opens [IncomingCallActivity] over the lock screen; with the phone in use it shows the
 * notification as a banner with Answer and Decline buttons. When the person has also allowed "Display over other apps", SYPH
 * opens the call screen straight away over whatever app is in use ([openCallScreen]).
 *
 * Two things lead here, and the call rings once whichever comes first: the push handler ([ClosedAppAlerts], which does not need
 * SYPH's JavaScript at all) and, when SYPH's JavaScript is alive in the background and sees the call in the database first,
 * [show]. With SYPH on the screen neither is used: the app rings and shows its own Accept / Decline screen.
 *
 * SYPH has no ringtone of its own: it asks Android for the ringtone the person chose in the phone's settings, and Android
 * plays it on the ring volume (silent mode just buzzes). The ring stops when the call is answered, declined, ended or 45
 * seconds are up.
 *
 * On Android 12 and newer the notification uses the system's call style, which gives the big Answer and Decline buttons both
 * on the lock screen and as a banner.
 *
 * Not yet verified on a device.
 */
internal object IncomingCallNotifier {
  private const val TAG = "SyphIncomingCall"
  private const val NOTIFICATION_ID = 7206
  private const val REQUEST_SCREEN = 21
  private const val REQUEST_ACCEPT = 22
  private const val REQUEST_DECLINE = 23

  /** The channel a call that rings from a closed SYPH is posted on. Its sound is the phone's ringtone. */
  private const val RING_CHANNEL_ID = "syph_incoming_ring"

  /**
   * Channels of earlier builds (the silent one JavaScript used, and the ones with SYPH's own ringtones, one per ringtone and
   * buzz choice). Removed when the ringing channel is made.
   */
  private val OLD_RING_CHANNELS =
    listOf(
      "syph_incoming_call",
      "syph_ringing_syph_buzz",
      "syph_ringing_syph_quiet",
      "syph_ringing_phone_buzz",
      "syph_ringing_phone_quiet"
    )

  /** How long the 1-pixel window that lets the call screen open from the background stays up (see [openCallScreen]). */
  private const val ANCHOR_MS = 2_000L

  private val main = Handler(Looper.getMainLooper())

  /** A call that rings from a closed SYPH stops by itself after this long (a call rings 30 s, a group call 45 s). */
  private const val RING_TIMEOUT_MS = 45_000L

  /** Buzz, pause, repeated for as long as the notification rings. */
  private val RING_PATTERN = longArrayOf(0, 700, 500, 700, 500)

  /** The key of the call that is ringing from a closed SYPH, so the call-ended push only stops that one. */
  @Volatile
  private var ringingKey: String? = null

  /**
   * For a call SYPH's own JavaScript saw while SYPH was in the background. It rings exactly like [showRinging]; when the push
   * got here first and is already ringing for this call, nothing is done, so the sound does not start over.
   */
  fun show(context: Context, key: String, title: String, text: String, isVideo: Boolean): Boolean =
    showRinging(context, key, title, text, isVideo)

  /**
   * Posts the ringing call notification and opens the call screen. Called for a call that arrived by push while SYPH was not on
   * the screen, and by [show]. A second call for the same key (the push and the JavaScript both noticed it) changes nothing.
   */
  fun showRinging(context: Context, key: String, title: String, text: String, isVideo: Boolean): Boolean {
    if (ringingKey == key) return true
    val app = context.applicationContext
    try {
      val channelId = createRingChannel(app)
      val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val notification = build(app, key, title, text, isVideo, channelId, RING_TIMEOUT_MS, phoneRingtone())
      // Repeat the sound (and buzz) until the notification is cancelled, answered or times out.
      notification.flags = notification.flags or Notification.FLAG_INSISTENT
      manager.notify(NOTIFICATION_ID, notification)
      ringingKey = key
    } catch (error: Exception) {
      Log.w(TAG, "Could not post the ringing call notification", error)
      return false
    }
    openCallScreen(app, key, title, text, isVideo)
    return true
  }

  /**
   * Opens the full-screen call screen straight away, over whatever app is in use. Needs "Display over other apps": that is what
   * lets an app start a screen from the background. Android 15 only honours it while the app also has a window showing over
   * other apps, so a 1-pixel invisible one is put up for the moment the screen is started. Without the permission the
   * notification's full-screen intent does the job on a locked phone, and a banner is shown on a phone in use.
   */
  private fun openCallScreen(app: Context, key: String, title: String, text: String, isVideo: Boolean) {
    if (!canDrawOverApps(app)) return
    main.post {
      val windowManager = app.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
      var anchor: View? = null
      try {
        val view = View(app)
        val type =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
          else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val params = WindowManager.LayoutParams(
          1,
          1,
          type,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
          PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START }
        windowManager?.addView(view, params)
        anchor = view
      } catch (error: Exception) {
        Log.w(TAG, "Could not put up the window that lets the call screen open", error)
      }
      try {
        app.startActivity(IncomingCallActivity.screenIntent(app, key, title, text, isVideo))
      } catch (error: Exception) {
        Log.w(TAG, "Could not open the incoming call screen", error)
      }
      val added = anchor
      if (added != null) {
        main.postDelayed(
          {
            try {
              windowManager?.removeView(added)
            } catch (error: Exception) {
              // already gone
            }
          },
          ANCHOR_MS
        )
      }
    }
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

  /** The ringtone the person chose in the phone's settings. */
  private fun phoneRingtone(): Uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

  /**
   * The channel for a ringing call. A channel's sound cannot be changed by an app once it exists; the person changes it under
   * the phone's notification settings for SYPH, and the default is the phone's ringtone.
   */
  private fun createRingChannel(context: Context): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return RING_CHANNEL_ID
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(RING_CHANNEL_ID) != null) return RING_CHANNEL_ID
    OLD_RING_CHANNELS.forEach {
      try {
        manager.deleteNotificationChannel(it)
      } catch (error: Exception) {
        // not there
      }
    }
    val channel = NotificationChannel(RING_CHANNEL_ID, "Incoming calls (ringing)", NotificationManager.IMPORTANCE_HIGH)
    channel.description = "Rings with your phone's ringtone and shows the call when SYPH is closed."
    channel.setSound(
      phoneRingtone(),
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    )
    channel.enableVibration(true)
    channel.vibrationPattern = RING_PATTERN
    channel.setShowBadge(false)
    channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    manager.createNotificationChannel(channel)
    return RING_CHANNEL_ID
  }

  @Suppress("DEPRECATION")
  private fun build(
    context: Context,
    key: String,
    title: String,
    text: String,
    isVideo: Boolean,
    channelId: String,
    timeoutMs: Long,
    ringUri: Uri?
  ): Notification {
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, channelId)
      else Notification.Builder(context).setPriority(Notification.PRIORITY_HIGH)
    // Before Android 8 the sound and buzz belong to the notification; from 8 on the channel decides.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O && ringUri != null) {
      builder.setSound(ringUri)
      builder.setVibrate(RING_PATTERN)
    }

    val screen = PendingIntent.getActivity(
      context,
      REQUEST_SCREEN,
      IncomingCallActivity.screenIntent(context, key, title, text, isVideo),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val declineIntent = PendingIntent.getActivity(
      context,
      REQUEST_DECLINE,
      IncomingCallActivity.actionIntent(context, IncomingCallActivity.ACTION_DECLINE, key),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val acceptIntent = PendingIntent.getActivity(
      context,
      REQUEST_ACCEPT,
      IncomingCallActivity.actionIntent(context, IncomingCallActivity.ACTION_ACCEPT, key),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

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

    // Android 12+: the system's own incoming-call look, with large Answer and Decline buttons. Older versions (or a phone that
    // refuses the style) get two plain buttons.
    var styled = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        val caller = Person.Builder().setName(title).setImportant(true).build()
        builder.setStyle(Notification.CallStyle.forIncomingCall(caller, declineIntent, acceptIntent).setIsVideo(isVideo))
        styled = true
      } catch (error: Exception) {
        Log.w(TAG, "Could not use the call notification style", error)
      }
    }
    if (!styled) {
      builder.addAction(
        Notification.Action.Builder(
          Icon.createWithResource(context, android.R.drawable.ic_menu_close_clear_cancel),
          "Decline",
          declineIntent
        ).build()
      )
      builder.addAction(
        Notification.Action.Builder(Icon.createWithResource(context, android.R.drawable.ic_menu_call), "Accept", acceptIntent).build()
      )
    }
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
