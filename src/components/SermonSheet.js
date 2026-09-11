// Bottom sheet listing sermons for the book (and chapter) currently open in the
// reader, sourced from Gospel in Life.
//
// Fetching is deliberately lazy: the listing is not requested until the sheet
// is opened and is never cached, so every open is a fresh look at the site.
// Closing the sheet aborts any request still in flight.
//
// The list is split into two sections — the exact chapter first, then the whole
// book — because the chapter is the reason you tapped, but the book is where
// you browse.
//
// A second view lists sermons whose audio has been downloaded (see
// sermonDownloads). It deliberately shares the same row, so downloading,
// removing and playing work identically wherever a sermon appears, and it is
// readable with no connection at all — which is when it earns its keep.

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  SectionList,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { uiFont } from "../theme/fonts";
import { useTheme } from "../theme/ThemeContext";
import {
  fetchSermonsForChapter,
  fetchMoreBookSermons,
  isAbortError,
  ErrorKind,
  BOOK_PAGE_SIZE,
  CONGREGATIONS,
} from "../data/combinedSermonApi";
import {
  useSermonSources,
  toggleSource,
  toggleCongregation,
  GOSPEL_IN_LIFE_SOURCE_ID,
  CORNERSTONE_SOURCE_ID,
} from "../data/sermonSourcesStore";
import {
  useSermonDownloads,
  downloadSermon,
  cancelDownload,
  removeDownload,
  formatDownloadSize,
  totalDownloadedBytes,
  DOWNLOADS_SUPPORTED,
} from "../data/sermonDownloads";

// Copy for each failure. Only transient problems offer a retry — showing one on
// a book that simply has no sermons would be a lie, since retrying can never
// change the answer.
const FAILURE_COPY = {
  [ErrorKind.OFFLINE]: {
    icon: "wifi-off",
    title: "Internet required",
    // Worth being explicit: this app reads offline, and a bare connection error
    // inside it could easily be misread as the Bible itself needing a network.
    body: "You'll need to be online to browse sermons. Your Bible reading works offline as usual.",
  },
  [ErrorKind.BLOCKED]: {
    icon: "shield-alert-outline",
    title: "Blocked by your browser",
    body: "The browser wouldn't allow the request. This doesn't happen in the mobile app.",
  },
  [ErrorKind.TIMEOUT]: {
    icon: "timer-sand",
    title: "Taking too long",
    body: "One or more sermon sources is slow to respond right now.",
  },
  [ErrorKind.SERVER]: {
    icon: "cloud-off-outline",
    title: "Couldn't reach sermon source",
    body: "A sermon site may be down for a moment. Try again shortly.",
  },
  [ErrorKind.UNKNOWN]: {
    icon: "alert-circle-outline",
    title: "Something went wrong",
    body: "Sermons couldn't be loaded just now.",
  },
};

export default function SermonSheet({
  visible,
  onClose,
  book,
  chapterNumber,
  onSelectSermon,
  activeSermonId,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const downloads = useSermonDownloads();
  const sources = useSermonSources();

  // browse | downloads | sources. Browsing is the default because the sheet
  // was opened from a chapter, and that chapter's sermons are the reason for
  // the tap.
  const [view, setView] = useState("browse");

  const [status, setStatus] = useState("loading"); // loading | ready | failed
  const [failureKind, setFailureKind] = useState(null);
  const [chapterSermons, setChapterSermons] = useState([]);
  const [bookSermons, setBookSermons] = useState([]);
  const [bookTotal, setBookTotal] = useState(0);
  const [bookTotalPages, setBookTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const abortRef = useRef(null);
  const bookName = book?.name;

  const load = useCallback(async () => {
    // Supersede any previous attempt so a slow first request can't overwrite
    // the results of a retry.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setFailureKind(null);

    try {
      const result = await fetchSermonsForChapter(bookName, chapterNumber, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setChapterSermons(result.chapterSermons);
      setBookSermons(result.bookSermons);
      setBookTotal(result.bookTotal);
      setBookTotalPages(result.bookTotalPages);
      setPage(1);
      setStatus("ready");
    } catch (err) {
      // A cancellation is not a failure — the sheet is already closing.
      if (isAbortError(err) || controller.signal.aborted) return;
      setFailureKind(err?.kind ?? ErrorKind.UNKNOWN);
      setStatus("failed");
    }
  }, [bookName, chapterNumber]);

  // Fetch on open, not on chapter change, so simply reading never touches the
  // network. Aborts on close.
  useEffect(() => {
    if (!visible || !bookName) return undefined;
    load();
    return () => abortRef.current?.abort();
  }, [visible, bookName, chapterNumber, load]);

  // Re-fetch when the user changes sources while the sheet is open, so the
  // browse view immediately reflects the new selection. Sources view changes
  // don't trigger a fetch themselves — the reload fires when `enabledSources`
  // or `cornerstoneCongregations` changes, regardless of current view.
  const enabledSourcesKey = sources.enabledSources.slice().sort().join(",");
  const congregationsKey = sources.cornerstoneCongregations.slice().sort().join(",");
  const prevSourcesKey = useRef(null);
  useEffect(() => {
    const key = enabledSourcesKey + "|" + congregationsKey;
    if (prevSourcesKey.current === null) {
      prevSourcesKey.current = key;
      return;
    }
    if (prevSourcesKey.current !== key) {
      prevSourcesKey.current = key;
      if (visible && bookName) load();
    }
  }, [enabledSourcesKey, congregationsKey, visible, bookName, load]);

  // Every open starts on the chapter you're reading. Leaving the sheet parked
  // on Downloads would bury the reason it was opened.
  useEffect(() => {
    if (visible) setView("browse");
  }, [visible]);

  // Tapping the trailing control means different things depending on where the
  // sermon has got to, so the row asks for an action and this decides.
  const handleDownloadAction = useCallback(
    (sermon, state) => {
      if (state === "downloaded" || state === "remove") {
        Alert.alert(
          "Remove download?",
          `"${sermon.title}" will need to be downloaded again to play offline.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Remove",
              style: "destructive",
              onPress: () => removeDownload(sermon.id),
            },
          ]
        );
        return;
      }
      if (state === "downloading") {
        cancelDownload(sermon.id);
        return;
      }
      // Idle or previously failed — either way, try.
      downloadSermon(sermon);
    },
    []
  );

  const loadMore = useCallback(async () => {
    if (status !== "ready" || loadingMore) return;
    if (page >= bookTotalPages) return;

    setLoadingMore(true);
    const next = page + 1;
    try {
      const result = await fetchMoreBookSermons(bookName, next, {
        signal: abortRef.current?.signal,
      });
      // Guard against duplicates if a page somehow arrives twice.
      setBookSermons((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...result.sermons.filter((s) => !seen.has(s.id))];
      });
      setPage(next);
    } catch {
      // Failing to extend the list is not worth destroying what's already on
      // screen. `page` is left unchanged, so scrolling again simply retries.
    } finally {
      setLoadingMore(false);
    }
  }, [status, loadingMore, page, bookTotalPages, bookName]);

  // A book with no sermons at all. Resolved without hitting the sermon
  // endpoint, so this appears immediately rather than after a spinner.
  const bookIsEmpty =
    status === "ready" && bookTotal === 0 && chapterSermons.length === 0;

  const sections = useMemo(() => {
    if (status !== "ready" || bookIsEmpty) return [];

    // Anything already listed under the chapter is dropped from the book list
    // below, so no sermon appears twice. Filtering here (rather than at fetch
    // time) means every page loaded by infinite scroll is covered too.
    const shownAbove = new Set(chapterSermons.map((s) => s.id));
    const remaining = shownAbove.size
      ? bookSermons.filter((s) => !shownAbove.has(s.id))
      : bookSermons;

    // The chapter's sermons are a subset of the book's, so the book count has
    // to shed them as well or the header would promise more than it lists.
    const remainingTotal = Math.max(bookTotal - shownAbove.size, 0);

    const built = [
      {
        key: "chapter",
        title: `${bookName} ${chapterNumber}`,
        // A sentinel keeps the section header visible so the absence of
        // chapter sermons is stated outright instead of silently omitted.
        data: chapterSermons.length ? chapterSermons : [{ __placeholder: true }],
      },
    ];

    // In short books every sermon can belong to the chapter you're reading —
    // Amos, Hosea, Malachi and Zechariah all do — which would leave a bare
    // "Elsewhere" heading over nothing. Drop the section entirely instead.
    if (remainingTotal > 0) {
      built.push({
        key: "book",
        // "All of John" would be a lie once the chapter's sermons have been
        // lifted out of it, so the wording follows what's actually shown.
        title: shownAbove.size ? `Elsewhere in ${bookName}` : `All of ${bookName}`,
        count: remainingTotal,
        data: remaining,
      });
    }

    return built;
  }, [status, bookIsEmpty, bookName, chapterNumber, chapterSermons, bookSermons, bookTotal]);

  // Both views render the same row, and each row needs the same download
  // wiring, so it's assembled in one place.
  const renderSermonRow = useCallback(
    (sermon, { inDownloads = false } = {}) => {
      const id = String(sermon.id);
      const inFlight = downloads.active[id];
      const downloadState = downloads.byId[id]
        ? inDownloads
          ? "remove"
          : "downloaded"
        : inFlight?.failed
          ? "failed"
          : inFlight
            ? "downloading"
            : "idle";

      return (
        <SermonRow
          sermon={sermon}
          colors={colors}
          isActive={id === String(activeSermonId)}
          onPress={() => onSelectSermon?.(sermon)}
          downloadState={downloadState}
          progress={inFlight?.progress ?? null}
          onDownloadAction={() => handleDownloadAction(sermon, downloadState)}
        />
      );
    },
    [colors, downloads, activeSermonId, onSelectSermon, handleDownloadAction]
  );

  const renderDownloads = () => {
    if (!downloads.ready) {
      return (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }

    if (!downloads.entries.length) {
      return (
        <View style={styles.centred}>
          <MaterialCommunityIcons
            name="tray-arrow-down"
            size={40}
            color={colors.mutedText}
          />
          <Text style={[styles.centredTitle, { color: colors.text }]}>
            Nothing downloaded yet
          </Text>
          <Text style={[styles.centredBody, { color: colors.mutedText }]}>
            Tap the download icon beside any sermon to keep a copy on your phone.
            Downloads play without a connection.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={downloads.entries}
        keyExtractor={(item) => item.id}
        extraData={downloads}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 12 }}
        renderItem={({ item }) => renderSermonRow(item, { inDownloads: true })}
      />
    );
  };

  const renderSources = () => {
    return (
      <SourcesPicker
        sources={sources}
        colors={colors}
        onToggleSource={toggleSource}
        onToggleCongregation={toggleCongregation}
      />
    );
  };

  const renderBody = () => {
    if (view === "downloads") return renderDownloads();
    if (view === "sources") return renderSources();

    if (status === "loading") {
      return (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.centredBody, { color: colors.mutedText }]}>
            Finding sermons…
          </Text>
        </View>
      );
    }

    if (status === "failed") {
      const copy = FAILURE_COPY[failureKind] ?? FAILURE_COPY[ErrorKind.UNKNOWN];
      return (
        <View style={styles.centred}>
          <MaterialCommunityIcons name={copy.icon} size={40} color={colors.mutedText} />
          <Text style={[styles.centredTitle, { color: colors.text }]}>{copy.title}</Text>
          <Text style={[styles.centredBody, { color: colors.mutedText }]}>{copy.body}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { borderColor: colors.accent }]}
            onPress={load}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={[styles.retryText, { color: colors.accent }]}>Try again</Text>
          </TouchableOpacity>

          {/* Being offline is exactly when downloads matter, so say so instead
              of leaving them behind a tab the user may not think to check. */}
          {downloads.entries.length > 0 && (
            <TouchableOpacity
              style={styles.centredLink}
              onPress={() => setView("downloads")}
              accessibilityRole="button"
              accessibilityLabel={`Play your ${downloads.entries.length} downloaded sermons`}
            >
              <Text style={[styles.centredLinkText, { color: colors.accent }]}>
                Play your {downloads.entries.length} downloaded{" "}
                {downloads.entries.length === 1 ? "sermon" : "sermons"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (bookIsEmpty) {
      // Deliberately no retry button — this is a settled fact, not a failure.
      return (
        <View style={styles.centred}>
          <MaterialCommunityIcons
            name="book-off-outline"
            size={40}
            color={colors.mutedText}
          />
          <Text style={[styles.centredTitle, { color: colors.text }]}>
            No sermons for {bookName}
          </Text>
          <Text style={[styles.centredBody, { color: colors.mutedText }]}>
            None of your selected sources have sermons on this book yet.
          </Text>
        </View>
      );
    }

    return (
      <SectionList
        sections={sections}
        keyExtractor={(item, index) =>
          item.__placeholder ? `placeholder-${index}` : String(item.id)
        }
        extraData={downloads}
        stickySectionHeadersEnabled={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: 12 }}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
              {section.title}
            </Text>
            {section.count > 0 && (
              <Text style={[styles.sectionCount, { color: colors.mutedText }]}>
                {section.count}
              </Text>
            )}
          </View>
        )}
        renderItem={({ item }) => {
          if (item.__placeholder) {
            return (
              <Text style={[styles.inlineNote, { color: colors.mutedText }]}>
                No sermons on {bookName} {chapterNumber}.
              </Text>
            );
          }
          return renderSermonRow(item);
        }}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.accent} />
          ) : null
        }
      />
    );
  };

  // The subtitle answers "what am I looking at" for whichever view is showing.
  const downloadedSize = formatDownloadSize(totalDownloadedBytes(downloads.entries));
  const headerSub =
    view === "downloads"
      ? downloads.entries.length
        ? [
            `${downloads.entries.length} ${
              downloads.entries.length === 1 ? "sermon" : "sermons"
            }`,
            downloadedSize,
          ]
            .filter(Boolean)
            .join(" · ")
        : "Available offline"
      : view === "sources"
        ? "Choose your sermon sources"
        : `${bookName} ${chapterNumber}`;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Tapping the dimmed area above the sheet dismisses it. */}
        <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Sermons</Text>
              <Text style={[styles.headerSub, { color: colors.mutedText }]}>
                {headerSub}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close sermons"
            >
              <MaterialCommunityIcons name="close" size={24} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            <SheetTab
              label="Browse"
              colors={colors}
              active={view === "browse"}
              onPress={() => setView("browse")}
            />
            {/* Hidden where downloading isn't possible (web build). */}
            {DOWNLOADS_SUPPORTED && (
              <SheetTab
                label="Downloaded"
                count={downloads.entries.length}
                colors={colors}
                active={view === "downloads"}
                onPress={() => setView("downloads")}
              />
            )}
            <SheetTab
              label="Sources"
              colors={colors}
              active={view === "sources"}
              onPress={() => setView("sources")}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.body}>{renderBody()}</View>

        </View>
      </View>
    </Modal>
  );
}

// ── Sources picker ────────────────────────────────────────────────────────────

function SourcesPicker({
  sources,
  colors,
  onToggleSource,
  onToggleCongregation,
}) {
  const csEnabled = sources.enabledSources.includes(CORNERSTONE_SOURCE_ID);
  const gilEnabled = sources.enabledSources.includes(GOSPEL_IN_LIFE_SOURCE_ID);
  const onlyOneLeft = sources.enabledSources.length === 1;

  return (
    <FlatList
      data={[{ key: "content" }]}
      keyExtractor={(item) => item.key}
      contentContainerStyle={{ paddingBottom: 24 }}
      renderItem={() => (
        <View>
          {/* Gospel in Life */}
          <View style={[styles.sourceSection, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={styles.sourceRow}
              onPress={() => onToggleSource(GOSPEL_IN_LIFE_SOURCE_ID)}
              activeOpacity={0.7}
              accessibilityRole="switch"
              accessibilityState={{ checked: gilEnabled }}
              accessibilityLabel="Gospel in Life sermons"
              disabled={gilEnabled && onlyOneLeft}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.sourceLabel, { color: colors.text }]}>
                  Gospel in Life
                </Text>
                <Text style={[styles.sourceDesc, { color: colors.mutedText }]}>
                  Expository sermon library by Tim Keller and others
                </Text>
              </View>
              <ToggleChip on={gilEnabled} colors={colors} />
            </TouchableOpacity>
          </View>

          {/* Cornerstone Church */}
          <View style={[styles.sourceSection, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={styles.sourceRow}
              onPress={() => onToggleSource(CORNERSTONE_SOURCE_ID)}
              activeOpacity={0.7}
              accessibilityRole="switch"
              accessibilityState={{ checked: csEnabled }}
              accessibilityLabel="Cornerstone Church sermons"
              disabled={csEnabled && onlyOneLeft}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.sourceLabel, { color: colors.text }]}>
                  Cornerstone Church
                </Text>
                <Text style={[styles.sourceDesc, { color: colors.mutedText }]}>
                  Sermons from Cornerstone Presbyterian churches in Sydney
                </Text>
              </View>
              <ToggleChip on={csEnabled} colors={colors} />
            </TouchableOpacity>

            {/* Congregation picker — only shown when Cornerstone is enabled */}
            {csEnabled && (
              <View style={[styles.congregationList, { borderTopColor: colors.border }]}>
                <Text style={[styles.congregationHeader, { color: colors.mutedText }]}>
                  CONGREGATIONS
                </Text>
                {CONGREGATIONS.map((cong) => {
                  const on = sources.cornerstoneCongregations.includes(cong.id);
                  const onlyOneCongLeft =
                    csEnabled && sources.cornerstoneCongregations.length === 1 && on;
                  return (
                    <TouchableOpacity
                      key={cong.id}
                      style={styles.congregationRow}
                      onPress={() => onToggleCongregation(cong.id)}
                      activeOpacity={0.7}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={cong.label}
                      disabled={onlyOneCongLeft}
                    >
                      <Text
                        style={[
                          styles.congregationLabel,
                          { color: on ? colors.text : colors.mutedText },
                        ]}
                      >
                        {cong.label}
                      </Text>
                      <MaterialCommunityIcons
                        name={on ? "check-circle" : "circle-outline"}
                        size={20}
                        color={on ? colors.accent : colors.border}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      )}
    />
  );
}

function ToggleChip({ on, colors }) {
  return (
    <View
      style={[
        styles.toggleChip,
        {
          backgroundColor: on ? colors.accent : colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.toggleThumb,
          {
            backgroundColor: colors.background,
            transform: [{ translateX: on ? 16 : 0 }],
          },
        ]}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SheetTab({ label, count, colors, active, onPress }) {
  return (
    <TouchableOpacity
      style={[
        styles.tab,
        active && { backgroundColor: colors.accent + "1F" },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityLabel={count > 0 ? `${label}, ${count}` : label}
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.tabText,
          { color: active ? colors.accent : colors.mutedText },
        ]}
      >
        {label}
      </Text>
      {count > 0 && (
        <View
          style={[
            styles.tabBadge,
            { backgroundColor: active ? colors.accent : colors.border },
          ]}
        >
          <Text
            style={[
              styles.tabBadgeText,
              { color: active ? colors.accentContrast : colors.mutedText },
            ]}
          >
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Copy and iconography for the trailing control, keyed by how far the sermon
// has got. Downloaded and failed are both tappable in place — one removes, the
// other retries — so the row never needs a second gesture to learn.
//
// `remove` is the Downloads tab's version of `downloaded`: everything in that
// list is downloaded, so a check against every row states the obvious. The slot
// is worth more as the action you actually came there for.
const DOWNLOAD_CONTROL = {
  idle: { icon: "tray-arrow-down", label: "Download for offline listening" },
  downloaded: { icon: "check-circle", label: "Downloaded. Tap to remove." },
  remove: { icon: "trash-can-outline", label: "Remove download" },
  failed: { icon: "alert-circle-outline", label: "Download failed. Tap to retry." },
};

function DownloadButton({ state, progress, colors, onPress }) {
  const isDownloading = state === "downloading";
  const control = DOWNLOAD_CONTROL[state] ?? DOWNLOAD_CONTROL.idle;

  // The trash stays muted rather than red: a list of twenty red icons reads as
  // alarm, and the destructive weight belongs on the confirmation instead.
  const tint =
    state === "downloaded"
      ? colors.accent
      : state === "failed"
        ? colors.danger
        : colors.mutedText;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.rowAction}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={
        isDownloading
          ? progress != null
            ? `Downloading, ${Math.round(progress * 100)} percent. Tap to cancel.`
            : "Downloading. Tap to cancel."
          : control.label
      }
    >
      {isDownloading ? (
        // A percentage where the server told us the size, a spinner where it
        // didn't. Either way the same tap cancels.
        progress != null ? (
          <Text style={[styles.rowProgress, { color: colors.accent }]}>
            {Math.round(progress * 100)}%
          </Text>
        ) : (
          <ActivityIndicator size="small" color={colors.accent} />
        )
      ) : (
        <MaterialCommunityIcons name={control.icon} size={21} color={tint} />
      )}
    </TouchableOpacity>
  );
}

function SermonRow({
  sermon,
  colors,
  isActive,
  onPress,
  downloadState,
  progress,
  onDownloadAction,
}) {
  const meta = [sermon.speaker, sermon.year].filter(Boolean).join(" · ");
  // The passage is the most useful thing to scan for, so it leads the subtitle
  // and is tinted to stand apart from the speaker and year.
  const spokenLabel = [sermon.title, sermon.passage, meta].filter(Boolean).join(", ");

  return (
    <TouchableOpacity
      style={[styles.row, isActive && { backgroundColor: colors.accent + "18" }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={spokenLabel}
      accessibilityState={{ selected: isActive }}
    >
      <MaterialCommunityIcons
        name={isActive ? "volume-high" : "play-circle-outline"}
        size={22}
        color={isActive ? colors.accent : colors.mutedText}
        style={styles.rowIcon}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.rowTitle, { color: isActive ? colors.accent : colors.text }]}
          numberOfLines={2}
        >
          {sermon.title}
        </Text>
        {(!!sermon.passage || !!meta) && (
          <Text style={[styles.rowMeta, { color: colors.mutedText }]} numberOfLines={1}>
            {!!sermon.passage && (
              <Text style={[styles.rowPassage, { color: colors.accent }]}>
                {sermon.passage}
              </Text>
            )}
            {!!sermon.passage && !!meta ? "  ·  " : ""}
            {meta}
          </Text>
        )}
      </View>

      {DOWNLOADS_SUPPORTED && (
        <DownloadButton
          state={downloadState}
          progress={progress}
          colors={colors}
          onPress={onDownloadAction}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  backdropTap: {
    flex: 1,
  },
  sheet: {
    height: "78%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  grabber: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 2,
  },
  grabberBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 19,
    fontFamily: uiFont(700),
  },
  headerSub: {
    fontSize: 13,
    fontFamily: uiFont(400),
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  body: {
    flex: 1,
  },

  // Browse / Downloaded switch
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  tabText: {
    fontSize: 13,
    fontFamily: uiFont(600),
  },
  tabBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    alignItems: "center",
  },
  tabBadgeText: {
    fontSize: 11,
    fontFamily: uiFont(600),
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 11,
    fontFamily: uiFont(600),
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionCount: {
    fontSize: 11,
    fontFamily: uiFont(500),
  },

  // Rows
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: uiFont(500),
    lineHeight: 20,
  },
  rowMeta: {
    fontSize: 12,
    fontFamily: uiFont(400),
    marginTop: 2,
  },
  rowPassage: {
    fontFamily: uiFont(600),
  },
  rowAction: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  rowProgress: {
    fontSize: 11,
    fontFamily: uiFont(600),
  },
  inlineNote: {
    fontSize: 13,
    fontFamily: uiFont(400),
    fontStyle: "italic",
    paddingHorizontal: 18,
    paddingVertical: 4,
  },

  // Loading / failure / empty
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  centredTitle: {
    fontSize: 16,
    fontFamily: uiFont(600),
    marginTop: 14,
    textAlign: "center",
  },
  centredBody: {
    fontSize: 13,
    fontFamily: uiFont(400),
    marginTop: 6,
    textAlign: "center",
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  retryText: {
    fontSize: 14,
    fontFamily: uiFont(600),
  },
  centredLink: {
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  centredLinkText: {
    fontSize: 13,
    fontFamily: uiFont(600),
  },

  // Sources picker
  sourceSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  sourceLabel: {
    fontSize: 15,
    fontFamily: uiFont(600),
    marginBottom: 2,
  },
  sourceDesc: {
    fontSize: 12,
    fontFamily: uiFont(400),
    lineHeight: 17,
  },
  congregationList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
  },
  congregationHeader: {
    fontSize: 10,
    fontFamily: uiFont(600),
    letterSpacing: 0.8,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 4,
  },
  congregationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  congregationLabel: {
    fontSize: 14,
    fontFamily: uiFont(400),
  },

  // Toggle switch
  toggleChip: {
    width: 40,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});
