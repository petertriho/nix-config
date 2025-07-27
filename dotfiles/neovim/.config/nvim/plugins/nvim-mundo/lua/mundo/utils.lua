-- Utility functions for nvim-mundo
local M = {}

local api = vim.api
local fn = vim.fn

-- Display a message with optional highlighting
---@param msg string The message to display
---@param hl_group? string The highlight group to use (default: 'None')
function M.echo(msg, hl_group)
  hl_group = hl_group or 'None'
  vim.cmd(string.format('echohl %s | echo "%s" | echohl None', hl_group, msg))
end

-- Reverse a string
---@param str string The string to reverse
---@return string reversed The reversed string
function M.reverse_string(str)
  if not str then
    return ''
  end
  return str:reverse()
end

-- Navigate to a buffer by name or number
---@param name_or_nr string|number Buffer name or number
---@return boolean success True if navigation was successful
function M.goto_buffer(name_or_nr)
  if not name_or_nr then
    return false
  end
  
  local bufnr
  if type(name_or_nr) == 'string' then
    bufnr = fn.bufnr(name_or_nr)
  elseif type(name_or_nr) == 'number' then
    bufnr = name_or_nr
  else
    return false
  end
  
  if bufnr == -1 then return false end
  
  local winnr = fn.bufwinnr(bufnr)
  if winnr == -1 then return false end
  
  vim.cmd(winnr .. ' wincmd w')
  return true
end

-- Check if current buffer is valid for Mundo operations
---@return boolean valid True if current buffer is valid for Mundo
function M.is_valid_target_buffer()
  local bufnr = api.nvim_get_current_buf()
  local buftype = vim.bo[bufnr].buftype
  local modifiable = vim.bo[bufnr].modifiable
  local previewwindow = vim.wo.previewwindow
  
  if not modifiable then
    M.echo('Current buffer is not modifiable', 'WarningMsg')
    return false
  elseif previewwindow then
    M.echo('Current buffer is a preview window', 'WarningMsg')
    return false
  elseif buftype == 'help' or buftype == 'quickfix' or buftype == 'terminal' then
    M.echo('Current buffer is a ' .. buftype .. ' window', 'WarningMsg')
    return false
  end
  
  return true
end

-- Check if Mundo windows are currently visible
---@return boolean visible True if any Mundo window is visible
function M.is_mundo_visible()
  local mundo_buf = fn.bufnr('__Mundo__')
  local preview_buf = fn.bufnr('__Mundo_Preview__')
  
  return (mundo_buf ~= -1 and fn.bufwinnr(mundo_buf) ~= -1) or
         (preview_buf ~= -1 and fn.bufwinnr(preview_buf) ~= -1)
end

-- Clean up any existing Mundo buffers
function M.cleanup_mundo_buffers()
  local mundo_buf = fn.bufnr('__Mundo__')
  local preview_buf = fn.bufnr('__Mundo_Preview__')
  
  if mundo_buf ~= -1 and fn.bufloaded(mundo_buf) then
    vim.cmd('bwipeout! ' .. mundo_buf)
  end
  
  if preview_buf ~= -1 and fn.bufloaded(preview_buf) then
    vim.cmd('bwipeout! ' .. preview_buf)
  end
end

-- Get the target state from cursor position in Mundo window
---@return number? state The undo state number, or nil if not found
function M.get_target_state()
  local mundo_buf = fn.bufnr('__Mundo__')
  if mundo_buf == -1 then
    return nil
  end
  
  local winnr = fn.bufwinnr(mundo_buf)
  if winnr == -1 then
    return nil
  end
  
  local mundo_win = fn.win_getid(winnr)
  if not api.nvim_win_is_valid(mundo_win) then
    return nil
  end
  
  -- Get cursor position from Mundo window
  local cursor_pos = api.nvim_win_get_cursor(mundo_win)
  local line = api.nvim_buf_get_lines(mundo_buf, cursor_pos[1] - 1, cursor_pos[1], false)[1]
  
  if not line then
    return nil
  end
  
  local seq = line:match('%[(%d+)%]')
  return seq and tonumber(seq) or 0
end

return M