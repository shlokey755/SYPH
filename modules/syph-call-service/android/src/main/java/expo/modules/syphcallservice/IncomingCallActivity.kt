package expo.modules.syphcallservice

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The full-screen "incoming call" screen: who is calling, with Accept and Decline. It opens over the lock screen and over
 * other apps (see [IncomingCallNotifier]) and is built in code, so it needs no layout files.
 *
 * It is also the target of the notification's Accept and Decline buttons: opened with one of those actions it does the
 * action and closes at once, without ever being drawn (its theme is transparent).
 *
 * It only reports the press (through [CallServiceEvents]); JavaScript answers or declines the call, because the call
 * itself runs there. Accepting also brings SYPH to the front, where JavaScript opens the call screen.
 *
 * Not yet verified on a device.
 */
class IncomingCallActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var key = ""
  private val autoClose = Runnable { finish() }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    current = this
    handle(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handle(intent)
  }

  override fun onDestroy() {
    handler.removeCallbacks(autoClose)
    if (current === this) current = null
    super.onDestroy()
  }

  /** Back closes the screen but leaves the call ringing (the notification and the in-app screen are still there). */
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    finish()
  }

  private fun handle(intent: Intent?) {
    key = intent?.getStringExtra(EXTRA_KEY) ?: ""
    when (intent?.action) {
      ACTION_ACCEPT -> accept()
      ACTION_DECLINE -> decline()
      else -> {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "SYPH call"
        val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Incoming call"
        val isVideo = intent?.getBooleanExtra(EXTRA_VIDEO, false) ?: false
        setContentView(buildScreen(title, text, isVideo))
        handler.removeCallbacks(autoClose)
        handler.postDelayed(autoClose, SCREEN_MAX_MS)
      }
    }
  }

  private fun accept() {
    CallServiceEvents.incomingAction("accept", key)
    IncomingCallNotifier.cancel(this)
    // Bring SYPH forward; JavaScript opens the call screen as soon as it hears about the press.
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
      try {
        startActivity(it)
      } catch (error: Exception) {
        // The app opens when the person next taps it; the press is already with JavaScript.
      }
    }
    finish()
  }

  private fun decline() {
    CallServiceEvents.incomingAction("decline", key)
    IncomingCallNotifier.cancel(this)
    finish()
  }

  @Suppress("DEPRECATION")
  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  // ----- the screen -----

  private fun dp(value: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

  private fun square(color: Int): GradientDrawable =
    GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      setColor(color)
    }

  private fun label(text: String, sizeSp: Float, color: Int, bold: Boolean = false): TextView =
    TextView(this).apply {
      this.text = text
      setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
      setTextColor(color)
      gravity = Gravity.CENTER
      if (bold) typeface = Typeface.DEFAULT_BOLD
    }

  private fun roundButton(icon: Int, color: Int, description: String, turn: Float, onPress: () -> Unit): View {
    val image = ImageView(this).apply {
      setImageResource(icon)
      setColorFilter(Color.WHITE)
      rotation = turn
      contentDescription = description
      setPadding(dp(20), dp(20), dp(20), dp(20))
      background = square(color)
      setOnClickListener { onPress() }
    }
    image.layoutParams = LinearLayout.LayoutParams(dp(72), dp(72))
    return image
  }

  private fun buildScreen(title: String, text: String, isVideo: Boolean): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setBackgroundColor(BACKGROUND)
      setPadding(dp(32), dp(96), dp(32), dp(64))
    }

    val initial = (title.trim().firstOrNull() ?: '?').uppercaseChar().toString()
    val avatar = label(initial, 52f, Color.WHITE, bold = true).apply {
      background = square(AVATAR)
      layoutParams = LinearLayout.LayoutParams(dp(128), dp(128)).apply { bottomMargin = dp(24) }
    }
    root.addView(avatar)
    root.addView(label(title, 28f, Color.WHITE, bold = true).apply { maxLines = 1 })
    root.addView(label(text, 16f, SUBTEXT).apply { setPadding(0, dp(8), 0, 0) })

    // Pushes the buttons to the bottom.
    root.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f))

    val buttons = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    fun column(button: View, caption: String): LinearLayout =
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        addView(button)
        addView(label(caption, 14f, SUBTEXT).apply { setPadding(0, dp(10), 0, 0) })
      }
    // The phone glyph points up-right; turned over it reads as "hang up".
    buttons.addView(
      column(roundButton(android.R.drawable.ic_menu_call, DECLINE, "Decline call", 135f) { decline() }, "Decline"),
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    )
    buttons.addView(
      column(
        roundButton(
          if (isVideo) android.R.drawable.ic_menu_camera else android.R.drawable.ic_menu_call,
          ACCEPT,
          "Accept call",
          0f
        ) { accept() },
        "Accept"
      ),
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    )
    root.addView(buttons, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    return root
  }

  companion object {
    const val ACTION_SHOW = "expo.modules.syphcallservice.SHOW_INCOMING"
    const val ACTION_ACCEPT = "expo.modules.syphcallservice.ACCEPT_INCOMING"
    const val ACTION_DECLINE = "expo.modules.syphcallservice.DECLINE_INCOMING"
    private const val EXTRA_KEY = "key"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"
    private const val EXTRA_VIDEO = "video"

    /** The screen closes by itself after this long, a little over the longest a call rings. */
    private const val SCREEN_MAX_MS = 60_000L

    private const val BACKGROUND = 0xFF0B0F14.toInt()
    private const val AVATAR = 0xFF1E2A36.toInt()
    private const val SUBTEXT = 0xFF9AA7B4.toInt()
    private const val ACCEPT = 0xFF22C55E.toInt()
    private const val DECLINE = 0xFFEF4444.toInt()

    @Volatile
    private var current: IncomingCallActivity? = null

    fun screenIntent(context: Context, key: String, title: String, text: String, isVideo: Boolean): Intent =
      Intent(context, IncomingCallActivity::class.java)
        .setAction(ACTION_SHOW)
        .putExtra(EXTRA_KEY, key)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
        .putExtra(EXTRA_VIDEO, isVideo)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

    fun actionIntent(context: Context, action: String, key: String): Intent =
      Intent(context, IncomingCallActivity::class.java)
        .setAction(action)
        .putExtra(EXTRA_KEY, key)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

    /** Closes the screen if it is open. */
    fun finishCurrent() {
      val open = current ?: return
      open.runOnUiThread { open.finish() }
    }
  }
}
