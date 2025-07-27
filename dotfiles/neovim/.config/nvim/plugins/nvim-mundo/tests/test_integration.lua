-- Integration tests for nvim-mundo
local test = require('test_framework')

-- Setup test environment
package.path = package.path .. ";../lua/?.lua"

test.describe("Integration Tests")

test.it("should load all modules without errors", function()
  local modules = {
    'mundo.config',
    'mundo.utils',
    'mundo.node', 
    'mundo.tree',
    'mundo.graph',
    'mundo.window',
    'mundo.core',
    'mundo.init'
  }
  
  for _, module_name in ipairs(modules) do
    local success, module = pcall(require, module_name)
    test.assert.is_true(success, "should load " .. module_name .. " without error")
    test.assert.is_type(module, "table", module_name .. " should return a table")
  end
end)

test.it("should setup plugin with default configuration", function()
  -- Mock vim.api functions needed for setup
  _G.vim.api.nvim_create_augroup = function() return 1 end
  _G.vim.api.nvim_create_autocmd = function() end

  -- Mock core.setup_autocmds to prevent error
  local core = require('mundo.core')
  core.setup_autocmds = function() end

  local mundo = require('mundo.init')

  test.assert.is_type(mundo.setup, "function", "should have setup function")
  test.assert.is_type(mundo.toggle, "function", "should have toggle function")
  test.assert.is_type(mundo.show, "function", "should have show function")
  test.assert.is_type(mundo.close, "function", "should have close function")

  -- Test setup doesn't throw errors
  local success, err = pcall(mundo.setup, {})
  test.assert.is_true(success, "setup should not throw errors: " .. tostring(err))
end)

test.it("should create and manipulate node tree structure", function()
  local node_module = require('mundo.node')
  local Node = node_module.Node
  
  -- Create a small tree structure
  local root = Node:new(0, nil, 0)
  local node1 = Node:new(1, root, 1000)
  local node2 = Node:new(2, node1, 2000)
  local node3 = Node:new(3, node1, 3000, true)
  
  root:add_child(node1)
  node1:add_child(node2)
  node1:add_child(node3)
  
  -- Verify tree structure
  test.assert.equals(#root.children, 1, "root should have one child")
  test.assert.equals(#node1.children, 2, "node1 should have two children")
  test.assert.equals(node2.parent, node1, "node2 parent should be node1")
  test.assert.equals(node3.parent, node1, "node3 parent should be node1")
  test.assert.is_true(node3.curhead, "node3 should be curhead")
end)

test.it("should handle configuration merging correctly", function()
  -- Clear any previous config state
  package.loaded['mundo.config'] = nil
  local config = require('mundo.config')
  
  -- Test with partial configuration
  local user_config = {
    width = 60,
    auto_preview = false,
    mappings = {
      ['custom'] = 'custom_action'
    }
  }
  
  local result = config.setup(user_config)
  
  -- Should merge with defaults
  test.assert.equals(result.width, 60, "should use user width")
  test.assert.equals(result.auto_preview, false, "should use user auto_preview")
  test.assert.equals(result.preview_height, 15, "should keep default preview_height")
  test.assert.equals(result.mappings['custom'], 'custom_action', "should include custom mapping")
  test.assert.is_not_nil(result.mappings['q'], "should keep default mappings")
end)

test.it("should generate consistent graph output", function()
  local graph = require('mundo.graph')
  
  -- Mock a simple nodes data structure
  local mock_nodes_data = {
    make_nodes = function()
      local nodes = {
        { n = 1, time = 1000, curhead = false },
        { n = 2, time = 2000, curhead = true }
      }
      local nmap = { [1] = nodes[1], [2] = nodes[2] }
      return nodes, nmap
    end,
    current = function() return 1 end
  }
  
  local tree_lines = graph.generate_graph(mock_nodes_data, true, 0, 1, 10, false)
  
  test.assert.equals(#tree_lines, 3, "should generate 2 nodes + 1 vertical line")
  
  local output = graph.format_output(tree_lines, false)
  test.assert.equals(#output, 3, "should format all lines")
  
  -- Verify structure
  test.assert.contains(output[1], "@", "first line should contain current marker")
  test.assert.contains(output[2], "|", "second line should be vertical connector")
  test.assert.contains(output[3], "w", "third line should contain write marker")
end)



test.it("should create NodesData and handle basic operations", function()
  local tree_module = require('mundo.tree')
  local NodesData = tree_module.NodesData
  
  local nodes_data = NodesData:new()
  
  test.assert.is_true(nodes_data:is_outdated(), "should be outdated initially")
  test.assert.is_type(nodes_data.nodes, "table", "should have nodes table")
  test.assert.is_type(nodes_data.nmap, "table", "should have nmap table")
  
  -- Test current function
  local current = nodes_data:current()
  test.assert.is_type(current, "number", "current should return a number")
end)

test.it("should handle plugin API functions", function()
  -- Mock required vim functions
  _G.vim.api.nvim_create_augroup = function() return 1 end
  _G.vim.api.nvim_create_autocmd = function() end
  
  local mundo = require('mundo.init')
  
  -- Test that API functions exist and are callable
  local api_functions = {
    'setup', 'toggle', 'show', 'hide', 'close', 
    'move', 'preview', 'toggle_help', 'play_to', 'diff'
  }
  
  for _, func_name in ipairs(api_functions) do
    test.assert.is_type(mundo[func_name], "function", 
                       func_name .. " should be a function")
  end
  
  -- Test that functions don't throw when called with valid parameters
  local success = pcall(mundo.setup, { width = 50 })
  test.assert.is_true(success, "setup should not throw with valid config")
end)