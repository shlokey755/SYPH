package expo.modules.syphcallservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log

/**
 * Keeps a SYPH call alive while the app is not on screen.
 *
 * Android 11+ silences the microphone of an app that is in the background unless a foreground service of type
 * "microphone" is running, and Android 14+ will not even start one without declaring that type. While this service
 * runs, the call keeps its audio, and the person sees one ongoing notification with the name of the call, a clock,
 * and an "End call" button. Tapping the notification opens SYPH on the call.
 *
 * Only the notification and the process are kept alive here. The call itself (WebRTC, Firestore) still runs in
 * JavaScript, which is told about "End call" through [CallServiceEvents].
 *
 * Not yet verified on a device.
 */
class CallForegroundService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var wakeLock: PowerManager.WakeLock? = null

  /** Stops the service if JavaScript has not done so a few seconds after "End call" was pressed. */
  private val forceStop = Runnable { shutDown() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
    // Android requires the service to enter the foreground right after startForegroundService(), even if it is
    // stopped again straight away, so do it here with a plain notification and fill in the details in onStartCommand.
    if (!enterForeground(buildNotification(DEFAULT_TITLE, DEFAULT_TEXT, 0L, ""))) {
      stopSelf()
      return
    }
    acquireWakeLock()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_SHOW -> {
        handler.removeCallbacks(forceStop)
        val notification = buildNotification(
          intent?.getStringExtra(EXTRA_TITLE) ?: DEFAULT_TITLE,
          intent?.getStringExtra(EXTRA_TEXT) ?: DEFAULT_TEXT,
          intent?.getLongExtra(EXTRA_STARTED_AT, 0L) ?: 0L,
          intent?.getStringExtra(EXTRA_ROUTE) ?: ""
        )
        if (!enterForeground(notification)) shutDown()
      }
      ACTION_END -> {
        if (CallServiceEvents.requestEnd()) {
          // JavaScript is hanging up; it stops the service when the call has ended. Do not hang around forever.
          handler.postDelayed(forceStop, END_GRACE_MS)
        } else {
          shutDown()
        }
      }
      else -> shutDown() // restarted by the system without a call to look after
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    releaseWakeLock()
    CallBubble.hide() // never leave the floating bubble behind a call that has ended
    super.onDestroy()
  }

  private fun shutDown() {
    handler.removeCallbacks(forceStop)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun enterForeground(notification: Notification): Boolean =
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      true
    } catch (error: Exception) {
      // Android 12+ refuses to start one from the background, and Android 14+ needs the microphone permission.
      Log.w(TAG, "Could not enter the foreground for the call", error)
      false
    }

  // ----- notification -----

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    // Low importance: no sound or pop-up, because the call itself is already audible.
    val channel = NotificationChannel(CHANNEL_ID, "Call in progress", NotificationManager.IMPORTANCE_LOW)
    channel.description = "Shown while a call is running, so it can be ended without opening SYPH."
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  @Suppress("DEPRECATION")
  private fun buildNotification(title: String, text: String, startedAt: Long, route: String): Notification {
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
      else Notification.Builder(this)

    val endAction = Notification.Action.Builder(
      Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
      "End call",
      PendingIntent.getService(
        this,
        REQUEST_END,
        Intent(this, CallForegroundService::class.java).setAction(ACTION_END),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    ).build()

    builder
      .setSmallIcon(smallIcon())
      .setContentTitle(title)
      .setContentText(text)
      .setCategory(Notification.CATEGORY_CALL)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(tapIntent(route))
      .addAction(endAction)

    if (startedAt > 0L) {
      builder.setWhen(startedAt).setShowWhen(true).setUsesChronometer(true)
    } else {
      builder.setShowWhen(false)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    }
    return builder.build()
  }

  /** Opens SYPH on the call. A link into the app's own scheme; with no link it just brings SYPH forward. */
  private fun tapIntent(route: String): PendingIntent? {
    val intent =
      if (route.isNotEmpty()) {
        Intent(Intent.ACTION_VIEW, Uri.parse(route)).setPackage(packageName)
      } else {
        packageManager.getLaunchIntentForPackage(packageName) ?: return null
      }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      this,
      REQUEST_OPEN,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /** SYPH's own notification icon when the app has one (expo-notifications creates it), else a phone glyph. */
  private fun smallIcon(): Int {
    val own = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (own != 0) own else android.R.drawable.stat_sys_phone_call
  }

  // ----- wake lock -----

  /** Without it the processor can sleep with the screen off and the call audio stutters. */
  private fun acquireWakeLock() {
    try {
      val power = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "syph:call").apply {
        setReferenceCounted(false)
        acquire(WAKE_LOCK_MAX_MS)
      }
    } catch (error: Exception) {
      Log.w(TAG, "Could not hold the call wake lock", error)
    }
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.takeIf { it.isHeld }?.release()
    } catch (error: Exception) {
      Log.w(TAG, "Could not release the call wake lock", error)
    }
    wakeLock = null
  }

  companion object {
    private const val TAG = "SyphCallService"
    private const val CHANNEL_ID = "syph_call_in_progress"
    private const val NOTIFICATION_ID = 7205
    private const val REQUEST_OPEN = 1
    private const val REQUEST_END = 2
    private const val END_GRACE_MS = 6_000L
    private const val WAKE_LOCK_MAX_MS = 4 * 60 * 60 * 1000L
    private const val DEFAULT_TITLE = "SYPH call"
    private const val DEFAULT_TEXT = "Call in progress"

    private const val ACTION_SHOW = "expo.modules.syphcallservice.SHOW"
    private const val ACTION_END = "expo.modules.syphcallservice.END"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"
    private const val EXTRA_STARTED_AT = "startedAt"
    private const val EXTRA_ROUTE = "route"

    /** Starts the service, or refreshes its notification. False when Android refused. */
    fun show(context: Context, title: String, text: String, startedAt: Long, route: String): Boolean {
      val intent = Intent(context, CallForegroundService::class.java)
        .setAction(ACTION_SHOW)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
        .putExtra(EXTRA_STARTED_AT, startedAt)
        .putExtra(EXTRA_ROUTE, route)
      return try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (error: Exception) {
        Log.w(TAG, "Could not start the call service", error)
        false
      }
    }

    fun stop(context: Context): Boolean =
      try {
        context.stopService(Intent(context, CallForegroundService::class.java))
        true
      } catch (error: Exception) {
        Log.w(TAG, "Could not stop the call service", error)
        false
      }
  }
}
