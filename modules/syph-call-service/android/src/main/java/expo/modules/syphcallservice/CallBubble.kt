package expo.modules.syphcallservice

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
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
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * The small "return to call" bubble that floats over other apps while a call is running and SYPH is in the background: a phone
 * glyph and the call clock side by side, in the theme's accent colour, with square corners like the rest of the app (the
 * in-app bubble, ReturnToCallBubble.tsx, is drawn the same way). Drag it anywhere, tap it to go back to the call.
 *
 * It is a window drawn by Android on top of other apps, which needs the person to have turned on "Display over other
 * apps" for SYPH (Android Settings). Without that, [show] does nothing and returns false. It is added and removed on the
 * main thread, and is also removed when the call service stops, so it can never be left behind.
 *
 * Not yet verified on a device.
 */
internal object CallBubble {
  private const val TAG = "SyphCallBubble"
  /** Both sizes are fixed, so dragging and settling against an edge need no measuring. */
  private const val WIDTH_DP = 112
  private const val WIDTH_NO_CLOCK_DP = 56
  private const val HEIGHT_DP = 44
  private const val EDGE_DP = 8
  private const val ICON_DP = 20
  private const val GAP_DP = 8

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
    val width = dp(context, if (startedAt > 0L) WIDTH_DP else WIDTH_NO_CLOCK_DP)
    val height = dp(context, HEIGHT_DP)
    val edge = dp(context, EDGE_DP)
    val screen = context.resources.displayMetrics

    // Glyph and clock take white on a dark accent and near-black on a light one, like the in-app bubble (which uses the theme's
    // button text colour), so they can be read in every theme.
    val ink = inkOn(accent)

    // One row, centred as a whole: glyph, then clock. The row is as wide as its content, so the pair sits in the middle of
    // the bubble whatever the clock reads ("0:07" or "1:02:45").
    val row = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    row.addView(
      ImageView(context).apply {
        setImageResource(R.drawable.syph_ic_call)
        scaleType = ImageView.ScaleType.FIT_CENTER
        setColorFilter(ink)
        contentDescription = "Return to call"
      },
      LinearLayout.LayoutParams(dp(context, ICON_DP), dp(context, ICON_DP))
    )
    if (startedAt > 0L) {
      row.addView(
        Chronometer(context).apply {
          base = SystemClock.elapsedRealtime() - max(0L, System.currentTimeMillis() - startedAt)
          setTextColor(ink)
          // dp, not sp: the bubble has a fixed size, so a large system font must not push the clock out of it.
          setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f)
          typeface = Typeface.DEFAULT_BOLD
          includeFontPadding = false
          // Digits of equal width, so the row does not shake as the clock ticks.
          fontFeatureSettings = "tnum"
          gravity = Gravity.CENTER_VERTICAL
          start()
        },
        // As tall as the glyph, with the text centred in that height: the two share one centre line.
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(context, ICON_DP)).apply {
          marginStart = dp(context, GAP_DP)
        }
      )
    }

    val bubble = FrameLayout(context).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(accent)
      }
      elevation = dp(context, 6).toFloat()
    }
    bubble.addView(row, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER))

    val type =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
    val params = WindowManager.LayoutParams(
      width,
      height,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = screen.widthPixels - width - edge
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
              params.x = min(max(0, startX + dx.toInt()), screen.widthPixels - width)
              params.y = min(max(0, startY + dy.toInt()), screen.heightPixels - height)
              windowManager.updateViewLayout(v, params)
            }
          }
          MotionEvent.ACTION_UP -> {
            if (!dragged) {
              openCall(context, route)
            } else {
              // Settle against the nearer side, so it never sits in the middle of someone's screen.
              params.x = if (params.x + width / 2 > screen.widthPixels / 2) screen.widthPixels - width - edge else edge
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

  /** Near-black on a light colour, white on a dark one (by how bright the eye sees it). */
  private fun inkOn(background: Int): Int {
    val brightness = (0.299 * Color.red(background) + 0.587 * Color.green(background) + 0.114 * Color.blue(background)) / 255.0
    return if (brightness > 0.62) 0xFF1A1A1A.toInt() else Color.WHITE
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
