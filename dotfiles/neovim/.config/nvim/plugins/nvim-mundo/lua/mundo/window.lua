-- Window management for nvim-mundo
local M = {}

local api = vim.api
local fn = vim.fn
local config = require('mundo.config')
local utils = require('mundo.utils')

-- Resize Mundo windows according to configuration
function M.resize_windows()
  local cfg = config.get()
  
  -- Resize graph window
  if utils.goto_buffer('__Mundo__') then
    vim.cmd('vertical resize ' .. cfg.width)
  end
  
  -- Resize preview window
  if utils.goto_buffer('__Mundo_Preview__') then
    vim.cmd('resize ' .. cfg.preview_height)
  end
end

-- Create and configure the preview window
function M.open_preview_window()
  local cfg = config.get()
  
  -- Always create a new window (buffers should be cleaned up before this)
  if cfg.preview_bottom then
    vim.cmd('botright new __Mundo_Preview__')
  else
    local pos = cfg.right and 'botright' or 'topleft'
    vim.cmd(pos .. ' vnew __Mundo_Preview__')
  end
  
  -- Set buffer options
  local buf = api.nvim_get_current_buf()
  vim.bo[buf].buftype = 'nofile'
  vim.bo[buf].bufhidden = 'hide'
  vim.bo[buf].swapfile = false
  vim.bo[buf].buflisted = false
  vim.bo[buf].modifiable = false
  vim.bo[buf].filetype = 'diff'
  
  -- Set window options
  vim.wo.number = false
  vim.wo.relativenumber = false
  vim.wo.wrap = false
  vim.wo.foldlevel = 20
  vim.wo.foldmethod = 'diff'
  
  -- Set up key mappings for preview window
  api.nvim_buf_set_keymap(buf, 'n', 'q', '<cmd>lua require("mundo").close()<CR>', {noremap = true, silent = true})
end

-- Create and configure the graph window
function M.open_graph_window()
  local cfg = config.get()
  
  -- Make sure we're in the preview window first
  if not utils.goto_buffer('__Mundo_Preview__') then
    return
  end
  
  -- Always create a new window (buffers should be cleaned up before this)
  if cfg.preview_bottom then
    local pos = cfg.right and 'botright' or 'topleft'
    vim.cmd(pos .. ' vsplit __Mundo__')
  else
    vim.cmd('split __Mundo__')
  end
  
  -- Set buffer options
  local buf = api.nvim_get_current_buf()
  vim.bo[buf].buftype = 'nofile'
  vim.bo[buf].bufhidden = 'hide'
  vim.bo[buf].swapfile = false
  vim.bo[buf].buflisted = false
  vim.bo[buf].modifiable = false
  vim.bo[buf].filetype = 'Mundo'
  
  -- Set window options
  vim.wo.foldenable = false
  vim.wo.list = false
  vim.wo.number = false
  vim.wo.relativenumber = false
  vim.wo.wrap = false
  
  M.setup_syntax_highlighting()
  M.setup_key_mappings(buf)
end

-- Setup syntax highlighting for the graph window
function M.setup_syntax_highlighting()
  vim.cmd([[
    syntax match MundoCurrentLocation '@'
    syntax match MundoNode '[ow]'
    syntax match MundoVertical '|'
    syntax match MundoHorizontal '[-]'
    syntax match MundoBranch '[\\]'
    syntax match MundoHelp '\v^".*$'
    syntax match MundoNumberField '\v\[[0-9]+\]'
    syntax match MundoNumber '\v[0-9]+' contained containedin=MundoNumberField
    syntax region MundoDiff start=/\v<ago> / end=/$/
    syntax match MundoDiffAdd '\v\+[^+-]+\+' contained containedin=MundoDiff
    syntax match MundoDiffDelete '\v-[^+-]+-' contained containedin=MundoDiff
    
    highlight default link MundoCurrentLocation Keyword
    highlight default link MundoNode Special
    highlight default link MundoVertical Comment
    highlight default link MundoHorizontal Comment
    highlight default link MundoBranch Comment
    highlight default link MundoHelp Comment
    highlight default link MundoNumberField Comment
    highlight default link MundoNumber Identifier
    highlight default link MundoDiffAdd DiffAdd
    highlight default link MundoDiffDelete DiffDelete
  ]])
end

-- Setup key mappings for the graph window
---@param buf number The buffer number to set mappings for
function M.setup_key_mappings(buf)
  local cfg = config.get()
  
  ---@param key string The key to map
  ---@param action string The action command
  local function map(key, action)
    api.nvim_buf_set_keymap(buf, 'n', key, action, {noremap = true, silent = true})
  end
  
  -- Setup configured mappings
  for key, action in pairs(cfg.mappings) do
    if action == 'preview' then
      map(key, '<cmd>lua require("mundo").preview()<CR>')
    elseif action == 'move_older' then
      map(key, '<cmd>lua require("mundo").move(1)<CR>')
    elseif action == 'move_newer' then
      map(key, '<cmd>lua require("mundo").move(-1)<CR>')
    elseif action == 'quit' then
      map(key, '<cmd>lua require("mundo").close()<CR>')
    elseif action == 'toggle_help' then
      map(key, '<cmd>lua require("mundo").toggle_help()<CR>')
    elseif action == 'play_to' then
      map(key, '<cmd>lua require("mundo").play_to()<CR>')
    elseif action == 'diff' then
      map(key, '<cmd>lua require("mundo").diff()<CR>')
    end
  end
  
  -- Add default mappings
  map(cfg.map_move_older, '<cmd>lua require("mundo").move(1)<CR>')
  map(cfg.map_move_newer, '<cmd>lua require("mundo").move(-1)<CR>')
  
  if cfg.map_up_down then
    map('<Down>', '<cmd>lua require("mundo").move(1)<CR>')
    map('<Up>', '<cmd>lua require("mundo").move(-1)<CR>')
  end
  
  -- Essential mappings that should always work
  map('q', '<cmd>lua require("mundo").close()<CR>')
  map('<Esc>', '<cmd>lua require("mundo").close()<CR>')
  map('<C-c>', '<cmd>lua require("mundo").close()<CR>')
  map('<C-w>p', '<cmd>lua require("mundo").return_to_buffer()<CR>')
  map('<Tab>', '<cmd>lua require("mundo").return_to_buffer()<CR>')
  
  -- Add command abbreviations for quitting
  vim.cmd('cabbrev <buffer> q lua require("mundo").close()')
  vim.cmd('cabbrev <buffer> quit lua require("mundo").close()')
end

-- Close all Mundo windows and return to target buffer
function M.close_windows()
  local target_win = nil
  local core = require('mundo.core')
  local target_buffer = core.get_target_buffer()
  
  -- Find the target buffer window
  if target_buffer then
    local target_winnr = fn.bufwinnr(target_buffer)
    if target_winnr ~= -1 then
      target_win = fn.win_getid(target_winnr)
    end
  end
  
  -- Simple approach: close all windows with Mundo buffers
  local mundo_buf = fn.bufnr('__Mundo__')
  local preview_buf = fn.bufnr('__Mundo_Preview__')
  
  -- Close all windows containing these buffers
  for _, winid in ipairs(api.nvim_list_wins()) do
    if api.nvim_win_is_valid(winid) then
      local bufnr = api.nvim_win_get_buf(winid)
      if bufnr == mundo_buf or bufnr == preview_buf then
        api.nvim_win_close(winid, false)
      end
    end
  end
  
  -- Return to target window if it exists
  if target_win and api.nvim_win_is_valid(target_win) then
    api.nvim_set_current_win(target_win)
  elseif target_buffer and fn.bufloaded(target_buffer) then
    utils.goto_buffer(target_buffer)
  end
end

return M