import type {
  CockpitActivity,
  CockpitContext,
  CockpitImages,
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
  selectedAgent: null,
  selectedTool: null,
  updatedAt: 0,
  error: null,
})

export const initialReview = (): CockpitReview => ({
  sessionId: null,
  changes: [],
  findings: [],
  checks: [],
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
  refreshedAt: null,
  loading: false,
  error: null,
})

export const initialImages = (): CockpitImages => ({
  sessionId: null,
  generation: 0,
  images: [],
  selected: 0,
  draft: '',
  loading: false,
  error: null,
})
