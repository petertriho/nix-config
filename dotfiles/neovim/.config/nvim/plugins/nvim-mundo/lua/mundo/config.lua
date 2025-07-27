-- Configuration module for nvim-mundo
local M = {}

---@class MundoConfig
---@field auto_preview boolean Auto-update preview when moving
---@field auto_preview_delay number Delay for auto-preview in milliseconds
---@field close_on_revert boolean Close Mundo after reverting to a state
---@field help boolean Show help by default
---@field inline_undo boolean Show inline diffs in the graph
---@field map_move_newer string Key to move to newer undo state
---@field map_move_older string Key to move to older undo state
---@field map_up_down boolean Use arrow keys for navigation
---@field mirror_graph boolean Mirror the graph horizontally
---@field playback_delay number Delay between playback steps in milliseconds
---@field preview_bottom boolean Show preview window at bottom
---@field preview_height number Height of preview window
---@field return_on_revert boolean Return to original buffer after revert
---@field right boolean Open Mundo on right side
---@field verbose_graph boolean Show detailed graph
---@field width number Width of graph window
---@field header boolean Show header in graph window
---@field mappings table<string, string> Key mappings for Mundo window

-- Default configuration
---@type MundoConfig
M.defaults = {
  auto_preview = true,
  auto_preview_delay = 250,
  close_on_revert = false,
  help = false,
  inline_undo = false,
  map_move_newer = 'k',
  map_move_older = 'j',
  map_up_down = true,
  mirror_graph = false,
  playback_delay = 60,
  preview_bottom = false,
  preview_height = 15,
  return_on_revert = true,
  right = false,
  verbose_graph = true,
  width = 45,
  header = true,
  mappings = {
    ['<CR>'] = 'preview',
    ['o'] = 'preview',
    ['J'] = 'move_older_write',
    ['K'] = 'move_newer_write',
    ['gg'] = 'move_top',
    ['G'] = 'move_bottom',
    ['P'] = 'play_to',
    ['d'] = 'diff',
    ['i'] = 'toggle_inline',
    ['/'] = 'search',
    ['n'] = 'next_match',
    ['N'] = 'previous_match',
    ['p'] = 'diff_current_buffer',
    ['r'] = 'rdiff',
    ['?'] = 'toggle_help',
    ['q'] = 'quit',
    ['<2-LeftMouse>'] = 'mouse_click'
  }
}

-- Current configuration (will be merged with user options)
---@type MundoConfig
M.current = {}

-- Setup configuration with user options
---@param opts? MundoConfig User configuration options
---@return MundoConfig config The merged configuration
function M.setup(opts)
  M.current = vim.tbl_deep_extend('force', M.defaults, opts or {})
  
  -- Add default move mappings to config.mappings
  M.current.mappings[M.current.map_move_older] = 'move_older'
  M.current.mappings[M.current.map_move_newer] = 'move_newer'
  
  return M.current
end

-- Get current configuration
---@return MundoConfig config The current configuration
function M.get()
  return M.current
end

-- Get specific config value
---@param key string The configuration key
---@return any value The configuration value
function M.get_value(key)
  return M.current[key]
end

return M