-- Undo tree data management and diff algorithms for nvim-mundo
local M = {}

local api = vim.api
local fn = vim.fn
local utils = require('mundo.utils')
local Node = require('mundo.node').Node

---@class NodesData
---@field nodes Node[] List of all nodes in the undo tree
---@field nmap table<number, Node> Map from sequence number to node
---@field target_n number? Target buffer number
---@field outdated boolean Whether the data needs to be refreshed
local NodesData = {}
NodesData.__index = NodesData

-- Create a new NodesData instance
---@return NodesData data The new NodesData instance
function NodesData:new()
  local obj = {
    nodes = {},
    nmap = {},
    target_n = nil,
    outdated = true
  }
  setmetatable(obj, self)
  return obj
end

-- Check if the nodes data is outdated
---@return boolean outdated True if data needs to be refreshed
function NodesData:is_outdated()
  return self.outdated
end

-- Build the nodes and node map from the undo tree
---@return Node[] nodes List of all nodes
---@return table<number, Node> nmap Map from sequence number to node
function NodesData:make_nodes()
  local target_n = require('mundo.core').get_target_buffer()
  if not target_n or not fn.bufloaded(target_n) then
    return {}, {}
  end
  
  -- Switch to target buffer to get undo tree
  local current_win = api.nvim_get_current_win()
  if not utils.goto_buffer(target_n) then
    return {}, {}
  end
  
  -- Get undo tree using Vim's undotree() function
  local undotree = fn.undotree()
  local entries = undotree.entries or {}
  
  self.nodes = {}
  self.nmap = {}
  
  -- Create root node (represents the initial empty state)
  local root = Node:new(0, nil, 0)
  self.nodes[1] = root
  self.nmap[0] = root
  
  -- Create all nodes first
  for _, entry in ipairs(entries) do
    local node = Node:new(entry.seq, nil, entry.time, entry.curhead)
    self.nodes[#self.nodes + 1] = node
    self.nmap[entry.seq] = node
  end
  
  -- Build parent-child relationships using Vim's undo tree structure
  for _, entry in ipairs(entries) do
    local node = self.nmap[entry.seq]
    if not node then goto continue end
    
    local parent_node = nil
    
    if entry.alt and #entry.alt > 0 then
      -- This entry has alternatives, meaning it branches from an earlier state
      local parent_seq = entry.alt[1].seq
      parent_node = self.nmap[parent_seq]
    else
      -- Linear progression - parent is the previous sequence number
      if entry.seq == 1 then
        parent_node = root
      else
        -- Find the highest sequence number less than current that exists
        for seq = entry.seq - 1, 1, -1 do
          if self.nmap[seq] then
            parent_node = self.nmap[seq]
            break
          end
        end
        if not parent_node then
          parent_node = root
        end
      end
    end
    
    if parent_node then
      node.parent = parent_node
      parent_node:add_child(node)
    end
    
    ::continue::
  end
  
  -- Restore original window
  api.nvim_set_current_win(current_win)
  
  self.target_n = target_n
  self.outdated = false
  
  return self.nodes, self.nmap
end

-- Get the current undo state number
---@return number state The current undo state number
function NodesData:current()
  local target_buffer = require('mundo.core').get_target_buffer()
  if not target_buffer then return 0 end
  
  local current_win = api.nvim_get_current_win()
  if not utils.goto_buffer(target_buffer) then
    return 0
  end
  
  local changenr = fn.changenr()
  api.nvim_set_current_win(current_win)
  
  return changenr
end

---@class DiffChange
---@field type 'add'|'delete'|'equal'|'context' The type of change
---@field before_line? number Line number in before text
---@field after_line? number Line number in after text
---@field content string The line content

---@class DiffHunk
---@field before_start number Starting line number in before text
---@field after_start number Starting line number in after text
---@field changes DiffChange[] List of changes in this hunk

-- Simple LCS-based diff algorithm
---@param a string[] First array of lines
---@param b string[] Second array of lines
---@return number[][] dp The dynamic programming table
local function compute_lcs(a, b)
  local m, n = #a, #b
  local dp = {}
  
  -- Initialize DP table
  for i = 0, m do
    dp[i] = {}
    for j = 0, n do
      dp[i][j] = 0
    end
  end
  
  -- Fill DP table
  for i = 1, m do
    for j = 1, n do
      if a[i] == b[j] then
        dp[i][j] = dp[i-1][j-1] + 1
      else
        dp[i][j] = math.max(dp[i-1][j], dp[i][j-1])
      end
    end
  end
  
  return dp
end

-- Generate unified diff format
---@param before_lines string[] Lines from before state
---@param after_lines string[] Lines from after state
---@param context_lines? number Number of context lines (default: 3)
---@return string[] diff_lines The unified diff lines
local function generate_unified_diff(before_lines, after_lines, context_lines)
  context_lines = context_lines or 3
  
  local diff_lines = {}
  local lcs_table = compute_lcs(before_lines, after_lines)
  local m, n = #before_lines, #after_lines
  
  -- Backtrack to find the actual diff
  local changes = {}
  local i, j = m, n
  
  while i > 0 or j > 0 do
    if i > 0 and j > 0 and before_lines[i] == after_lines[j] then
      table.insert(changes, 1, {type = 'equal', before_line = i, after_line = j, content = before_lines[i]})
      i = i - 1
      j = j - 1
    elseif j > 0 and (i == 0 or lcs_table[i][j-1] >= lcs_table[i-1][j]) then
      table.insert(changes, 1, {type = 'add', after_line = j, content = after_lines[j]})
      j = j - 1
    elseif i > 0 and (j == 0 or lcs_table[i][j-1] < lcs_table[i-1][j]) then
      table.insert(changes, 1, {type = 'delete', before_line = i, content = before_lines[i]})
      i = i - 1
    end
  end
  
  -- Group changes into hunks with context
  local hunks = {}
  local current_hunk = nil
  
  for idx, change in ipairs(changes) do
    if change.type ~= 'equal' then
      -- Start a new hunk if needed
      if not current_hunk then
        current_hunk = {
          before_start = math.max(1, (change.before_line or change.after_line or 1) - context_lines),
          after_start = math.max(1, (change.after_line or change.before_line or 1) - context_lines),
          changes = {}
        }
        
        -- Add context before
        local ref_line = change.before_line or change.after_line or 1
        local context_start = math.max(1, ref_line - context_lines)
        local context_end = ref_line - 1
        
        for line_num = context_start, context_end do
          if line_num > 0 and before_lines[line_num] then
            table.insert(current_hunk.changes, {type = 'context', content = before_lines[line_num]})
          end
        end
      end
      
      table.insert(current_hunk.changes, change)
    else
      -- Equal line - might be context or end of hunk
      if current_hunk then
        table.insert(current_hunk.changes, {type = 'context', content = change.content})
        
        -- Check if we should end this hunk
        local context_after = 0
        for next_idx = idx + 1, math.min(idx + context_lines * 2, #changes) do
          if changes[next_idx].type == 'equal' then
            context_after = context_after + 1
          else
            break
          end
        end
        
        if context_after >= context_lines * 2 or idx == #changes then
          -- End current hunk
          table.insert(hunks, current_hunk)
          current_hunk = nil
        end
      end
    end
  end
  
  -- Add final hunk if exists
  if current_hunk then
    table.insert(hunks, current_hunk)
  end
  
  -- Generate unified diff output
  for _, hunk in ipairs(hunks) do
    local before_count = 0
    local after_count = 0
    
    -- Count lines in hunk
    for _, change in ipairs(hunk.changes) do
      if change.type == 'delete' or change.type == 'context' then
        before_count = before_count + 1
      end
      if change.type == 'add' or change.type == 'context' then
        after_count = after_count + 1
      end
    end
    
    -- Add hunk header
    table.insert(diff_lines, string.format('@@ -%d,%d +%d,%d @@', 
                 hunk.before_start, before_count, hunk.after_start, after_count))
    
    -- Add hunk content
    for _, change in ipairs(hunk.changes) do
      if change.type == 'delete' then
        table.insert(diff_lines, '-' .. change.content)
      elseif change.type == 'add' then
        table.insert(diff_lines, '+' .. change.content)
      elseif change.type == 'context' then
        table.insert(diff_lines, ' ' .. change.content)
      end
    end
  end
  
  return diff_lines
end

-- Generate a preview diff between two nodes
---@param node_before Node? The before node
---@param node_after Node? The after node
---@return string[] diff_lines The diff lines to display
function NodesData:preview_diff(node_before, node_after)
  if not node_before or not node_after then
    return {'No changes to display'}
  end
  
  local target_buffer = require('mundo.core').get_target_buffer()
  local current_win = api.nvim_get_current_win()
  if not utils.goto_buffer(target_buffer) then
    return {'Cannot access target buffer'}
  end
  
  -- Save current state
  local current_changenr = fn.changenr()
  
  -- Get content at node_before
  if node_before.n > 0 then
    vim.cmd('silent undo ' .. node_before.n)
  else
    vim.cmd('silent earlier 999999')
  end
  local before_lines = api.nvim_buf_get_lines(0, 0, -1, false)
  
  -- Get content at node_after
  if node_after.n > 0 then
    vim.cmd('silent undo ' .. node_after.n)
  else
    vim.cmd('silent earlier 999999')
  end
  local after_lines = api.nvim_buf_get_lines(0, 0, -1, false)
  
  -- Restore original state
  if current_changenr > 0 then
    vim.cmd('silent undo ' .. current_changenr)
  end
  
  api.nvim_set_current_win(current_win)
  
  -- Check if there are any differences
  if #before_lines == #after_lines then
    local identical = true
    for i = 1, #before_lines do
      if before_lines[i] ~= after_lines[i] then
        identical = false
        break
      end
    end
    if identical then
      return {'No changes between these states'}
    end
  end
  
  -- Handle empty files
  if #before_lines == 0 and #after_lines == 0 then
    return {'Both states are empty'}
  end
  
  -- Generate proper unified diff
  local diff_lines = {}
  table.insert(diff_lines, string.format('--- a/buffer (undo %d)', node_before.n))
  table.insert(diff_lines, string.format('+++ b/buffer (undo %d)', node_after.n))
  
  local unified_diff = generate_unified_diff(before_lines, after_lines, 3)
  for _, line in ipairs(unified_diff) do
    table.insert(diff_lines, line)
  end
  
  return diff_lines
end

-- Export the NodesData class
M.NodesData = NodesData

return M