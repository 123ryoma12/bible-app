package pnunag.bibleapp.widgets

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** SharedPreferences file written by the JS side (see src/data/widgetBridge.js). */
private const val PREFS_NAME = "bible_widget_data"

/** Key holding the local date the snapshot was taken, as "YYYY-MM-DD". */
private const val KEY_SYNC_DATE = "widget_sync_date"

/** Open the widget data store. */
fun widgetPrefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

/**
 * Copy the SharedPreferences snapshot into every widget's Glance state.
 *
 * This has to happen from outside [GlanceAppWidget.provideGlance]. That
 * function runs only once per composition session — `provideContent` suspends
 * and keeps the session alive — so anything read there is captured a single
 * time and never refreshed. `updateAll()` recomposes the *existing* session
 * rather than re-invoking `provideGlance`, which means values read that way
 * are frozen until the session is destroyed (widget re-added, resized, reboot,
 * process death).
 *
 * Glance state is the supported way round this: it's observable, so writing to
 * it here and then calling `updateAll()` causes recomposition to pick up the
 * new values.
 *
 * Keys are copied verbatim, so the widgets read the same names the JS bridge
 * writes and there's no mapping to keep in step.
 */
suspend fun pushPrefsToGlanceState(context: Context) {
    val snapshot = widgetPrefs(context).all
    val manager = GlanceAppWidgetManager(context)

    val widgetClasses = listOf(
        BibleWidget::class.java,
        PrayerWidget::class.java,
        MemoryWidget::class.java,
        VocabWidget::class.java,
    )

    for (widgetClass in widgetClasses) {
        for (glanceId in manager.getGlanceIds(widgetClass)) {
            updateAppWidgetState(context, PreferencesGlanceStateDefinition, glanceId) { state ->
                state.toMutablePreferences().apply {
                    for ((key, value) in snapshot) {
                        when (value) {
                            is String  -> this[stringPreferencesKey(key)]  = value
                            is Int     -> this[intPreferencesKey(key)]     = value
                            is Boolean -> this[booleanPreferencesKey(key)] = value
                            is Long    -> this[longPreferencesKey(key)]    = value
                            is Float   -> this[floatPreferencesKey(key)]   = value
                            else       -> Unit // no other types are written
                        }
                    }
                }
            }
        }
    }
}

/**
 * True when [syncDate] is from an earlier day than now. Daily counters must be
 * treated as zero in that case.
 */
fun isSnapshotStale(syncDate: String): Boolean =
    syncDate.isNotBlank() && syncDate != todayDateString()

/**
 * Local calendar date as "YYYY-MM-DD".
 *
 * Deliberately mirrors `progressStore.todayDateString()` on the JS side: local
 * time (not UTC) so a read is attributed to the user's day, and the same
 * zero-padded format so the two can be compared as plain strings.
 */
fun todayDateString(): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

/**
 * Whole days between [date] ("YYYY-MM-DD", as written by the JS bridge) and
 * today, measured in the device's local time zone.
 *
 * Returns null when the date is missing or unparseable, which callers should
 * read as "never happened" rather than "happened today". Rounding the
 * millisecond difference keeps the answer correct across daylight-saving
 * boundaries, where two local midnights are 23 or 25 hours apart.
 */
fun daysSinceDate(date: String): Int? {
    if (date.isBlank()) return null
    return try {
        val format = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val then = format.parse(date) ?: return null
        val today = format.parse(todayDateString()) ?: return null
        Math.round((today.time - then.time) / 86_400_000.0).toInt()
    } catch (e: Exception) {
        null
    }
}

/**
 * True when the snapshot was written on an earlier day than today.
 *
 * The JS bridge only runs while the app is alive, so a widget sitting on the
 * home screen overnight still holds yesterday's "read today" / "prayed today"
 * counters. Callers should treat those daily counters as zero when this
 * returns true rather than reporting stale figures as current.
 *
 * Returns false when no date has been recorded yet, so a first-run widget
 * shows whatever data it has instead of blanking out.
 */
fun SharedPreferences.isSnapshotStale(): Boolean {
    val synced = getString(KEY_SYNC_DATE, "") ?: ""
    return synced.isNotBlank() && synced != todayDateString()
}
