-- Core functionality for nvim-mundo
local M = {}

local api = vim.api
local fn = vim.fn
local config = require('mundo.config')
local utils = require('mundo.utils')
local graph = require('mundo.graph')
local window = require('mundo.window')
local tree = require('mundo.tree')

---@class MundoState
---@field target_buffer number? The target buffer number
---@field preview_outdated boolean Whether the preview needs updating
---@field auto_preview_timer any? Timer for auto preview
---@field nodes_data NodesData? The nodes data object
---@field current_search string? Current search term
---@field first_visible_line number First visible line in graph
---@field last_visible_line number Last visible line in graph

-- State variables
---@type MundoState
local state = {
  target_buffer = nil,
  preview_outdated = true,
  auto_preview_timer = nil,
  nodes_data = nil,
  current_search = nil,
  first_visible_line = 0,
  last_visible_line = 0
}

-- Get the current target buffer
---@return number? buffer The target buffer number
function M.get_target_buffer()
  return state.target_buffer
end

-- Set the target buffer
---@param bufnr number The buffer number to set as target
function M.set_target_buffer(bufnr)
  state.target_buffer = bufnr
  state.nodes_data = tree.NodesData:new()
end

-- Get the nodes data
---@return NodesData? nodes_data The nodes data object
function M.get_nodes_data()
  return state.nodes_data
end

-- Mark preview as outdated
function M.mark_preview_outdated()
  state.preview_outdated = true
end

-- Render the undo tree graph
---@param force? boolean Force rendering even if not outdated
function M.render_graph(force)
  if not state.target_buffer or not fn.bufloaded(state.target_buffer) then
    return
  end
  
  if not utils.goto_buffer('__Mundo__') then
    return
  end
  
  local first_visible = fn.line('w0')
  local last_visible = fn.line('w$')
  local cfg = config.get()
  
  if not force and not state.nodes_data:is_outdated() and
     not cfg.inline_undo and
     state.first_visible_line == first_visible and
     state.last_visible_line == last_visible then
    return
  end
  
  state.first_visible_line = first_visible
  state.last_visible_line = last_visible
  
  local header = graph.generate_header(state.target_buffer, cfg.help)
  local result = graph.generate_graph(state.nodes_data, cfg.verbose_graph, 
                               #header + 1, first_visible, last_visible, cfg.inline_undo)
  
  local output = graph.format_output(result, cfg.mirror_graph)
  
  -- Combine header and output
  local lines = {}
  for _, line in ipairs(header) do
    table.insert(lines, line)
  end
  for _, line in ipairs(output) do
    table.insert(lines, line)
  end
  
  -- Update buffer
  vim.bo.modifiable = true
  api.nvim_buf_set_lines(0, 0, -1, false, lines)
  vim.bo.modifiable = false
  
  -- Position cursor on current node
  local current_seq = state.nodes_data:current()
  for i, line in ipairs(output) do
    if line:find('@') then
      api.nvim_win_set_cursor(0, {i + #header, 0})
      break
    end
  end
end

-- Render the preview window
function M.render_preview()
  if not state.preview_outdated then
    return
  end
  
  -- Save current window
  local current_win = api.nvim_get_current_win()
  
  local target_state = utils.get_target_state()
  if not target_state then
    return
  end
  
  local nodes, nmap = state.nodes_data:make_nodes()
  local node_after = nmap[target_state]
  local node_before = node_after and node_after.parent
  
  -- Find existing preview window instead of creating new one
  local preview_win = nil
  local preview_buf = fn.bufnr('__Mundo_Preview__')
  
  if preview_buf ~= -1 then
    local winnr = fn.bufwinnr(preview_buf)
    if winnr ~= -1 then
      preview_win = fn.win_getid(winnr)
    end
  end
  
  if not preview_win or not api.nvim_win_is_valid(preview_win) then
    -- Preview window doesn't exist, skip rendering
    return
  end
  
  -- Don't switch windows during preview rendering to avoid focus issues
  local diff_lines = state.nodes_data:preview_diff(node_before, node_after)
  
  -- Update preview buffer without switching to it
  vim.bo[preview_buf].modifiable = true
  api.nvim_buf_set_lines(preview_buf, 0, -1, false, diff_lines)
  vim.bo[preview_buf].modifiable = false
  
  state.preview_outdated = false
  
  -- Don't restore window - keep current focus
end

-- Move cursor in the undo tree
---@param direction number Direction to move (1 for down, -1 for up)
---@param count? number Number of steps to move (default: 1)
function M.move(direction, count)
  count = count or 1
  
  -- Find the Mundo window
  local mundo_buf = fn.bufnr('__Mundo__')
  if mundo_buf == -1 then
    return
  end
  
  local winnr = fn.bufwinnr(mundo_buf)
  if winnr == -1 then
    return
  end
  
  local mundo_win = fn.win_getid(winnr)
  if not api.nvim_win_is_valid(mundo_win) then
    return
  end
  
  -- Only work if we're already in the Mundo window
  if api.nvim_get_current_win() ~= mundo_win then
    return
  end
  
  local current_line = api.nvim_win_get_cursor(0)[1]
  local total_lines = api.nvim_buf_line_count(0)
  local cfg = config.get()
  local header_lines = cfg.header and (cfg.help and 13 or 2) or 0
  
  -- Find all lines that contain actual nodes (not just vertical lines)
  local node_lines = {}
  for line_num = header_lines + 1, total_lines do
    local line_content = api.nvim_buf_get_lines(0, line_num - 1, line_num, false)[1] or ''
    -- Check if this line contains a node marker (not just a vertical line)
    if line_content:match('[%[@ow%]]') then
      table.insert(node_lines, line_num)
    end
  end
  
  if #node_lines == 0 then
    return
  end
  
  -- Find current position in node_lines
  local current_index = 1
  for i, line_num in ipairs(node_lines) do
    if line_num >= current_line then
      current_index = i
      break
    end
  end
  
  -- Move to next/prev node
  local new_index = math.max(1, math.min(#node_lines, current_index + direction * count))
  local new_line = node_lines[new_index]
  
  api.nvim_win_set_cursor(0, {new_line, 0})
  
  -- Find the node marker on this line
  local line = api.nvim_get_current_line()
  local pos = line:find('[@ ow]')
  if pos then
    api.nvim_win_set_cursor(0, {new_line, pos - 1})
  end
  
  state.preview_outdated = true
  -- Render preview when moving, but don't auto-focus
  local cfg = config.get()
  if cfg.auto_preview then
    M.render_preview()
  end
end

-- Preview/revert to selected state
function M.preview()
  local target_state = utils.get_target_state()
  if not target_state then
    return
  end
  
  if not utils.goto_buffer(state.target_buffer) then
    return
  end
  
  -- Undo to target state
  if target_state > 0 then
    vim.cmd('silent undo ' .. target_state)
  else
    vim.cmd('silent earlier 999999')
  end
  
  M.render_graph()
  
  local cfg = config.get()
  if cfg.return_on_revert then
    utils.goto_buffer(state.target_buffer)
  end
  
  if cfg.close_on_revert then
    require('mundo').close()
  end
end

-- Toggle help display
function M.toggle_help()
  local cfg = config.get()
  cfg.help = not cfg.help
  M.render_graph(true)
end

-- Play changes to selected state
function M.play_to()
  local target_state = utils.get_target_state()
  if not target_state then
    return
  end
  
  local current_state = state.nodes_data:current()
  if current_state == target_state then
    return
  end
  
  if not utils.goto_buffer(state.target_buffer) then
    return
  end
  
  -- Simple playback - just undo to target
  if target_state > 0 then
    vim.cmd('silent undo ' .. target_state)
  else
    vim.cmd('silent earlier 999999')
  end
  
  M.render_graph()
  vim.cmd('redraw')
end

-- Show diff in vertical split
function M.diff()
  local target_state = utils.get_target_state()
  if not target_state then
    return
  end
  
  M.render_preview()
  
  if not utils.goto_buffer('__Mundo_Preview__') then
    return
  end
  
  local lines = api.nvim_buf_get_lines(0, 0, -1, false)
  if #lines == 1 and lines[1] == '' then
    utils.goto_buffer('__Mundo__')
    utils.echo('No difference between current file and undo number!', 'WarningMsg')
    return
  end
  
  -- Create a temporary file for the diff
  local tmp_file = fn.tempname()
  fn.writefile(lines, tmp_file)
  
  utils.goto_buffer('__Mundo__')
  vim.cmd('quit')
  
  utils.goto_buffer('__Mundo_Preview__')
  vim.cmd('bdelete')
  
  vim.cmd('silent! keepalt vert diffpatch ' .. tmp_file)
  api.nvim_buf_set_option(0, 'buftype', 'nofile')
  api.nvim_buf_set_option(0, 'bufhidden', 'delete')
end

-- Return to the target buffer
function M.return_to_buffer()
  if state.target_buffer and fn.bufloaded(state.target_buffer) then
    local target_winnr = fn.bufwinnr(state.target_buffer)
    if target_winnr ~= -1 then
      vim.cmd(target_winnr .. ' wincmd w')
    else
      -- If target buffer window doesn't exist, create one
      vim.cmd('wincmd p') -- Go to previous window
      utils.goto_buffer(state.target_buffer)
    end
  end
end

-- Setup autocommands
function M.setup_autocmds()
  local group = api.nvim_create_augroup('Mundo', {clear = true})
  
  api.nvim_create_autocmd({'TextChanged', 'InsertLeave'}, {
    group = group,
    callback = function()
      if state.nodes_data then
        state.nodes_data.outdated = true
        state.preview_outdated = true
      end
    end
  })
end

-- Clear state
function M.clear_state()
  state.target_buffer = nil
  state.nodes_data = nil
  state.preview_outdated = true
end

return M