import type {
  CockpitActivity,
  CockpitContext,
  CockpitReview,
} from '../types'

export const initialActivity = (): CockpitActivity => ({
  sessionId: null,
  model: '',
  working: false,
  phase: 'idle',
  tools: [],
  agents: [],
  turns: [],
  samples: [],
  todos: [],
  tasks: [],
  background: [],
  crons: [],
  backgroundAt: null,
  stopFailure: null,
  selectedAgent: null,
  selectedFor: null,
  selectedTool: null,
  updatedAt: 0,
  error: null,
})

export const initialReview = (): CockpitReview => ({
  sessionId: null,
  changes: [],
  findings: [],
  checks: [],
  gitOps: [],
  selectedPath: null,
  branch: null,
  root: null,
  refreshedAt: null,
  loading: false,
  error: null,
})

export const initialContext = (): CockpitContext => ({
  sessionId: null,
  usage: null,
  compactions: [],
  costs: [],
  refreshedAt: null,
  loading: false,
  error: null,
})

// Hot reload keeps session memory in the shape an earlier version wrote. Fill
// the fields it lacks, and drop activity samples from before they were records.
// A complete value comes back as the same object, so an unchanged update stays one.
const complete = <T extends object>(value: T, initial: T): boolean =>
  Object.keys(initial).every(key => (value as Record<string, unknown>)[key] !== undefined)

const filled = <T extends object>(value: T, initial: T): T =>
  ({ ...initial, ...Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) })

export const activityOf = (value: CockpitActivity): CockpitActivity => {
  const samples = Array.isArray(value.samples) ? value.samples : []
  const records = samples.every(sample => typeof sample === 'object' && sample !== null)
  if (complete(value, initialActivity()) && records && samples === value.samples) return value
  return { ...filled(value, initialActivity()), samples: samples.filter(sample => typeof sample === 'object' && sample !== null) }
}

export const reviewOf = (value: CockpitReview): CockpitReview =>
  complete(value, initialReview()) ? value : filled(value, initialReview())

export const contextOf = (value: CockpitContext): CockpitContext =>
  complete(value, initialContext()) ? value : filled(value, initialContext())
