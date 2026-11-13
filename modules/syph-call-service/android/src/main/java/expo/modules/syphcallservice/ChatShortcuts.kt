package expo.modules.syphcallservice

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * The menu that opens when the SYPH icon on the home screen is long-pressed: the signed-in person's most recent chats, as
 * Android "dynamic shortcuts". JavaScript (services/chatShortcuts.ts) decides what is in it and hands over a JSON list of
 * { id, label, longLabel, url, letter, color, letterColor }.
 *
 * Why dynamic and not a fixed list in the manifest: the entries are the person's own chats, and they must be gone at
 * sign-out. Also, Android opens a manifest ("static") shortcut with fixed intent flags that include "clear the app's task",
 * which restarts SYPH's screen and can lose the link; here the flags are set so that a running SYPH just receives the link
 * (the main activity is singleTask) and a closed one starts with it, as for any link into the app.
 *
 * Not yet verified on a device.
 */
internal object ChatShortcuts {
  private const val TAG = "SyphChatShortcuts"
  private const val MAX_ENTRIES = 3
  private const val ICON_PX = 192

  /** Replaces the menu with [json]'s entries (none: removes them). Returns false when Android would not take the update. */
  fun publish(context: Context, json: String): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return false
    return try {
      val manager = context.getSystemService(ShortcutManager::class.java) ?: return false
      // Android limits updates made while the app is in the background; the next one from the foreground goes through.
      if (manager.isRateLimitingActive) return false

      val items = JSONArray(json)
      val count = minOf(items.length(), MAX_ENTRIES, manager.maxShortcutCountPerActivity)
      val shortcuts = ArrayList<ShortcutInfo>(count)
      for (index in 0 until count) shortcuts.add(build(context, items.getJSONObject(index), index))

      if (shortcuts.isEmpty()) {
        manager.removeAllDynamicShortcuts()
        true
      } else {
        manager.setDynamicShortcuts(shortcuts)
      }
    } catch (error: Exception) {
      Log.w(TAG, "Could not publish the chat shortcuts", error)
      false
    }
  }

  /** Empties the menu (sign-out). */
  fun clear(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return false
    return try {
      val manager = context.getSystemService(ShortcutManager::class.java) ?: return false
      manager.removeAllDynamicShortcuts()
      true
    } catch (error: Exception) {
      Log.w(TAG, "Could not clear the chat shortcuts", error)
      false
    }
  }

  private fun build(context: Context, item: JSONObject, rank: Int): ShortcutInfo {
    val label = item.optString("label").ifBlank { "Chat" }
    val longLabel = item.optString("longLabel").ifBlank { label }
    val packageName = context.packageName

    // Explicit flags: with none, Android adds "new task + clear task + task on home", which restarts SYPH's screen.
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(item.getString("url")))
      .setClassName(packageName, "$packageName.MainActivity")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)

    return ShortcutInfo.Builder(context, "chat_${item.getString("id")}")
      .setShortLabel(label)
      .setLongLabel(longLabel)
      .setIcon(Icon.createWithBitmap(avatar(item.optString("letter", "?"), parseColor(item.optString("color"), Color.BLACK), parseColor(item.optString("letterColor"), Color.WHITE))))
      .setIntent(intent)
      .setRank(rank)
      .build()
  }

  private fun parseColor(value: String, fallback: Int): Int =
    try {
      Color.parseColor(value)
    } catch (error: IllegalArgumentException) {
      fallback
    }

  /** The same square avatar as in the app: the person's initial on the theme's accent colour. */
  private fun avatar(letter: String, background: Int, foreground: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(background)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = foreground
    paint.textSize = ICON_PX * 0.5f
    paint.typeface = Typeface.DEFAULT_BOLD
    paint.textAlign = Paint.Align.CENTER
    // Centre on the glyph's height rather than the font's line box.
    val baseline = ICON_PX / 2f - (paint.descent() + paint.ascent()) / 2f
    canvas.drawText(letter.take(2), ICON_PX / 2f, baseline, paint)
    return bitmap
  }
}
