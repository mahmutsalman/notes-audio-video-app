import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { useTabs } from './TabsContext';
import type { StudyTrackingContext, StudySource } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudyTrackerContextValue {
  isTracking: boolean;
  sessionId: number | null;
  elapsedSeconds: number;
  startSession: () => void;
  stopSession: () => void;
  /** Pages call this to report what they're showing. Pass null to clear. */
  reportTabContext: (tabId: string, ctx: StudyTrackingContext | null) => void;
  /** Set the source that the next navigation will use (e.g. 'search') */
  setNextSource: (src: StudySource) => void;
  /** Consume and return the pending source (resets to 'direct') */
  consumeNextSource: () => StudySource;
  /** Track an image open — returns cleanup fn to call on close */
  trackImageOpen: (
    imageId: number,
    resourceType: string,
    tabId: string,
  ) => () => void;
  /** Track audio/video play — returns cleanup fn to call on stop */
  trackMediaPlay: (
    resourceId: number,
    resourceType: string,
    eventType: 'play_audio' | 'play_video',
    tabId: string,
  ) => () => void;
}

// ─── Idle Dialog state (lifted to context so it's accessible anywhere) ───────
interface IdleState {
  show: boolean;
  idleSeconds: number;
}

interface FullContextValue extends StudyTrackerContextValue {
  idleState: IdleState;
  resolveIdle: (creditedSeconds: number) => void;
}

const StudyTrackerContext = createContext<FullContextValue | null>(null);

const IDLE_THRESHOLD_SECONDS = 120; // 2 minutes — below this no dialog shown

function nowISO(): string {
  return new Date().toISOString();
}

function secondsBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StudyTrackerProvider({ children }: { children: ReactNode }) {
  const { tabs, activeTabId } = useTabs();

  const [isTracking, setIsTracking] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [idleState, setIdleState] = useState<IdleState>({ show: false, idleSeconds: 0 });

  // Maps tabId → current context reported by that tab's pages
  const tabContextMap = useRef<Map<string, StudyTrackingContext | null>>(new Map());
  // The currently open DB event id (for view_recording / view_mark)
  const currentEventId = useRef<number | null>(null);
  const currentEventStart = useRef<string | null>(null);
  // Session wall-clock start for elapsed counter
  const sessionStart = useRef<Date | null>(null);
  // Idle tracking
  const blurTime = useRef<Date | null>(null);
  const pendingIdleSeconds = useRef<number>(0);
  // Source override for next reportTabContext call
  const nextSource = useRef<StudySource>('direct');
  // Ticker interval
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const closeCurrentEvent = useCallback(async () => {
    if (currentEventId.current === null || currentEventStart.current === null) return;
    const endedAt = nowISO();
    const secs = secondsBetween(currentEventStart.current, endedAt);
    if (secs > 0) {
      await window.electronAPI.studyTracker.updateEvent(
        currentEventId.current,
        endedAt,
        secs,
      );
    }
    currentEventId.current = null;
    currentEventStart.current = null;
  }, []);

  const openEventForContext = useCallback(async (ctx: StudyTrackingContext) => {
    if (sessionId === null) return;
    const startedAt = nowISO();
    currentEventStart.current = startedAt;
    const id = await window.electronAPI.studyTracker.createEvent({
      session_id: sessionId,
      event_type: ctx.durationId !== null ? 'view_mark' : 'view_recording',
      topic_id: ctx.topicId,
      topic_name: ctx.topicName,
      recording_id: ctx.recordingId,
      recording_name: ctx.recordingName,
      duration_id: ctx.durationId,
      duration_caption: ctx.durationCaption,
      started_at: startedAt,
      source: ctx.source,
    });
    currentEventId.current = id;
  }, [sessionId]);

  // Transition to a new context (close old event, open new one)
  const transitionContext = useCallback(async (newCtx: StudyTrackingContext | null) => {
    await closeCurrentEvent();
    if (newCtx && newCtx.recordingId !== null) {
      await openEventForContext(newCtx);
    }
  }, [closeCurrentEvent, openEventForContext]);

  // ── Active context derived from active tab ────────────────────────────────

  const getActiveContext = useCallback((): StudyTrackingContext | null => {
    return tabContextMap.current.get(activeTabId) ?? null;
  }, [activeTabId]);

  // When activeTabId changes: transition to the new tab's context
  const prevActiveTabId = useRef<string>(activeTabId);
  useEffect(() => {
    if (!isTracking) return;
    if (prevActiveTabId.current === activeTabId) return;
    prevActiveTabId.current = activeTabId;
    const newCtx = getActiveContext();
    transitionContext(newCtx);
  }, [activeTabId, isTracking, getActiveContext, transitionContext]);

  // When a tab is closed: clear its context
  useEffect(() => {
    const tabIds = new Set(tabs.map(t => t.id));
    for (const [tabId] of tabContextMap.current) {
      if (!tabIds.has(tabId)) {
        tabContextMap.current.delete(tabId);
      }
    }
  }, [tabs]);

  // ── Session control ───────────────────────────────────────────────────────

  const startSession = useCallback(async () => {
    if (isTracking) return;
    const startedAt = nowISO();
    const session = await window.electronAPI.studyTracker.createSession(startedAt);
    setSessionId(session.id);
    setIsTracking(true);
    setElapsedSeconds(0);
    sessionStart.current = new Date();

    // Start elapsed ticker
    tickerRef.current = setInterval(() => {
      if (sessionStart.current) {
        const secs = Math.floor((Date.now() - sessionStart.current.getTime()) / 1000);
        setElapsedSeconds(secs);
      }
    }, 1000);

    // Open event for the currently visible page
    const ctx = getActiveContext();
    if (ctx && ctx.recordingId !== null) {
      const evStart = nowISO();
      currentEventStart.current = evStart;
      const id = await window.electronAPI.studyTracker.createEvent({
        session_id: session.id,
        event_type: ctx.durationId !== null ? 'view_mark' : 'view_recording',
        topic_id: ctx.topicId,
        topic_name: ctx.topicName,
        recording_id: ctx.recordingId,
        recording_name: ctx.recordingName,
        duration_id: ctx.durationId,
        duration_caption: ctx.durationCaption,
        started_at: evStart,
        source: ctx.source,
      });
      currentEventId.current = id;
    }
  }, [isTracking, getActiveContext]);

  const stopSession = useCallback(async () => {
    if (!isTracking || sessionId === null) return;

    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }

    await closeCurrentEvent();

    const totalSeconds = sessionStart.current
      ? Math.floor((Date.now() - sessionStart.current.getTime()) / 1000)
      : elapsedSeconds;

    await window.electronAPI.studyTracker.endSession(
      sessionId,
      nowISO(),
      totalSeconds,
    );

    setIsTracking(false);
    setSessionId(null);
    setElapsedSeconds(0);
    sessionStart.current = null;
    prevActiveTabId.current = activeTabId;
  }, [isTracking, sessionId, elapsedSeconds, closeCurrentEvent, activeTabId]);

  // ── reportTabContext ──────────────────────────────────────────────────────

  const reportTabContext = useCallback((tabId: string, ctx: StudyTrackingContext | null) => {
    const prev = tabContextMap.current.get(tabId);
    tabContextMap.current.set(tabId, ctx);

    // Only act if this is the currently active tab and we're tracking
    if (!isTracking || tabId !== activeTabId) return;

    const prevRecId = prev?.recordingId ?? null;
    const prevDurId = prev?.durationId ?? null;
    const newRecId = ctx?.recordingId ?? null;
    const newDurId = ctx?.durationId ?? null;

    // Context changed → transition event
    if (prevRecId !== newRecId || prevDurId !== newDurId) {
      transitionContext(ctx);
    }
  }, [isTracking, activeTabId, transitionContext]);

  // ── source helpers ────────────────────────────────────────────────────────

  const setNextSource = useCallback((src: StudySource) => {
    nextSource.current = src;
  }, []);

  const consumeNextSource = useCallback((): StudySource => {
    const src = nextSource.current;
    nextSource.current = 'direct';
    return src;
  }, []);

  // ── Image open tracking ───────────────────────────────────────────────────

  const trackImageOpen = useCallback((
    imageId: number,
    resourceType: string,
    tabId: string,
  ): (() => void) => {
    if (!isTracking || sessionId === null) return () => {};
    const ctx = tabContextMap.current.get(tabId);
    const startedAt = nowISO();
    let eventId: number | null = null;

    window.electronAPI.studyTracker.createEvent({
      session_id: sessionId,
      event_type: 'view_image',
      topic_id: ctx?.topicId ?? null,
      topic_name: ctx?.topicName ?? null,
      recording_id: ctx?.recordingId ?? null,
      recording_name: ctx?.recordingName ?? null,
      duration_id: ctx?.durationId ?? null,
      duration_caption: ctx?.durationCaption ?? null,
      resource_id: imageId,
      resource_type: resourceType,
      started_at: startedAt,
      source: ctx?.source ?? 'direct',
    }).then(id => { eventId = id; });

    return () => {
      if (eventId === null) return;
      const endedAt = nowISO();
      const secs = secondsBetween(startedAt, endedAt);
      if (secs > 0) {
        window.electronAPI.studyTracker.updateEvent(eventId, endedAt, secs);
      }
    };
  }, [isTracking, sessionId]);

  // ── Media play tracking ───────────────────────────────────────────────────

  const trackMediaPlay = useCallback((
    resourceId: number,
    resourceType: string,
    eventType: 'play_audio' | 'play_video',
    tabId: string,
  ): (() => void) => {
    if (!isTracking || sessionId === null) return () => {};
    const ctx = tabContextMap.current.get(tabId);
    const startedAt = nowISO();
    let eventId: number | null = null;

    window.electronAPI.studyTracker.createEvent({
      session_id: sessionId,
      event_type: eventType,
      topic_id: ctx?.topicId ?? null,
      topic_name: ctx?.topicName ?? null,
      recording_id: ctx?.recordingId ?? null,
      recording_name: ctx?.recordingName ?? null,
      duration_id: ctx?.durationId ?? null,
      duration_caption: ctx?.durationCaption ?? null,
      resource_id: resourceId,
      resource_type: resourceType,
      started_at: startedAt,
      source: ctx?.source ?? 'direct',
    }).then(id => { eventId = id; });

    return () => {
      if (eventId === null) return;
      const endedAt = nowISO();
      const secs = secondsBetween(startedAt, endedAt);
      if (secs > 0) {
        window.electronAPI.studyTracker.updateEvent(eventId, endedAt, secs);
      }
    };
  }, [isTracking, sessionId]);

  // ── App focus / blur (idle detection) ────────────────────────────────────

  useEffect(() => {
    const unsubBlur = window.electronAPI.studyTracker.onAppBlur(() => {
      if (!isTracking) return;
      blurTime.current = new Date();
    });

    const unsubFocus = window.electronAPI.studyTracker.onAppFocus(() => {
      if (!isTracking || blurTime.current === null) return;
      const idleSecs = Math.floor((Date.now() - blurTime.current.getTime()) / 1000);
      blurTime.current = null;

      if (idleSecs < IDLE_THRESHOLD_SECONDS) return;

      // Pause the session ticker while dialog is open
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }

      pendingIdleSeconds.current = idleSecs;
      setIdleState({ show: true, idleSeconds: idleSecs });
    });

    return () => {
      unsubBlur();
      unsubFocus();
    };
  }, [isTracking]);

  const resolveIdle = useCallback(async (creditedSeconds: number) => {
    setIdleState({ show: false, idleSeconds: 0 });

    if (sessionId === null) return;

    const idleSecs = pendingIdleSeconds.current;
    pendingIdleSeconds.current = 0;

    // Log the idle decision
    await window.electronAPI.studyTracker.logIdle({
      session_id: sessionId,
      detected_at: nowISO(),
      idle_seconds: idleSecs,
      credited_seconds: creditedSeconds,
    });

    // Adjust sessionStart so elapsed time reflects the credit
    if (sessionStart.current) {
      const discardedSecs = idleSecs - creditedSeconds;
      sessionStart.current = new Date(sessionStart.current.getTime() + discardedSecs * 1000);
    }

    // Restart ticker
    tickerRef.current = setInterval(() => {
      if (sessionStart.current) {
        const secs = Math.floor((Date.now() - sessionStart.current.getTime()) / 1000);
        setElapsedSeconds(secs);
      }
    }, 1000);

    // Re-open current event with adjusted start (close old incomplete one first)
    if (creditedSeconds > 0 && currentEventId.current !== null && currentEventStart.current !== null) {
      // Adjust current event start to account for discarded idle
      const discardedSecs = idleSecs - creditedSeconds;
      const originalStart = new Date(currentEventStart.current);
      currentEventStart.current = new Date(
        originalStart.getTime() + discardedSecs * 1000
      ).toISOString();
    } else if (creditedSeconds === 0) {
      // Discard current event
      await closeCurrentEvent();
      const ctx = getActiveContext();
      if (ctx && ctx.recordingId !== null) {
        await openEventForContext(ctx);
      }
    }
  }, [sessionId, closeCurrentEvent, getActiveContext, openEventForContext]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, []);

  return (
    <StudyTrackerContext.Provider value={{
      isTracking,
      sessionId,
      elapsedSeconds,
      startSession,
      stopSession,
      reportTabContext,
      setNextSource,
      consumeNextSource,
      trackImageOpen,
      trackMediaPlay,
      idleState,
      resolveIdle,
    }}>
      {children}
    </StudyTrackerContext.Provider>
  );
}

export function useStudyTracker(): StudyTrackerContextValue {
  const ctx = useContext(StudyTrackerContext);
  if (!ctx) throw new Error('useStudyTracker must be used within StudyTrackerProvider');
  return ctx;
}

export function useStudyTrackerFull(): FullContextValue {
  const ctx = useContext(StudyTrackerContext);
  if (!ctx) throw new Error('useStudyTrackerFull must be used within StudyTrackerProvider');
  return ctx;
}
