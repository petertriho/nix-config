-- Graph rendering logic for nvim-mundo
local M = {}

local config = require('mundo.config')
local utils = require('mundo.utils')

---@class GraphLine
---@field [1] string The graph characters (e.g., 'o', '|', '@')
---@field [2] string The info text (e.g., '[1] 10:30:15')

-- Generate the visual graph representation of the undo tree
---@param nodes_data NodesData The nodes data object
---@param verbose boolean Whether to show verbose graph
---@param header_lines number Number of header lines
---@param first_visible number First visible line number
---@param last_visible number Last visible line number
---@param show_inline boolean Whether to show inline diffs
---@return GraphLine[] tree_lines The graph lines to display
function M.generate_graph(nodes_data, verbose, header_lines, first_visible, last_visible, show_inline)
  local nodes, nmap = nodes_data:make_nodes()
  if not nodes or #nodes == 0 then
    return {}
  end
  
  local current_seq = nodes_data:current()
  
  -- Sort nodes by sequence number for display order
  table.sort(nodes, function(a, b) return a.n < b.n end)
  
  -- Filter out root node for display
  local display_nodes = {}
  for _, node in ipairs(nodes) do
    if node.n ~= 0 then
      table.insert(display_nodes, node)
    end
  end
  
  if #display_nodes == 0 then
    return {}
  end
  
  -- Show vertical lines BETWEEN nodes like the original Mundo
  local tree_lines = {}
  
  for i, node in ipairs(display_nodes) do
    -- Node marker
    local node_char = 'o'
    if node.n == current_seq then
      node_char = '@'
    elseif node.curhead then
      node_char = 'w'
    end
    
    -- Add vertical line BEFORE this node (except for the first one)
    if i > 1 then
      table.insert(tree_lines, {'|', ''})
    end
    
    -- Add the node itself
    local graph_line = node_char
    
    -- Node info
    local time_str = os.date('%H:%M:%S', node.time)
    local info_line = string.format('[%d] %s', node.n, time_str)
    
    -- Add inline diff if enabled
    if show_inline and node.parent then
      local diff = nodes_data:preview_diff(node.parent, node)
      local changes = 0
      for _, line in ipairs(diff) do
        if line:match('^[+-]') then
          changes = changes + 1
        end
      end
      if changes > 0 then
        info_line = info_line .. string.format(' (%d changes)', changes)
      end
    end
    
    table.insert(tree_lines, {graph_line, info_line})
  end
  
  return tree_lines
end

-- Format the graph output with proper spacing and mirroring
---@param tree_lines GraphLine[] The graph lines to format
---@param mirror_graph boolean Whether to mirror the graph horizontally
---@return string[] output The formatted output lines
function M.format_output(tree_lines, mirror_graph)
  local output = {}
  local dag_width = 1
  
  -- Calculate DAG width
  for _, line in ipairs(tree_lines) do
    if #line[1] > dag_width then
      dag_width = #line[1]
    end
  end
  
  -- Format output
  for _, line in ipairs(tree_lines) do
    if mirror_graph then
      local dag_line = utils.reverse_string(line[1]):gsub('/', '\\')
      local padded = string.rep(' ', dag_width - #dag_line) .. dag_line
      table.insert(output, padded .. ' ' .. line[2])
    else
      -- Simple concatenation without extra padding that might hide the graph chars
      table.insert(output, line[1] .. ' ' .. line[2])
    end
  end
  
  return output
end

-- Generate header lines for the graph
---@param target_buffer number The target buffer number
---@param show_help boolean Whether to show help text
---@return string[] header The header lines
function M.generate_header(target_buffer, show_help)
  local header = {}
  local cfg = config.get()
  
  if cfg.header then
    if show_help then
      header = {
        string.format('" Mundo (%d) - Press ? for Help:', target_buffer),
        '" j/k   Next/Prev undo state.',
        '" J/K   Next/Prev write state.',
        '" i     Toggle "inline diff" mode.',
        '" /     Find changes that match string.',
        '" n/N   Next/Prev undo that matches search.',
        '" P     Play current state to selected undo.',
        '" d     Vert diff of undo with current state.',
        '" p     Diff selected undo and current state.',
        '" r     Diff selected undo and prior undo.',
        '" q     Quit!',
        '" <cr>  Revert to selected state.',
        ''
      }
    else
      header = {string.format('" Mundo (%d) - Press ? for Help:', target_buffer), ''}
    end
  end
  
  return header
end

return M