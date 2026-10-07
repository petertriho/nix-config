export type CockpitView = 'agents' | 'tools' | 'changes' | 'context' | 'reactor' | 'images'

export type CockpitTokenUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type CockpitTurnUsage = CockpitTokenUsage & { model: string }

export type CockpitBreakdown = {
  categories: {
    name: string
    tokens: number
    color: string
    isDeferred: boolean
    kind: 'used' | 'free' | 'buffer' | 'deferred'
  }[]
  totalTokens: number
  maxTokens: number
  rawMaxTokens: number
  autocompactSource: 'env' | 'settings' | 'clientdata' | 'experiment' | 'model-default' | 'unknown-model' | 'auto'
  percentage: number
  gridRows: {
    color: string
    isFilled: boolean
    categoryName: string
    tokens: number
    percentage: number
    squareFullness: number
  }[][]
  model: string
  memoryFiles: { path: string; type: string; tokens: number }[]
  mcpTools: { name: string; serverName: string; tokens: number; isLoaded: boolean }[]
  agents: { agentType: string; source: string; tokens: number }[]
  slashCommands?: { totalCommands: number; includedCommands: number; tokens: number }
  skills?: {
    totalSkills: number
    includedSkills: number
    tokens: number
    skillFrontmatter: { name: string; source: string; pluginName?: string; tokens: number }[]
  }
  autoCompactThreshold?: number
  isAutoCompactEnabled: boolean
  apiUsage: CockpitTokenUsage | null
}

export type CockpitUsage = {
  startedAt: number
  context: { window: number; tokens?: number; percent?: number; breakdown?: CockpitBreakdown }
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  cost?: { usd: number }
}

export type CockpitTool = {
  id: string
  tool: string
  agentId?: string
  target?: string
  startedAt: number
  finishedAt?: number
  outcome: 'running' | 'success' | 'error' | 'denied' | 'interrupted'
  retrospective?: boolean
}

export type CockpitAgent = {
  id: string
  name?: string
  description: string
  type: string
  status: 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed' | 'missing'
  parentId?: string
  teammateId?: string
  spawnedBy?: string
  lastSeenAt: number
  completedAt?: number
  durationMs?: number
  usage?: CockpitTurnUsage
}

export type CockpitTurn = {
  id: string
  agentId?: string
  durationMs: number
  reason: string
  finishedAt: number
  usage?: CockpitTurnUsage
}

export type CockpitActivity = {
  sessionId: string | null
  model: string
  working: boolean
  phase: 'idle' | 'thinking' | 'tools' | 'error'
  tools: CockpitTool[]
  agents: CockpitAgent[]
  turns: CockpitTurn[]
  samples: number[]
  selectedAgent: string | null
  selectedTool: string | null
  updatedAt: number
  error: string | null
}

export type CockpitChange = {
  path: string
  patch: string
  additions: number
  deletions: number
  source: 'observed' | 'git'
  staged?: boolean
  untracked?: boolean
  updatedAt: number
  truncated?: boolean
}

export type CockpitFinding = {
  id: string
  path: string
  line?: number
  summary: string
  category?: string
  verdict?: string
  outcome?: string
}

export type CockpitCheck = {
  id: string
  label: string
  status: 'running' | 'completed' | 'passed' | 'failed' | 'interrupted' | 'denied'
  passed?: number
  failed?: number
  durationMs?: number
  finishedAt?: number
}

export type CockpitReview = {
  sessionId: string | null
  changes: CockpitChange[]
  findings: CockpitFinding[]
  checks: CockpitCheck[]
  selectedPath: string | null
  branch: string | null
  root: string | null
  refreshedAt: number | null
  loading: boolean
  error: string | null
}

export type CockpitContext = {
  sessionId: string | null
  usage: CockpitUsage | null
  refreshedAt: number | null
  loading: boolean
  error: string | null
}

export type CockpitPreferences = {
  view: CockpitView
  band: boolean
  animation: boolean
  paneOpen: boolean
}

export type CockpitReactor = {
  frame: number
  phase: CockpitActivity['phase']
  samples: number[]
}

export type CockpitImage = {
  path: string
  label: string
  width: number
  height: number
  bytes: number
  generation?: number
}

export type CockpitImages = {
  sessionId: string | null
  generation?: number
  images: CockpitImage[]
  selected: number
  draft: string
  loading: boolean
  error: string | null
}

export type CockpitActions = {
  selectView: (view: CockpitView) => Promise<void>
  refreshAgents: () => Promise<void>
  selectAgent: (id: string | null) => Promise<void>
  selectTool: (id: string | null) => Promise<void>
  refreshChanges: () => Promise<void>
  selectChange: (path: string) => Promise<void>
  copyPatch: (path: string) => Promise<void>
  quotePatch: (path: string) => Promise<void>
  refreshContext: () => Promise<void>
  toggleAnimation: () => Promise<void>
  loadImage: (path: string) => Promise<void>
  selectImage: (index: number) => Promise<void>
  clearImages: () => Promise<void>
  setImageDraft: (text: string) => Promise<void>
}

export type CockpitViewProps = {
  activity: CockpitActivity
  review: CockpitReview
  context: CockpitContext
  preferences: CockpitPreferences
  reactor: CockpitReactor
  images: CockpitImages
  actions: CockpitActions
  columns: number
  rows: number
  now: number
}

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      activity: CockpitActivity
      review: CockpitReview
      context: CockpitContext
      preferences: CockpitPreferences
      reactor: CockpitReactor
      images: CockpitImages
    }
  }
}
