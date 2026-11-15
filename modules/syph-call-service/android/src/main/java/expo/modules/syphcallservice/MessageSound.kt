package expo.modules.syphcallservice

import android.content.Context
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * The sound of a new message while SYPH is open: the notification sound the person chose in the phone's settings. SYPH has no
 * message sounds of its own. Android plays it on the notification volume, so silent mode is respected. Closed or in the
 * background, the notification itself makes the same sound (the "messages" channel uses the phone's default), so a message
 * sounds the same either way.
 *
 * Audio access (READ_MEDIA_AUDIO, or READ_EXTERNAL_STORAGE before Android 13) is what lets Android play the sound when it is a
 * file on the phone; SYPH asks for it when the app starts (hooks/useCallAccessPrompt.ts).
 */
internal object MessageSound {
  private const val TAG = "SyphMessageSound"
  private val handler = Handler(Looper.getMainLooper())

  @Volatile
  private var last: Ringtone? = null

  /** Plays the phone's notification sound once, at `volume` (0 to 1; the volume control needs Android 9, older ones play at full). */
  fun play(context: Context, volume: Float): Boolean {
    val app = context.applicationContext
    handler.post {
      try {
        last?.let { if (it.isPlaying) it.stop() }
        val ringtone = RingtoneManager.getRingtone(app, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
        if (ringtone == null) {
          Log.w(TAG, "The phone has no notification sound")
          return@post
        }
        ringtone.audioAttributes =
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ringtone.volume = volume.coerceIn(0f, 1f)
        ringtone.play()
        last = ringtone
      } catch (error: Exception) {
        Log.w(TAG, "Could not play the notification sound", error)
      }
    }
    return true
  }
}
