package expo.modules.syphcallservice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import java.util.concurrent.atomic.AtomicInteger

/**
 * The ring of an incoming call while SYPH is open: the phone's own ringtone, looping, with the buzz alongside it.
 *
 * It is the first choice for ringing, ahead of react-native-incall-manager (services/callAudio.ts), which plays the ringtone with a
 * plain MediaPlayer. A plain MediaPlayer can open the ringtone only when the app may read it, and a ringtone on the phone's shared
 * storage needs the audio-files permission (READ_MEDIA_AUDIO, or READ_EXTERNAL_STORAGE before Android 13): without it the call
 * rings silently and nothing tells JavaScript. Android's `Ringtone` player has no such limit: when the app cannot open the file
 * it plays through the system's own ringtone player, which can, the way the phone's own Settings plays a ringtone.
 *
 * It rings the way the phone does: the ringtone only when the ringer is on and its volume is up (so silent mode is respected),
 * the buzz whenever the ringer is not on silent, and other audio gives way while it rings. A ring that cannot start leaves the
 * other half going, so a phone that cannot play the ringtone still buzzes.
 *
 * A ring ends when `stop` is called, when `seconds` pass, or after `LIMIT_MS` if JavaScript never says: a call is given up after
 * 45 s (RING_TIMEOUT_MS in utils/call.ts), so a ring is never left going. Everything runs on the main thread.
 */
internal object RingtonePlayer {
  private const val TAG = "SyphRingtone"

  /** The longest anything rings: a call is given up after 45 s, plus slack. */
  private const val LIMIT_MS = 60_000L

  /** Before Android 9 a `Ringtone` cannot loop by itself, so it is looked at this often and started again when it has ended. */
  private const val REPLAY_MS = 1_000L

  private val handler = Handler(Looper.getMainLooper())

  /** Counts starts and stops as they are asked for, so a start that a later stop has overtaken (both wait for the main thread) does nothing. */
  private val requests = AtomicInteger(0)

  /** How a ring is heard and felt: the ringtone volume, and the system's own rules for a ringing phone (silent mode, Do Not Disturb). */
  private val ringSound: AudioAttributes =
    AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

  // What is going now. Only touched on the main thread. The two timers are kept so that ending a ring takes back its own timers and
  // nothing else: a start that is already waiting in the handler's queue (a stop and a new start often come together) must stay.
  private var ringtone: Ringtone? = null
  private var vibrator: Vibrator? = null
  private var leaveFocus: (() -> Unit)? = null
  private var timeUp: Runnable? = null
  private var replay: Runnable? = null

  /**
   * Starts ringing: the ringtone when the ringer is on and its volume is up, and `pattern` (Android's [wait, buzz, pause, buzz...]
   * form, empty for no buzz) when the ringer is not on silent. A ring already going is replaced. `seconds` above 0 ends the ring by
   * itself after that long (the Test button). Always true: the work is queued for the main thread.
   */
  fun start(context: Context, pattern: LongArray, seconds: Double): Boolean {
    val app = context.applicationContext
    val limit = if (seconds.isFinite() && seconds > 0) (seconds * 1000).toLong().coerceIn(1L, LIMIT_MS) else LIMIT_MS
    val mine = requests.incrementAndGet()
    handler.post { begin(app, pattern, limit, mine) }
    return true
  }

  /** Stops the ringtone and the buzz. Does nothing when nothing is ringing. */
  fun stop() {
    requests.incrementAndGet()
    handler.post { end() }
  }

  private fun begin(app: Context, pattern: LongArray, limit: Long, mine: Int) {
    if (mine != requests.get()) return // a stop was asked for after this start
    end()
    val audio = app.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    val mode = audio?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL
    val loud = mode == AudioManager.RINGER_MODE_NORMAL && (audio == null || audio.getStreamVolume(AudioManager.STREAM_RING) > 0)
    if (loud) {
      try {
        ring(app, audio)
      } catch (error: Exception) {
        Log.w(TAG, "Could not play the ringtone", error)
      }
    }
    if (mode != AudioManager.RINGER_MODE_SILENT && pattern.isNotEmpty()) {
      try {
        buzz(app, pattern)
      } catch (error: Exception) {
        Log.w(TAG, "Could not buzz", error)
      }
    }
    val finish = Runnable { end() }
    timeUp = finish
    handler.postDelayed(finish, limit)
  }

  private fun ring(app: Context, audio: AudioManager?) {
    val found = RingtoneManager.getRingtone(app, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
    if (found == null) {
      Log.w(TAG, "The phone has no ringtone")
      return
    }
    found.audioAttributes = ringSound
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) found.isLooping = true
    if (audio != null) takeFocus(audio)
    found.play()
    ringtone = found
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) replayWhenDone()
  }

  /** Asks other audio (music, video) to pause while the phone rings. The ring does not wait for an answer: a refusal is no reason for a silent call. */
  @Suppress("DEPRECATION")
  private fun takeFocus(audio: AudioManager) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(ringSound).build()
        audio.requestAudioFocus(request)
        leaveFocus = { audio.abandonAudioFocusRequest(request) }
      } else {
        val listener = AudioManager.OnAudioFocusChangeListener { }
        audio.requestAudioFocus(listener, AudioManager.STREAM_RING, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        leaveFocus = { audio.abandonAudioFocus(listener) }
      }
    } catch (error: Exception) {
      Log.w(TAG, "Could not ask other audio to give way", error)
    }
  }

  /** Android 8 and older: the ringtone plays once, so it is started again each time it is found to have ended. */
  private fun replayWhenDone() {
    val again =
      object : Runnable {
        override fun run() {
          val current = ringtone ?: return
          try {
            if (!current.isPlaying) current.play()
          } catch (error: Exception) {
            Log.w(TAG, "Could not play the ringtone again", error)
          }
          handler.postDelayed(this, REPLAY_MS)
        }
      }
    replay = again
    handler.postDelayed(again, REPLAY_MS)
  }

  /**
   * The buzz, played once through (the pattern is written out long enough for a whole ring, see ringVibrationPattern). It carries
   * the ringtone's attributes, so Android applies its own rules for a ringing phone to it (none on silent, and the
   * "vibrate for calls" setting).
   */
  @Suppress("DEPRECATION")
  private fun buzz(app: Context, pattern: LongArray) {
    val device =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (app.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
      } else {
        app.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
    if (device == null || !device.hasVibrator()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      device.vibrate(VibrationEffect.createWaveform(pattern, -1), ringSound)
    } else {
      device.vibrate(pattern, -1, ringSound)
    }
    vibrator = device
  }

  /** Stops everything this started, and nothing else: a buzz that was not this ring's is left alone. */
  private fun end() {
    timeUp?.let { handler.removeCallbacks(it) }
    timeUp = null
    replay?.let { handler.removeCallbacks(it) }
    replay = null
    try {
      ringtone?.stop()
    } catch (error: Exception) {
      Log.w(TAG, "Could not stop the ringtone", error)
    }
    ringtone = null
    try {
      vibrator?.cancel()
    } catch (error: Exception) {
      Log.w(TAG, "Could not stop the buzz", error)
    }
    vibrator = null
    try {
      leaveFocus?.invoke()
    } catch (error: Exception) {
      Log.w(TAG, "Could not give other audio its focus back", error)
    }
    leaveFocus = null
  }
}
