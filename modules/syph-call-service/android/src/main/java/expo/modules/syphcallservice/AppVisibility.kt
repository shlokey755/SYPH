package expo.modules.syphcallservice

import android.app.ActivityManager
import android.content.Context
import android.os.Process
import android.util.Log

/**
 * Is SYPH on the screen right now? Read from Android itself (the importance of SYPH's own process), so it is right even when
 * SYPH's process was only just started by a push, or when its JavaScript is still alive in the background.
 *
 * A call that arrives while SYPH is on the screen is rung by the app (the Accept / Decline screen inside SYPH). In every other
 * case (closed, in the background, phone locked) the native side rings and opens the call screen. Only the top importance
 * counts: a SYPH that merely keeps a call going in the background is not "on the screen".
 *
 * Not yet verified on a device.
 */
internal object AppVisibility {
  fun onScreen(context: Context): Boolean =
    try {
      val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val mine = Process.myPid()
      manager.runningAppProcesses?.any {
        it.pid == mine && it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
      } ?: false
    } catch (error: Exception) {
      Log.w("SyphAppVisibility", "Could not tell whether SYPH is on screen", error)
      false
    }
}
