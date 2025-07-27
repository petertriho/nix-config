-- Tests for mundo.graph module
local test = require('test_framework')

-- Setup test environment
package.path = package.path .. ";../lua/?.lua"

-- Since we are not mocking config and utils anymore, we need to require them
local config = require('mundo.config')
local utils = require('mundo.utils')
local graph = require('mundo.graph')

test.describe("Graph Module")

test.it("should generate empty graph for no nodes", function()
  local mock_nodes_data = {
    make_nodes = function() return {}, {} end,
    current = function() return 0 end
  }
  
  local result = graph.generate_graph(mock_nodes_data, true, 0, 1, 10, false)
  test.assert.equals(#result, 0, "should return empty graph for no nodes")
end)

test.it("should generate graph with single node", function()
  local mock_node = {
    n = 1,
    time = 1234567890,
    curhead = false
  }
  
  local mock_nodes_data = {
    make_nodes = function() 
      return {mock_node}, {[1] = mock_node}
    end,
    current = function() return 1 end
  }
  
  local result = graph.generate_graph(mock_nodes_data, true, 0, 1, 10, false)
  
  test.assert.equals(#result, 1, "should return one graph line")
  test.assert.equals(result[1][1], "@", "should mark current node with @")
  test.assert.contains(result[1][2], "[1]", "should contain sequence number")
end)

test.it("should generate graph with multiple nodes and vertical lines", function()
  local node1 = { n = 1, time = 1234567890, curhead = false }
  local node2 = { n = 2, time = 1234567891, curhead = true }
  
  local mock_nodes_data = {
    make_nodes = function() 
      return {node1, node2}, {[1] = node1, [2] = node2}
    end,
    current = function() return 1 end
  }
  
  local result = graph.generate_graph(mock_nodes_data, true, 0, 1, 10, false)
  
  test.assert.equals(#result, 3, "should have 2 nodes + 1 vertical line")
  test.assert.equals(result[1][1], "@", "first node should be current")
  test.assert.equals(result[2][1], "|", "should have vertical line between nodes")
  test.assert.equals(result[3][1], "w", "second node should be write state")
end)

test.it("should mark different node types correctly", function()
  local regular_node = { n = 1, time = 1234567890, curhead = false }
  local current_node = { n = 2, time = 1234567891, curhead = false }
  local write_node = { n = 3, time = 1234567892, curhead = true }
  
  local mock_nodes_data = {
    make_nodes = function() 
      return {regular_node, current_node, write_node}, 
             {[1] = regular_node, [2] = current_node, [3] = write_node}
    end,
    current = function() return 2 end
  }
  
  local result = graph.generate_graph(mock_nodes_data, true, 0, 1, 10, false)
  
  -- Find the node markers (skip vertical lines)
  local node_markers = {}
  for _, line in ipairs(result) do
    if line[1] ~= "|" then
      table.insert(node_markers, line[1])
    end
  end
  
  test.assert.equals(node_markers[1], "o", "regular node should be 'o'")
  test.assert.equals(node_markers[2], "@", "current node should be '@'")
  test.assert.equals(node_markers[3], "w", "write node should be 'w'")
end)

test.it("should format output without mirroring", function()
  local tree_lines = {
    {"o", "[1] 10:30:15"},
    {"|", ""},
    {"@", "[2] 10:30:20"}
  }
  
  local result = graph.format_output(tree_lines, false)
  
  test.assert.equals(#result, 3, "should preserve all lines")
  test.assert.equals(result[1], "o [1] 10:30:15", "should format node line")
  test.assert.equals(result[2], "| ", "should format vertical line")
  test.assert.equals(result[3], "@ [2] 10:30:20", "should format current node line")
end)

test.it("should format output with mirroring", function()
  local tree_lines = {
    {"o", "[1] 10:30:15"},
    {"/", "branch"}
  }
  
  local result = graph.format_output(tree_lines, true)
  
  test.assert.contains(result[1], "o [1] 10:30:15", "should contain node info")
  test.assert.contains(result[2], "\\ branch", "should mirror / to \\")
end)

test.it("should generate header with help disabled", function()
  config.setup({ header = true }) -- Ensure header is on
  local header = graph.generate_header(1, false)
  
  test.assert.equals(#header, 2, "should have 2 header lines when help disabled")
  test.assert.contains(header[1], "Mundo (1)", "should contain buffer number")
  test.assert.contains(header[1], "Press ? for Help", "should contain help hint")
  test.assert.equals(header[2], "", "should have empty line")
end)

test.it("should generate header with help enabled", function()
  config.setup({ header = true }) -- Ensure header is on
  local header = graph.generate_header(1, true)
  
  test.assert.equals(#header, 13, "should have 13 header lines when help enabled")
  test.assert.contains(header[1], "Mundo (1)", "should contain buffer number")
  test.assert.contains(header[2], "j/k", "should contain navigation help")
  test.assert.contains(header[3], "J/K", "should contain write state navigation")
  test.assert.contains(header[11], "q", "should contain quit help")
end)

test.it("should handle inline diff information", function()
  local node_with_parent = { 
    n = 2, 
    time = 1234567891, 
    curhead = false,
    parent = { n = 1 }
  }
  
  local mock_nodes_data = {
    make_nodes = function() 
      return {node_with_parent}, {[2] = node_with_parent}
    end,
    current = function() return 2 end,
    preview_diff = function(parent, node)
      return {"+added line", "-removed line"}
    end
  }
  
  local result = graph.generate_graph(mock_nodes_data, true, 0, 1, 10, true)
  
  test.assert.equals(#result, 1, "should have one node")
  test.assert.contains(result[1][2], "(2 changes)", "should show change count")
end)

