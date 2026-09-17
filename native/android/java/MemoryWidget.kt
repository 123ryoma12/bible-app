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
private val KEY_SYNC_DATE     = stringPreferencesKey("widget_sync_date")
private val KEY_ID            = stringPreferencesKey("widget_memory_id")
private val KEY_REFERENCE     = stringPreferencesKey("widget_memory_reference")
private val KEY_LAST_REVIEWED = stringPreferencesKey("widget_memory_last_reviewed")
private val KEY_REVIEW_COUNT  = intPreferencesKey("widget_memory_review_count")
private val KEY_GOAL_VERSES   = intPreferencesKey("widget_memory_goal_verses")
private val KEY_DONE_VERSES   = intPreferencesKey("widget_memory_done_verses")

/**
 * How long ago the set was last drilled, phrased for a glance.
 *
 * The bridge sends a plain date rather than a ready-made string so this stays
 * truthful even when the app hasn't run for a while: the widget recomputes the
 * gap against the current date every time it recomposes.
 */
private fun reviewedLabel(lastReviewed: String): String {
    val days = daysSinceDate(lastReviewed) ?: return "Never reviewed"
    return when {
        days <= 0    -> "Reviewed today"
        days == 1    -> "Reviewed yesterday"
        days < 7     -> "Reviewed ${days}d ago"
        days < 31    -> "Reviewed ${days / 7}w ago"
        days < 365   -> "Reviewed ${days / 30}mo ago"
        else         -> "Reviewed ${days / 365}y ago"
    }
}

class MemoryWidget : GlanceAppWidget() {

    /** Exact sizing so typography can scale with the placed widget size. */
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // Read from Glance state inside provideContent so recomposition sees
        // each new sync — see the note on pushPrefsToGlanceState.
        provideContent {
            val state = currentState<Preferences>()
            val entryId = state[KEY_ID] ?: ""

            // Verses revised is a daily figure — don't carry it into a new day.
            val stale = isSnapshotStale(state[KEY_SYNC_DATE] ?: "")

            MemoryWidgetContent(
                reference    = state[KEY_REFERENCE] ?: "",
                lastReviewed = state[KEY_LAST_REVIEWED] ?: "",
                reviewCount  = state[KEY_REVIEW_COUNT] ?: 0,
                goalVerses   = state[KEY_GOAL_VERSES] ?: 0,
                doneVerses   = if (stale) 0 else state[KEY_DONE_VERSES] ?: 0,
                // Carry the set being advertised so the drill opens on exactly
                // the verse shown, rather than whatever tops the queue by the
                // time the app finishes launching.
                deepLink     = if (entryId.isNotBlank()) {
                    "bibleapp://memory?drill=1&id=$entryId"
                } else {
                    "bibleapp://memory"
                },
            )
        }
    }
}

@Composable
private fun MemoryWidgetContent(
    reference: String,
    lastReviewed: String,
    reviewCount: Int,
    goalVerses: Int,
    doneVerses: Int,
    deepLink: String,
) {
    val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    val hasVerse = reference.isNotBlank()

    // Daily revision goal, presented exactly as the Prayer and Bible widgets
    // present theirs: a bar with "x of y ... today" underneath.
    val showGoal = goalVerses > 0
    val progress = if (showGoal) doneVerses.toFloat() / goalVerses else 0f
    val goalMet  = showGoal && doneVerses >= goalVerses

    // "Reviewed 3d ago · 12 recalls" — the same two facts the Memory tab shows
    // under each memorised row, so the widget and the list agree.
    val meta = if (hasVerse) {
        val reviewed = reviewedLabel(lastReviewed)
        when (reviewCount) {
            0    -> reviewed
            1    -> "$reviewed · 1 recall"
            else -> "$reviewed · $reviewCount recalls"
        }
    } else {
        ""
    }

    // Vertical budget, in priority order: the reference must always be legible,
    // then the goal bar, then the meta line, then the bar's caption. Three or
    // four stacked elements in ~50dp would clip all of them.
    val heightDp    = LocalSize.current.height.value
    val showBar     = showGoal && hasVerse
    val showMeta    = hasVerse && heightDp >= (if (showBar) 92f else 66f)
    val showCaption = showBar && heightDp >= 78f

    val type = rememberTypeScale(
        when {
            !hasVerse              -> 1.7f
            showMeta && showCaption -> 3.4f
            showMeta || showCaption -> 2.7f
            showBar                -> 2.2f
            else                   -> 1.7f
        }
    )
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

                // ── Label + reference + status chip ───────────────────────────
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Vertical.CenterVertically,
                ) {
                    Column(modifier = GlanceModifier.defaultWeight()) {
                        SectionLabel("REVIEW NEXT", fontSize = type.label)
                        Spacer(modifier = GlanceModifier.height(2.dp))
                        Text(
                            text = if (hasVerse) reference else "Nothing memorised yet",
                            style = TextStyle(
                                color = if (hasVerse) WidgetTheme.Heading else WidgetTheme.Muted,
                                fontSize = if (hasVerse) type.title else type.body,
                                fontWeight = FontWeight.Bold,
                                fontStyle = if (hasVerse) FontStyle.Normal else FontStyle.Italic,
                            ),
                            maxLines = 1,
                        )
                        if (showMeta) {
                            Spacer(modifier = GlanceModifier.height(3.dp))
                            Text(
                                text = meta,
                                style = TextStyle(
                                    color = WidgetTheme.Muted,
                                    fontSize = type.caption,
                                ),
                                maxLines = 1,
                            )
                        }
                    }

                    Spacer(modifier = GlanceModifier.width(10.dp))

                    StatusPill(
                        text = when {
                            !hasVerse -> "Open"
                            goalMet   -> "Goal met"
                            else      -> "Review"
                        },
                        fontSize = type.caption,
                        highlight = goalMet,
                    )
                }

                // ── Daily revision goal ───────────────────────────────────────
                if (showBar) {
                    Spacer(modifier = GlanceModifier.height(8.dp))
                    ProgressTrack(
                        progress   = progress,
                        trackWidth = width,
                        barHeight  = (type.caption.value * 0.40f).coerceIn(4f, 7f),
                    )
                    if (showCaption) {
                        Spacer(modifier = GlanceModifier.height(5.dp))
                        Text(
                            text = if (goalMet) "Daily goal complete"
                                   else "$doneVerses of $goalVerses verses today",
                            style = TextStyle(
                                color = if (goalMet) WidgetTheme.Accent else WidgetTheme.Muted,
                                fontSize = type.caption,
                            ),
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

class MemoryWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MemoryWidget()
}
