package pnunag.bibleapp.widgets

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.Preferences
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
private val KEY_SYNC_DATE   = stringPreferencesKey("widget_sync_date")
private val KEY_GOAL_CARDS  = intPreferencesKey("widget_vocab_goal_cards")
private val KEY_DONE_CARDS  = intPreferencesKey("widget_vocab_done_cards")

class VocabWidget : GlanceAppWidget() {

    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            val state = currentState<Preferences>()
            val stale = isSnapshotStale(state[KEY_SYNC_DATE] ?: "")

            VocabWidgetContent(
                goalCards = state[KEY_GOAL_CARDS] ?: 0,
                doneCards = if (stale) 0 else state[KEY_DONE_CARDS] ?: 0,
            )
        }
    }
}

@Composable
private fun VocabWidgetContent(
    goalCards: Int,
    doneCards: Int,
) {
    val launchIntent = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("bibleapp://vocabulary")
    ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    val showGoal  = goalCards > 0
    val progress  = if (showGoal) (doneCards.toFloat() / goalCards).coerceIn(0f, 1f) else 0f
    val goalMet   = showGoal && doneCards >= goalCards

    val goalCaption = when {
        !showGoal -> "No daily goal set"
        goalMet   -> "Daily goal complete"
        else      -> "$doneCards of $goalCards cards today"
    }

    val type  = rememberTypeScale(2.2f)
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

                // ── Label + pill ──────────────────────────────────────────────
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Vertical.CenterVertically,
                ) {
                    Column(modifier = GlanceModifier.defaultWeight()) {
                        SectionLabel("GREEK VOCABULARY", fontSize = type.label)
                    }
                    StatusPill(
                        text      = if (goalMet) "Goal met" else "Practice",
                        fontSize  = type.caption,
                        highlight = goalMet,
                    )
                }

                Spacer(modifier = GlanceModifier.height(6.dp))

                // ── Progress bar ──────────────────────────────────────────────
                if (showGoal) {
                    ProgressTrack(
                        progress   = progress,
                        trackWidth = width,
                        barHeight  = (type.caption.value * 0.40f).coerceIn(4f, 7f),
                    )
                    Spacer(modifier = GlanceModifier.height(5.dp))
                }

                // ── Caption ───────────────────────────────────────────────────
                Text(
                    text  = goalCaption,
                    style = TextStyle(
                        color      = if (goalMet) WidgetTheme.Accent else WidgetTheme.Muted,
                        fontSize   = type.body,
                        fontWeight = if (goalMet) FontWeight.Bold else FontWeight.Normal,
                    ),
                    maxLines = 1,
                )
            }
        }
    }
}

class VocabWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = VocabWidget()
}
