-- nvim-mundo: A Lua rewrite of vim-mundo for Neovim
-- Main API module
local M = {}

-- Import modules
local config = require('mundo.config')
local utils = require('mundo.utils')
local window = require('mundo.window')
local core = require('mundo.core')

-- Setup the plugin with user configuration
---@param opts? MundoConfig User configuration options
function M.setup(opts)
  config.setup(opts)
  core.setup_autocmds()
end

-- Toggle Mundo visibility
function M.toggle()
  if utils.is_mundo_visible() then
    M.close()
  else
    M.show()
  end
end

-- Show Mundo windows
function M.show()
  if not utils.is_valid_target_buffer() then
    return
  end
  
  local target_buffer = vim.api.nvim_get_current_buf()
  
  M.close() -- Close any existing windows
  utils.cleanup_mundo_buffers() -- Clean up any leftover buffers
  
  -- Set state after closing
  core.set_target_buffer(target_buffer)
  
  -- Save settings
  local saved_splitbelow = vim.o.splitbelow
  local cfg = config.get()
  local saved_auto_preview = cfg.auto_preview
  vim.o.splitbelow = false
  cfg.auto_preview = false -- Temporarily disable auto preview
  
  local success, err = pcall(function()
    -- Create preview window first
    window.open_preview_window()
    
    -- Go back to target buffer
    utils.goto_buffer(target_buffer)
    
    -- Create graph window
    window.open_graph_window()
    
    -- Resize windows properly
    window.resize_windows()
    
    -- Render content - make sure we're in graph window first
    if utils.goto_buffer('__Mundo__') then
      core.render_graph(true)
      
      -- Position cursor on current node in graph
      local nodes_data = core.get_nodes_data()
      local current_seq = nodes_data:current()
      local lines = vim.api.nvim_buf_get_lines(0, 0, -1, false)
      for i, line in ipairs(lines) do
        if line:find('@') then
          vim.api.nvim_win_set_cursor(0, {i, 0})
          break
        end
      end
      
      -- Now render preview (this will only update existing window)
      core.render_preview()
      
      -- Return focus to the target buffer, not the Mundo window
      utils.goto_buffer(target_buffer)
    end
  end)
  
  -- Restore settings
  vim.o.splitbelow = saved_splitbelow
  cfg.auto_preview = saved_auto_preview
  
  if not success then
    utils.echo('Error opening Mundo: ' .. tostring(err), 'ErrorMsg')
    M.close()
  end
end

-- Hide Mundo windows
function M.hide()
  M.close()
end

-- Return to the original buffer without closing Mundo
function M.return_to_buffer()
  core.return_to_buffer()
end

-- Close Mundo windows and clean up
function M.close()
  window.close_windows()
  core.clear_state()
end

-- Move cursor in the undo tree
---@param direction number Direction to move (1 for down, -1 for up)
---@param count? number Number of steps to move (default: 1)
function M.move(direction, count)
  core.move(direction, count)
end

-- Preview/revert to selected state
function M.preview()
  core.preview()
end

-- Toggle help display
function M.toggle_help()
  core.toggle_help()
end

-- Play changes to selected state
function M.play_to()
  core.play_to()
end

-- Show diff in vertical split
function M.diff()
  core.diff()
end

return M