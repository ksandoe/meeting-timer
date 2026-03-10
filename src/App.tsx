import { useEffect, useMemo, useRef, useState } from 'react'

type AgendaItem = {
  id: string
  title: string
  plannedSeconds: number
}

type MeetingState = {
  items: AgendaItem[]
  activeIndex: number
  running: boolean
  startedAtMs: number | null
  accumulatedElapsedMs: number
  activeItemRemainingMs: number
}

const STORAGE_KEY = 'meeting-timer:v1'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function formatSeconds(totalSeconds: number) {
  const sign = totalSeconds < 0 ? '-' : ''
  const abs = Math.abs(totalSeconds)
  const m = Math.floor(abs / 60)
  const s = abs % 60
  return `${sign}${m}:${String(s).padStart(2, '0')}`
}

function nowMs() {
  return Date.now()
}

function createDefaultState(): MeetingState {
  const items: AgendaItem[] = [
    { id: crypto.randomUUID(), title: 'Intro', plannedSeconds: 5 * 60 },
    { id: crypto.randomUUID(), title: 'Discussion', plannedSeconds: 15 * 60 },
    { id: crypto.randomUUID(), title: 'Decisions / Next steps', plannedSeconds: 10 * 60 },
  ]

  return {
    items,
    activeIndex: 0,
    running: false,
    startedAtMs: null,
    accumulatedElapsedMs: 0,
    activeItemRemainingMs: items[0]?.plannedSeconds ? items[0].plannedSeconds * 1000 : 0,
  }
}

function loadState(): MeetingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultState()
    const parsed = JSON.parse(raw) as MeetingState

    if (!Array.isArray(parsed.items)) return createDefaultState()
    const safeActiveIndex = clamp(parsed.activeIndex ?? 0, 0, Math.max(0, parsed.items.length - 1))
    const active = parsed.items[safeActiveIndex]

    return {
      items: parsed.items.map((it) => ({
        id: String(it.id),
        title: String(it.title ?? ''),
        plannedSeconds: clamp(Number(it.plannedSeconds ?? 0), 0, 24 * 60 * 60),
      })),
      activeIndex: safeActiveIndex,
      running: Boolean(parsed.running ?? false),
      startedAtMs: parsed.startedAtMs ?? null,
      accumulatedElapsedMs: clamp(Number(parsed.accumulatedElapsedMs ?? 0), 0, 7 * 24 * 60 * 60 * 1000),
      activeItemRemainingMs:
        parsed.activeItemRemainingMs != null
          ? clamp(Number(parsed.activeItemRemainingMs), -7 * 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000)
          : (active?.plannedSeconds ?? 0) * 1000,
    }
  } catch {
    return createDefaultState()
  }
}

function saveState(state: MeetingState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function getTotalPlannedSeconds(items: AgendaItem[]) {
  return items.reduce((sum, it) => sum + it.plannedSeconds, 0)
}

function getElapsedMs(state: MeetingState, currentNowMs: number) {
  if (!state.running || state.startedAtMs == null) return state.accumulatedElapsedMs
  return state.accumulatedElapsedMs + (currentNowMs - state.startedAtMs)
}

export default function App() {
  const [state, setState] = useState<MeetingState>(() => loadState())
  const [now, setNow] = useState(() => nowMs())
  const [mode, setMode] = useState<'build' | 'run'>(() => 'build')

  const tickRef = useRef<number | null>(null)

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    if (tickRef.current != null) window.clearInterval(tickRef.current)
    tickRef.current = window.setInterval(() => setNow(nowMs()), 250)
    return () => {
      if (tickRef.current != null) window.clearInterval(tickRef.current)
    }
  }, [])

  const activeItem = state.items[state.activeIndex] ?? null
  const isFinalItem = state.items.length > 0 && state.activeIndex === state.items.length - 1

  const totalPlannedSeconds = useMemo(() => getTotalPlannedSeconds(state.items), [state.items])
  const elapsedMs = useMemo(() => getElapsedMs(state, now), [state, now])
  const elapsedSeconds = Math.floor(elapsedMs / 1000)

  const overallDeltaSeconds = elapsedSeconds - totalPlannedSeconds

  const activeRemainingSeconds = Math.ceil(state.activeItemRemainingMs / 1000)

  const header = (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-indigo-600" />
            <div className="text-sm font-semibold text-slate-900">Meeting Timer</div>
            {state.running ? (
              <div className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                Running
              </div>
            ) : (
              <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Paused</div>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <div className="rounded-md bg-slate-50 px-2 py-1">Planned: <span className="font-mono text-slate-900">{formatSeconds(totalPlannedSeconds)}</span></div>
            <div className="rounded-md bg-slate-50 px-2 py-1">Elapsed: <span className="font-mono text-slate-900">{formatSeconds(elapsedSeconds)}</span></div>
            <div
              className={
                'rounded-md px-2 py-1 ' +
                (overallDeltaSeconds <= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')
              }
            >
              Overall:{' '}
              <span className="font-semibold">
                {overallDeltaSeconds <= 0
                  ? `${formatSeconds(Math.abs(overallDeltaSeconds))} under`
                  : `${formatSeconds(overallDeltaSeconds)} over`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={
              'rounded-md px-3 py-1.5 text-sm font-semibold ' +
              (mode === 'build'
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-slate-100 text-slate-900 hover:bg-slate-200')
            }
            onClick={() => setMode('build')}
            type="button"
          >
            Build
          </button>
          <button
            className={
              'rounded-md px-3 py-1.5 text-sm font-semibold ' +
              (mode === 'run'
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-slate-100 text-slate-900 hover:bg-slate-200')
            }
            onClick={() => setMode('run')}
            type="button"
          >
            Run
          </button>
        </div>
      </div>
    </div>
  )

  function resetMeeting() {
    setState((prev) => {
      const active = prev.items[0]
      return {
        ...prev,
        activeIndex: 0,
        running: false,
        startedAtMs: null,
        accumulatedElapsedMs: 0,
        activeItemRemainingMs: (active?.plannedSeconds ?? 0) * 1000,
      }
    })
  }

  function start() {
    setState((prev) => {
      if (prev.running) return prev
      return { ...prev, running: true, startedAtMs: nowMs() }
    })
  }

  function pause() {
    setState((prev) => {
      if (!prev.running) return prev
      const n = nowMs()
      const elapsedSinceStart = prev.startedAtMs == null ? 0 : n - prev.startedAtMs
      return {
        ...prev,
        running: false,
        startedAtMs: null,
        accumulatedElapsedMs: prev.accumulatedElapsedMs + elapsedSinceStart,
      }
    })
  }

  function done() {
    setState((prev) => {
      const n = nowMs()
      const elapsedSinceStart = prev.running && prev.startedAtMs != null ? n - prev.startedAtMs : 0
      return {
        ...prev,
        running: false,
        startedAtMs: null,
        accumulatedElapsedMs: prev.accumulatedElapsedMs + elapsedSinceStart,
      }
    })
  }

  function goToIndex(nextIndex: number) {
    setState((prev) => {
      const clamped = clamp(nextIndex, 0, Math.max(0, prev.items.length - 1))
      const nextItem = prev.items[clamped]
      return {
        ...prev,
        activeIndex: clamped,
        activeItemRemainingMs: (nextItem?.plannedSeconds ?? 0) * 1000,
      }
    })
  }

  useEffect(() => {
    if (!state.running) return

    const interval = window.setInterval(() => {
      setState((prev) => {
        if (!prev.running) return prev
        const next = prev.activeItemRemainingMs - 250
        return { ...prev, activeItemRemainingMs: next }
      })
    }, 250)

    return () => window.clearInterval(interval)
  }, [state.running])

  const buildView = (
    <div className="mx-auto w-full max-w-5xl p-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900">Agenda</div>
            <div className="mt-0.5 text-sm text-slate-600">Add items with time allocations and reorder to match the flow.</div>
          </div>
          <button
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
            type="button"
            onClick={() => {
              setState((prev) => {
                const newItem: AgendaItem = { id: crypto.randomUUID(), title: 'New item', plannedSeconds: 5 * 60 }
                const nextItems = [...prev.items, newItem]
                return {
                  ...prev,
                  items: nextItems,
                  activeIndex: clamp(prev.activeIndex, 0, Math.max(0, nextItems.length - 1)),
                }
              })
            }}
          >
            Add item
          </button>
        </div>

        <div className="mt-5 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {state.items.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">No items yet. Add one to get started.</div>
          ) : (
            state.items.map((it, idx) => (
              <div key={it.id} className="grid grid-cols-12 items-center gap-2 p-3">
                <div className="col-span-12 sm:col-span-6">
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    value={it.title}
                    onChange={(e) => {
                      const v = e.target.value
                      setState((prev) => ({
                        ...prev,
                        items: prev.items.map((x) => (x.id === it.id ? { ...x, title: v } : x)),
                      }))
                    }}
                  />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <div className="flex items-center gap-2">
                    <input
                      className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      type="number"
                      min={0}
                      value={Math.floor(it.plannedSeconds / 60)}
                      onChange={(e) => {
                        const minutes = clamp(Number(e.target.value), 0, 24 * 60)
                        setState((prev) => {
                          const nextItems = prev.items.map((x) =>
                            x.id === it.id ? { ...x, plannedSeconds: minutes * 60 } : x,
                          )
                          const active = nextItems[prev.activeIndex]
                          const activeRemainingMs =
                            prev.activeIndex === idx ? minutes * 60 * 1000 : prev.activeItemRemainingMs

                          return {
                            ...prev,
                            items: nextItems,
                            activeItemRemainingMs:
                              prev.activeIndex === idx ? (active?.plannedSeconds ?? minutes * 60) * 1000 : activeRemainingMs,
                          }
                        })
                      }}
                    />
                    <div className="text-xs text-slate-600">min</div>
                  </div>
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <div className="flex justify-end gap-2">
                    <button
                      className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-200 disabled:opacity-50"
                      type="button"
                      disabled={idx === 0}
                      onClick={() => {
                        setState((prev) => {
                          const items = [...prev.items]
                          ;[items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]
                          const activeId = prev.items[prev.activeIndex]?.id
                          const nextActiveIndex = Math.max(0, items.findIndex((x) => x.id === activeId))
                          return { ...prev, items, activeIndex: nextActiveIndex }
                        })
                      }}
                    >
                      Up
                    </button>
                    <button
                      className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-200 disabled:opacity-50"
                      type="button"
                      disabled={idx === state.items.length - 1}
                      onClick={() => {
                        setState((prev) => {
                          const items = [...prev.items]
                          ;[items[idx + 1], items[idx]] = [items[idx], items[idx + 1]]
                          const activeId = prev.items[prev.activeIndex]?.id
                          const nextActiveIndex = Math.max(0, items.findIndex((x) => x.id === activeId))
                          return { ...prev, items, activeIndex: nextActiveIndex }
                        })
                      }}
                    >
                      Down
                    </button>
                    <button
                      className="rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                      type="button"
                      onClick={() => {
                        setState((prev) => {
                          const items = prev.items.filter((x) => x.id !== it.id)
                          const nextActiveIndex = clamp(prev.activeIndex, 0, Math.max(0, items.length - 1))
                          const nextActive = items[nextActiveIndex]
                          return {
                            ...prev,
                            items,
                            activeIndex: nextActiveIndex,
                            activeItemRemainingMs: (nextActive?.plannedSeconds ?? 0) * 1000,
                          }
                        })
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button
            className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-200"
            type="button"
            onClick={resetMeeting}
          >
            Reset meeting progress
          </button>
          <button
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            type="button"
            onClick={() => setMode('run')}
            disabled={state.items.length === 0}
          >
            Start meeting
          </button>
        </div>
      </div>
    </div>
  )

  const runView = (
    <div className="mx-auto w-full max-w-5xl p-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-12">
          <div className="md:col-span-7">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current item</div>
            <div className="mt-1 truncate text-2xl font-semibold text-slate-900">{activeItem?.title ?? 'No item'}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <div className="rounded-md bg-slate-50 px-2 py-1">
                Planned: <span className="font-mono text-slate-900">{formatSeconds(activeItem?.plannedSeconds ?? 0)}</span>
              </div>
              <div className={
                'rounded-md px-2 py-1 ' +
                (activeRemainingSeconds >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')
              }>
                {activeRemainingSeconds >= 0
                  ? `${formatSeconds(activeRemainingSeconds)} remaining`
                  : `${formatSeconds(Math.abs(activeRemainingSeconds))} over`}
              </div>
            </div>
          </div>

          <div className="md:col-span-5 md:text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Countdown</div>
            <div
              className={
                'mt-1 font-mono text-5xl font-semibold tracking-tight ' +
                (activeRemainingSeconds >= 0 ? 'text-slate-900' : 'text-rose-700')
              }
            >
              {formatSeconds(activeRemainingSeconds)}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Item {state.items.length === 0 ? 0 : state.activeIndex + 1} of {state.items.length}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!state.running ? (
            <button
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              type="button"
              onClick={start}
              disabled={state.items.length === 0}
            >
              Start
            </button>
          ) : (
            <button
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
              type="button"
              onClick={pause}
            >
              Pause
            </button>
          )}

          <button
            className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:opacity-50"
            type="button"
            onClick={() => goToIndex(state.activeIndex - 1)}
            disabled={state.activeIndex <= 0}
          >
            Prev
          </button>
          <button
            className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:opacity-50"
            type="button"
            onClick={() => goToIndex(state.activeIndex + 1)}
            disabled={state.activeIndex >= state.items.length - 1}
          >
            Next
          </button>

          {isFinalItem ? (
            <button
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
              type="button"
              onClick={() => {
                done()
              }}
              disabled={state.items.length === 0}
            >
              Done
            </button>
          ) : null}

          <button
            className="rounded-md bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 hover:bg-rose-100"
            type="button"
            onClick={resetMeeting}
          >
            Reset
          </button>
        </div>

        <div className="mt-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Queue</div>
          <div className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
            {state.items.map((it, idx) => {
              const isActive = idx === state.activeIndex
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => goToIndex(idx)}
                  className={
                    'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm ' +
                    (isActive ? 'bg-indigo-600 text-white' : 'bg-white text-slate-900 hover:bg-slate-50')
                  }
                >
                  <div className="min-w-0 truncate">{it.title}</div>
                  <div className={'shrink-0 font-mono ' + (isActive ? 'text-white' : 'text-slate-600')}>
                    {formatSeconds(it.plannedSeconds)}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {header}
      {mode === 'build' ? buildView : runView}
    </div>
  )
}
