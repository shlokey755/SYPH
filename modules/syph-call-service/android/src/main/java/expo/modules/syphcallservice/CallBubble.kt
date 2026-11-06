package expo.modules.syphcallservice

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.Chronometer
import android.widget.ImageView
import android.widget.LinearLayout
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * The small round "return to call" bubble that floats over other apps while a call is running and SYPH is in the
 * background: a phone glyph with the call clock. Drag it anywhere, tap it to go back to the call.
 *
 * It is a window drawn by Android on top of other apps, which needs the person to have turned on "Display over other
 * apps" for SYPH (Android Settings). Without that, [show] does nothing and returns false. It is added and removed on the
 * main thread, and is also removed when the call service stops, so it can never be left behind.
 *
 * Not yet verified on a device.
 */
internal object CallBubble {
  private const val TAG = "SyphCallBubble"
  private const val SIZE_DP = 64
  private const val EDGE_DP = 8

  private val handler = Handler(Looper.getMainLooper())
  private var view: View? = null
  private var manager: WindowManager? = null

  fun canShow(context: Context): Boolean = IncomingCallNotifier.canDrawOverApps(context)

  /** Shows the bubble with its clock running from `startedAt` (ms since epoch; 0 shows no clock). */
  fun show(context: Context, startedAt: Long, route: String, accent: Int): Boolean {
    val app = context.applicationContext
    if (!canShow(app)) return false
    handler.post {
      try {
        remove()
        add(app, startedAt, route, accent)
      } catch (error: Exception) {
        Log.w(TAG, "Could not show the call bubble", error)
        remove()
      }
    }
    return true
  }

  fun hide() {
    handler.post { remove() }
  }

  private fun remove() {
    val current = view ?: return
    try {
      manager?.removeView(current)
    } catch (error: Exception) {
      // already gone
    }
    view = null
    manager = null
  }

  private fun dp(context: Context, value: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), context.resources.displayMetrics).toInt()

  private fun add(context: Context, startedAt: Long, route: String, accent: Int) {
    val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val size = dp(context, SIZE_DP)
    val edge = dp(context, EDGE_DP)
    val screen = context.resources.displayMetrics

    val bubble = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(accent)
      }
      elevation = dp(context, 6).toFloat()
    }
    bubble.addView(
      ImageView(context).apply {
        @Suppress("DEPRECATION")
        setImageResource(android.R.drawable.stat_sys_phone_call)
        setColorFilter(Color.WHITE)
      },
      LinearLayout.LayoutParams(dp(context, 22), dp(context, 22))
    )
    if (startedAt > 0L) {
      bubble.addView(
        Chronometer(context).apply {
          base = SystemClock.elapsedRealtime() - max(0L, System.currentTimeMillis() - startedAt)
          setTextColor(Color.WHITE)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
          start()
        }
      )
    }

    val type =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
    val params = WindowManager.LayoutParams(
      size,
      size,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = screen.widthPixels - size - edge
      y = screen.heightPixels / 4
    }

    val slop = ViewConfiguration.get(context).scaledTouchSlop
    bubble.setOnTouchListener(object : View.OnTouchListener {
      private var startX = 0
      private var startY = 0
      private var touchX = 0f
      private var touchY = 0f
      private var dragged = false

      override fun onTouch(v: View, event: MotionEvent): Boolean {
        when (event.actionMasked) {
          MotionEvent.ACTION_DOWN -> {
            startX = params.x
            startY = params.y
            touchX = event.rawX
            touchY = event.rawY
            dragged = false
          }
          MotionEvent.ACTION_MOVE -> {
            val dx = event.rawX - touchX
            val dy = event.rawY - touchY
            if (abs(dx) > slop || abs(dy) > slop) dragged = true
            if (dragged) {
              params.x = min(max(0, startX + dx.toInt()), screen.widthPixels - size)
              params.y = min(max(0, startY + dy.toInt()), screen.heightPixels - size)
              windowManager.updateViewLayout(v, params)
            }
          }
          MotionEvent.ACTION_UP -> {
            if (!dragged) {
              openCall(context, route)
            } else {
              // Settle against the nearer side, so it never sits in the middle of someone's screen.
              params.x = if (params.x + size / 2 > screen.widthPixels / 2) screen.widthPixels - size - edge else edge
              windowManager.updateViewLayout(v, params)
            }
          }
          else -> return false
        }
        return true
      }
    })

    windowManager.addView(bubble, params)
    view = bubble
    manager = windowManager
  }

  /** Brings SYPH forward on the call. A link into the app's own scheme; with no link it just opens SYPH. */
  private fun openCall(context: Context, route: String) {
    val intent =
      if (route.isNotEmpty()) Intent(Intent.ACTION_VIEW, Uri.parse(route)).setPackage(context.packageName)
      else context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    try {
      context.startActivity(intent)
    } catch (error: Exception) {
      Log.w(TAG, "Could not open the call", error)
    }
  }

  /** Opens Android's "Display over other apps" page for SYPH. */
  fun openSettings(context: Context): Boolean =
    try {
      context.startActivity(
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
      true
    } catch (error: Exception) {
      Log.w(TAG, "Could not open the overlay settings", error)
      false
    }
}
