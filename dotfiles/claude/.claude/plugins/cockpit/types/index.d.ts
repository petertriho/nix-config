export type CockpitView = 'agents' | 'tools' | 'changes' | 'context' | 'activity'

/** How much time the activity timeline spans: from the first event, or a fixed window. */
export type CockpitSpan = 'fit' | '5m' | '15m' | '60m'

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
  /** The permission check put the call to the mode's decider (a dialog, a classifier). */
  approval?: 'asked'
  /** Execution time from PostToolUse, without permission-prompt and hook time. */
  runMs?: number
}

export type CockpitAgentTotals = {
  tokens: number
  toolUses: number
  durationMs: number
  linesAdded?: number
  linesRemoved?: number
  models: string[]
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
  /** When the roster or a tool result first reported the agent. */
  startedAt?: number
  lastSeenAt: number
  completedAt?: number
  durationMs?: number
  usage?: CockpitTurnUsage
  totals?: CockpitAgentTotals
  answer?: string
}

export type CockpitTodo = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}

/** One loop's TodoWrite list; `agentId` is absent for the main session. */
export type CockpitTodoList = {
  agentId?: string
  items: CockpitTodo[]
  updatedAt: number
}

export type CockpitTask = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  owner?: string
}

export type CockpitBackgroundTask = {
  id: string
  type: string
  status: string
  description: string
  agentType?: string
  startedAt?: number
  endedAt?: number
  updatedAt: number
}

export type CockpitCron = {
  id: string
  schedule: string
  recurring: boolean
}

/** A change in the activity level: running tools + running agents + main turn. */
export type CockpitSample = {
  at: number
  level: number
}

export type CockpitStopFailure = {
  error: string
  details?: string
  at: number
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
  /** When the main turn in progress started; null between turns. */
  turnStartedAt: number | null
  phase: 'idle' | 'thinking' | 'tools' | 'error'
  tools: CockpitTool[]
  agents: CockpitAgent[]
  turns: CockpitTurn[]
  samples: CockpitSample[]
  todos: CockpitTodoList[]
  tasks: CockpitTask[]
  background: CockpitBackgroundTask[]
  crons: CockpitCron[]
  backgroundAt: number | null
  stopFailure: CockpitStopFailure | null
  selectedAgent: string | null
  /** The agent in view when the person last chose; a later view change is followed. */
  selectedFor: string | null
  selectedTool: string | null
  updatedAt: number
  error: string | null
}

export type CockpitChangeState = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict'

export type CockpitChange = {
  path: string
  patch: string
  additions: number
  deletions: number
  source: 'observed' | 'git'
  /** The Git status of the file; absent for an edit before the next Git read. */
  state?: CockpitChangeState
  staged?: boolean
  untracked?: boolean
  /** How many observed edits changed the file, and which agent made the last one. */
  edits?: number
  agentId?: string
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

/** A Bash call's `gitOperation`: what the engine detected the command did. */
export type CockpitGitOperation = {
  id: string
  at: number
  commit?: { sha: string; kind: string; branch?: string }
  push?: { branch: string }
  branch?: { ref: string; action: string }
  pr?: { number: number; url?: string; action: string }
}

export type CockpitReview = {
  sessionId: string | null
  changes: CockpitChange[]
  findings: CockpitFinding[]
  checks: CockpitCheck[]
  gitOps: CockpitGitOperation[]
  selectedPath: string | null
  branch: string | null
  root: string | null
  refreshedAt: number | null
  loading: boolean
  error: string | null
}

export type CockpitCompaction = {
  at: number
  trigger: string
  agentId?: string
  tokensBefore?: number
  tokensAfter?: number
  skipped?: string
}

/** The session cost total each time it grew, about once per main turn. */
export type CockpitCostSample = {
  at: number
  usd: number
}

/** The live context fill each time a measurement moved it. */
export type CockpitFillSample = {
  at: number
  tokens: number
}

export type CockpitContext = {
  sessionId: string | null
  usage: CockpitUsage | null
  compactions: CockpitCompaction[]
  costs: CockpitCostSample[]
  fills: CockpitFillSample[]
  refreshedAt: number | null
  loading: boolean
  error: string | null
}

export type CockpitPreferences = {
  view: CockpitView
  band: boolean
  animation: boolean
  span: CockpitSpan
  paneOpen: boolean
}

/** The Bongo Cat's animation frame and the phase it acts out. */
export type CockpitMascot = {
  frame: number
  phase: CockpitActivity['phase']
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
  cycleSpan: () => Promise<void>
}

export type CockpitViewProps = {
  activity: CockpitActivity
  review: CockpitReview
  context: CockpitContext
  preferences: CockpitPreferences
  mascot: CockpitMascot
  actions: CockpitActions
  /** The agent whose transcript is beside the pane; null for the main session. */
  viewedAgent: string | null
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
      mascot: CockpitMascot
    }
  }
}
