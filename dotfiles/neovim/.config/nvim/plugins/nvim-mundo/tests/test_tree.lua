local test = require('test_framework')

-- Setup test environment
package.path = package.path .. ";../lua/?.lua"

local tree_module
local NodesData

-- Spy on vim functions
local original_nvim_get_current_win
local original_nvim_set_current_win
local original_nvim_buf_get_lines
local original_changenr

test.describe("Tree Module", function()
  -- Setup before each test
  original_nvim_get_current_win = vim.api.nvim_get_current_win
  original_nvim_set_current_win = vim.api.nvim_set_current_win
  original_nvim_buf_get_lines = vim.api.nvim_buf_get_lines
  original_changenr = vim.fn.changenr

  vim.api.nvim_get_current_win = function() return 1 end
  vim.api.nvim_set_current_win = function() end
  vim.api.nvim_buf_get_lines = function() return {} end
  vim.fn.changenr = function() return 1 end

  -- Mock the core module to avoid circular dependency
  package.loaded['mundo.core'] = {
    get_target_buffer = function() return 1 end
  }

  -- Mock utils module
  package.loaded['mundo.utils'] = {
    goto_buffer = function() return true end
  }

  -- Reload tree module to use the mocks
  package.loaded['mundo.tree'] = nil
  tree_module = require('mundo.tree')
  NodesData = tree_module.NodesData
end, function()
  -- Teardown after each test
  vim.api.nvim_get_current_win = original_nvim_get_current_win
  vim.api.nvim_set_current_win = original_nvim_set_current_win
  vim.api.nvim_buf_get_lines = original_nvim_buf_get_lines
  vim.fn.changenr = original_changenr

  package.loaded['mundo.core'] = nil
  package.loaded['mundo.utils'] = nil
  package.loaded['mundo.tree'] = nil
end)

test.it("should create a new NodesData instance", function()
  local nodes_data = NodesData:new()
  
  test.assert.is_type(nodes_data.nodes, "table", "should initialize nodes as table")
  test.assert.is_type(nodes_data.nmap, "table", "should initialize nmap as table")
  test.assert.is_nil(nodes_data.target_n, "should initialize target_n as nil")
  test.assert.is_true(nodes_data.outdated, "should initialize as outdated")
end)

test.it("should report outdated status correctly", function()
  local nodes_data = NodesData:new()
  
  test.assert.is_true(nodes_data:is_outdated(), "should be outdated initially")
  
  nodes_data.outdated = false
  test.assert.is_false(nodes_data:is_outdated(), "should not be outdated when set to false")
end)

test.it("should return current change number", function()
  -- Mock changenr to return specific value
  _G.vim.fn.changenr = function() return 5 end
  
  local nodes_data = NodesData:new()
  local current = nodes_data:current()
  
  test.assert.equals(current, 5, "should return current change number")
end)

test.it("should handle preview_diff with nil nodes", function()
  local nodes_data = NodesData:new()
  
  local diff = nodes_data:preview_diff(nil, nil)
  test.assert.contains(diff, "No changes to display", "should handle nil nodes")
  
  local node1 = { n = 1 }
  diff = nodes_data:preview_diff(node1, nil)
  test.assert.contains(diff, "No changes to display", "should handle one nil node")
end)

test.it("should generate diff for identical content", function()
  local nodes_data = NodesData:new()
  
  -- Mock identical content
  _G.vim.api.nvim_buf_get_lines = function() 
    return {"line 1", "line 2", "line 3"}
  end
  
  local node1 = { n = 1 }
  local node2 = { n = 2 }
  
  local diff = nodes_data:preview_diff(node1, node2)
  test.assert.contains(diff, "No changes between these states", "should detect identical content")
end)

test.it("should generate diff for empty files", function()
  local nodes_data = NodesData:new()
  
  -- Mock empty content for both calls
  _G.vim.api.nvim_buf_get_lines = function() 
    return {}
  end
  
  local node1 = { n = 1 }
  local node2 = { n = 2 }
  
  local diff = nodes_data:preview_diff(node1, node2)
  -- Empty files are considered identical, so should return "No changes between these states"
  test.assert.contains(diff, "No changes between these states", "should handle empty files as identical")
end)

test.it("should generate unified diff for different content", function()
  local nodes_data = NodesData:new()
  local call_count = 0
  
  -- Mock different content for before and after
  _G.vim.api.nvim_buf_get_lines = function()
    call_count = call_count + 1
    if call_count == 1 then
      -- Before content
      return {"line 1", "line 2", "line 3"}
    else
      -- After content  
      return {"line 1", "modified line 2", "line 3", "new line 4"}
    end
  end
  
  local node1 = { n = 1 }
  local node2 = { n = 2 }
  
  local diff = nodes_data:preview_diff(node1, node2)
  
  test.assert.contains(diff, "--- a/buffer (undo 1)", "should have diff header")
  test.assert.contains(diff, "+++ b/buffer (undo 2)", "should have diff header")
  
  -- Should contain unified diff markers
  local has_hunk_header = false
  local has_deletion = false
  local has_addition = false
  
  for _, line in ipairs(diff) do
    if line:match("^@@") then
      has_hunk_header = true
    elseif line:match("^%-") and not line:match("^%-%-%-") then
      has_deletion = true
    elseif line:match("^%+") and not line:match("^%+%+%+") then
      has_addition = true
    end
  end
  
  test.assert.is_true(has_hunk_header, "should have hunk header")
end)

test.it("should handle make_nodes with no target buffer", function()
  -- Mock no target buffer
  package.loaded['mundo.core'].get_target_buffer = function() return nil end
  
  local nodes_data = NodesData:new()
  local nodes, nmap = nodes_data:make_nodes()
  
  test.assert.equals(#nodes, 0, "should return empty nodes")
  test.assert.equals(next(nmap), nil, "should return empty nmap")
end)

test.it("should handle make_nodes with valid undotree", function()
  -- Mock target buffer and undotree
  package.loaded['mundo.core'].get_target_buffer = function() return 1 end
  _G.vim.fn.bufloaded = function() return true end
  _G.vim.fn.undotree = function()
    return {
      entries = {
        { seq = 1, time = 1234567890, curhead = false },
        { seq = 2, time = 1234567891, curhead = true }
      }
    }
  end
  
  local nodes_data = NodesData:new()
  local nodes, nmap = nodes_data:make_nodes()
  
  test.assert.equals(#nodes, 3, "should create root + 2 nodes")
  test.assert.is_not_nil(nmap[0], "should have root node")
  test.assert.is_not_nil(nmap[1], "should have node 1")
  test.assert.is_not_nil(nmap[2], "should have node 2")
  test.assert.equals(nmap[1].n, 1, "node 1 should have correct sequence")
  test.assert.equals(nmap[2].n, 2, "node 2 should have correct sequence")
  test.assert.is_true(nmap[2].curhead, "node 2 should be curhead")
end)