package pnunag.bibleapp.widgets

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.*
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.currentState
import androidx.glance.layout.*
import androidx.glance.text.*

// Keys mirror the names written by src/data/widgetBridge.js.
private val KEY_SYNC_DATE = stringPreferencesKey("widget_sync_date")
private val KEY_NAME      = stringPreferencesKey("widget_prayer_name")
private val KEY_POINT_ID  = stringPreferencesKey("widget_prayer_id")
private val KEY_GOAL_SECS = intPreferencesKey("widget_prayer_goal_seconds")
private val KEY_DONE_SECS = intPreferencesKey("widget_prayer_done_seconds")
private val KEY_IS_DUE    = booleanPreferencesKey("widget_prayer_is_due")
private val KEY_WAIT_MINS = intPreferencesKey("widget_prayer_wait_mins")

/** Human friendly "ready in ..." label for a resting prayer point. */
private fun waitLabel(mins: Int): String = when {
    mins <= 0      -> "Ready"
    mins < 60      -> "Ready in ${mins}m"
    mins < 60 * 24 -> "Ready in ${mins / 60}h"
    else           -> "Ready in ${mins / (60 * 24)}d"
}

class PrayerWidget : GlanceAppWidget() {

    /** Exact sizing so typography can scale with the placed widget size. */
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // Read from Glance state inside provideContent so recomposition sees
        // each new sync — see the note on pushPrefsToGlanceState.
        provideContent {
            val state = currentState<Preferences>()

            // Seconds prayed is a daily figure — don't carry it into a new day.
            val stale = isSnapshotStale(state[KEY_SYNC_DATE] ?: "")

            PrayerWidgetContent(
                name     = state[KEY_NAME] ?: "",
                goalSecs = state[KEY_GOAL_SECS] ?: 600,
                doneSecs = if (stale) 0 else state[KEY_DONE_SECS] ?: 0,
                isDue    = state[KEY_IS_DUE] ?: true,
                waitMins = state[KEY_WAIT_MINS] ?: 0,
                deepLink = "bibleapp://prayer?id=${state[KEY_POINT_ID] ?: ""}",
            )
        }
    }
}

@Composable
private fun PrayerWidgetContent(
    name: String,
    goalSecs: Int,
    doneSecs: Int,
    isDue: Boolean,
    waitMins: Int,
    deepLink: String,
) {
    val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    val isEmpty    = name.isBlank()
    val progress   = if (goalSecs > 0) (doneSecs.toFloat() / goalSecs).coerceIn(0f, 1f) else 0f
    val goalMet    = progress >= 1f
    val remainMins = ((goalSecs - doneSecs).coerceAtLeast(0)) / 60

    // A resting point can't be prayed yet, so its availability takes priority
    // over the daily-goal countdown in the status chip.
    val statusText = when {
        isEmpty         -> ""
        !isDue          -> waitLabel(waitMins)
        goalMet         -> "Complete"
        remainMins == 0 -> "<1 min left"
        remainMins == 1 -> "1 min left"
        else            -> "$remainMins min left"
    }

    // Label + title, plus a thin progress bar.
    val type  = rememberTypeScale(if (isEmpty) 1.5f else 1.9f)
    val width = contentWidthDp()

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(WidgetTheme.cardBackground)
            .clickable(actionStartActivity(launchIntent)),
    ) {
        Row(modifier = GlanceModifier.fillMaxSize()) {

            AccentStripe()

            Column(
                modifier = GlanceModifier
                    .fillMaxSize()
                    .padding(
                        start  = WidgetTheme.H_PADDING_DP.dp,
                        end    = WidgetTheme.H_PADDING_DP.dp,
                        top    = WidgetTheme.V_PADDING_DP.dp,
                        bottom = WidgetTheme.V_PADDING_DP.dp,
                    ),
                verticalAlignment = Alignment.Vertical.CenterVertically,
            ) {

                // ── Label + name + status chip ────────────────────────────────
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Vertical.CenterVertically,
                ) {
                    Column(modifier = GlanceModifier.defaultWeight()) {
                        SectionLabel(
                            text = if (isDue) "PRAY FOR" else "NEXT UP",
                            fontSize = type.label,
                        )
                        Spacer(modifier = GlanceModifier.height(2.dp))
                        Text(
                            text = if (isEmpty) "No prayer points yet" else name,
                            style = TextStyle(
                                color = if (isEmpty) WidgetTheme.Muted else WidgetTheme.Heading,
                                fontSize = if (isEmpty) type.body else type.title,
                                fontWeight = FontWeight.Bold,
                                fontStyle = if (isEmpty) FontStyle.Italic else FontStyle.Normal,
                            ),
                            maxLines = 1,
                        )
                    }

                    if (!isEmpty) {
                        Spacer(modifier = GlanceModifier.width(10.dp))
                        StatusPill(
                            text = statusText,
                            fontSize = type.caption,
                            highlight = goalMet,
                        )
                    }
                }

                // ── Progress bar ──────────────────────────────────────────────
                if (!isEmpty) {
                    Spacer(modifier = GlanceModifier.height(8.dp))
                    ProgressTrack(
                        progress   = progress,
                        trackWidth = width,
                        barHeight  = (type.caption.value * 0.40f).coerceIn(4f, 7f),
                    )
                }
            }
        }
    }
}

class PrayerWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = PrayerWidget()
}
