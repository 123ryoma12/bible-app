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
private val KEY_SYNC_DATE   = stringPreferencesKey("widget_sync_date")
private val KEY_BOOK_ID     = stringPreferencesKey("widget_bible_book_id")
private val KEY_BOOK_NAME   = stringPreferencesKey("widget_bible_book_name")
private val KEY_CHAPTER     = intPreferencesKey("widget_bible_chapter")
private val KEY_TODAY_COUNT = intPreferencesKey("widget_bible_chapters_today")
private val KEY_PER_DAY     = intPreferencesKey("widget_bible_chapters_per_day")
private val KEY_HAS_GOAL    = booleanPreferencesKey("widget_bible_has_goal")
private val KEY_SNIPPET     = stringPreferencesKey("widget_bible_verse_snippet")

class BibleWidget : GlanceAppWidget() {

    /** Exact sizing so typography can scale with the placed widget size. */
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // Everything must be read from Glance state *inside* provideContent.
        // This function body runs once per composition session, so values read
        // out here would be captured and never refreshed — see the note on
        // pushPrefsToGlanceState. currentState is observable, so recomposition
        // triggered by updateAll() picks up the newest sync.
        provideContent {
            val state = currentState<Preferences>()

            // "Chapters read today" only holds for the day it was written.
            val stale = isSnapshotStale(state[KEY_SYNC_DATE] ?: "")

            BibleWidgetContent(
                bookId       = state[KEY_BOOK_ID] ?: "",
                bookName     = state[KEY_BOOK_NAME] ?: "",
                chapter      = state[KEY_CHAPTER] ?: 0,
                todayCount   = if (stale) 0 else state[KEY_TODAY_COUNT] ?: 0,
                perDay       = state[KEY_PER_DAY] ?: 0,
                hasGoal      = state[KEY_HAS_GOAL] ?: false,
                verseSnippet = state[KEY_SNIPPET] ?: "",
            )
        }
    }
}

@Composable
private fun BibleWidgetContent(
    bookId: String,
    bookName: String,
    chapter: Int,
    todayCount: Int,
    perDay: Int,
    hasGoal: Boolean,
    verseSnippet: String,
) {
    // Carry the chapter being advertised so tapping opens exactly what the
    // widget shows. Without it the app would resume its own saved position,
    // which is the chapter *before* this one.
    val target = if (bookId.isNotBlank() && chapter > 0) {
        "bibleapp://reader?book=$bookId&chapter=$chapter"
    } else {
        "bibleapp://reader"
    }
    val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse(target)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    val passage = when {
        bookName.isNotBlank() && chapter > 0 -> "$bookName $chapter"
        bookName.isNotBlank()                -> bookName
        else                                 -> ""
    }
    val isEmpty  = passage.isBlank()
    val showGoal = hasGoal && perDay > 0
    val goalMet  = showGoal && todayCount >= perDay
    val progress = if (perDay > 0) (todayCount.toFloat() / perDay).coerceIn(0f, 1f) else 0f

    // Label + title + body + (optional) goal block.
    val rows  = if (showGoal) 4.2f else 3.4f
    val type  = rememberTypeScale(rows)
    val width = contentWidthDp()

    // Fill whatever vertical room the body has with as many lines as fit.
    val heightDp  = LocalSize.current.height.value
    val bodyLines = ((heightDp - 78f) / (type.body.value * 1.35f)).toInt().coerceIn(2, 12)

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
                verticalAlignment = Alignment.Vertical.Top,
            ) {

                // ── Header: label + today chip ────────────────────────────────
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Vertical.CenterVertically,
                ) {
                    Box(modifier = GlanceModifier.defaultWeight()) {
                        SectionLabel(
                            text = if (isEmpty) "BIBLE" else "CONTINUE READING",
                            fontSize = type.label,
                        )
                    }
                    if (!isEmpty) {
                        val chip = when (todayCount) {
                            0    -> "None today"
                            1    -> "1 today"
                            else -> "$todayCount today"
                        }
                        StatusPill(text = chip, fontSize = type.caption, highlight = goalMet)
                    }
                }

                Spacer(modifier = GlanceModifier.height(8.dp))

                if (isEmpty) {
                    Text(
                        text = "Open the app to start reading",
                        style = TextStyle(
                            color = WidgetTheme.Muted,
                            fontSize = type.body,
                            fontStyle = FontStyle.Italic,
                        ),
                        modifier = GlanceModifier.defaultWeight(),
                    )
                } else {
                    // ── Chapter title ─────────────────────────────────────────
                    Text(
                        text = passage,
                        style = TextStyle(
                            color = WidgetTheme.Heading,
                            fontSize = type.title,
                            fontWeight = FontWeight.Bold,
                        ),
                        maxLines = 1,
                    )

                    Spacer(modifier = GlanceModifier.height(6.dp))

                    // ── Verse body ────────────────────────────────────────────
                    Text(
                        text = verseSnippet.ifBlank { "Tap to continue reading" },
                        style = TextStyle(
                            color = if (verseSnippet.isBlank()) WidgetTheme.Muted else WidgetTheme.Text,
                            fontSize = type.body,
                            fontStyle = if (verseSnippet.isBlank()) FontStyle.Italic else FontStyle.Normal,
                        ),
                        maxLines = bodyLines,
                        modifier = GlanceModifier.defaultWeight(),
                    )

                    // ── Goal progress ─────────────────────────────────────────
                    if (showGoal) {
                        Spacer(modifier = GlanceModifier.height(8.dp))
                        ProgressTrack(
                            progress   = progress,
                            trackWidth = width,
                            barHeight  = (type.caption.value * 0.42f).coerceIn(4f, 8f),
                        )
                        Spacer(modifier = GlanceModifier.height(5.dp))
                        Text(
                            text = if (goalMet) "Daily goal complete"
                                   else "$todayCount of $perDay chapters today",
                            style = TextStyle(
                                color = if (goalMet) WidgetTheme.Accent else WidgetTheme.Muted,
                                fontSize = type.caption,
                                fontWeight = if (goalMet) FontWeight.Bold else FontWeight.Normal,
                            ),
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

class BibleWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BibleWidget()
}
