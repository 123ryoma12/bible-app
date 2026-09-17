package pnunag.bibleapp.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import androidx.glance.appwidget.updateAll
import com.facebook.react.bridge.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Native module exposed to React Native as `NativeModules.WidgetBridge`.
 *
 * JS calls:  WidgetBridge.syncWidgetData({ key: value, ... })
 *
 * This writes all key/value pairs into a SharedPreferences file that the
 * three Glance widgets read, then triggers a widget update so the home
 * screen reflects the new data immediately.
 */
class WidgetBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WidgetBridge"

    @ReactMethod
    fun syncWidgetData(data: ReadableMap, promise: Promise) {
        try {
            val prefs: SharedPreferences = reactContext
                .getSharedPreferences("bible_widget_data", Context.MODE_PRIVATE)
            val editor = prefs.edit()

            val iter = data.keySetIterator()
            while (iter.hasNextKey()) {
                val key = iter.nextKey()
                when (data.getType(key)) {
                    ReadableType.String  -> editor.putString(key, data.getString(key))
                    ReadableType.Number  -> {
                        // Store as int when it's a whole number, float otherwise.
                        val d = data.getDouble(key)
                        if (d == kotlin.math.floor(d)) {
                            editor.putInt(key, d.toInt())
                        } else {
                            editor.putFloat(key, d.toFloat())
                        }
                    }
                    ReadableType.Boolean -> editor.putBoolean(key, data.getBoolean(key))
                    else -> {} // skip null / arrays / maps
                }
            }
            editor.apply()

            // Trigger a UI refresh on all three widgets.
            CoroutineScope(Dispatchers.Main).launch {
                try {
                    // Must happen before updateAll(): the widgets read from
                    // Glance state, which is observable, so recomposition
                    // picks up these values. Reading SharedPreferences inside
                    // provideGlance would not work — that runs once per
                    // session and would leave the widget frozen.
                    pushPrefsToGlanceState(reactContext)

                    PrayerWidget().updateAll(reactContext)
                    BibleWidget().updateAll(reactContext)
                    MemoryWidget().updateAll(reactContext)
                } catch (e: Exception) {
                    // Widget update failure is non-fatal to the app, but it
                    // means the home screen is now showing stale data, so it
                    // must be visible rather than silently swallowed.
                    android.util.Log.e("WidgetBridge", "updateAll failed", e)
                }
            }

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("WIDGET_SYNC_ERROR", e.message, e)
        }
    }
}
