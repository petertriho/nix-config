-- Tests for mundo.node module
local test = require('test_framework')

-- Setup test environment
package.path = package.path .. ";../lua/?.lua"

local node_module = require('mundo.node')
local Node = node_module.Node

test.describe("Node Module")

test.it("should create a new node with required parameters", function()
  local node = Node:new(1, nil, 1234567890)
  
  test.assert.equals(node.n, 1, "should set sequence number")
  test.assert.is_nil(node.parent, "should set parent to nil")
  test.assert.equals(node.time, 1234567890, "should set timestamp")
  test.assert.is_false(node.curhead, "should default curhead to false")
  test.assert.is_type(node.children, "table", "should initialize children as table")
  test.assert.equals(#node.children, 0, "should start with empty children")
end)

test.it("should create a node with curhead parameter", function()
  local node = Node:new(2, nil, 1234567890, true)
  
  test.assert.is_true(node.curhead, "should set curhead to true when provided")
end)

test.it("should create a node with parent", function()
  local parent = Node:new(1, nil, 1234567890)
  local child = Node:new(2, parent, 1234567891)
  
  test.assert.equals(child.parent, parent, "should set parent reference")
  test.assert.equals(child.parent.n, 1, "should reference correct parent")
end)

test.it("should add children to a node", function()
  local parent = Node:new(1, nil, 1234567890)
  local child1 = Node:new(2, parent, 1234567891)
  local child2 = Node:new(3, parent, 1234567892)
  
  parent:add_child(child1)
  parent:add_child(child2)
  
  test.assert.equals(#parent.children, 2, "should have two children")
  test.assert.equals(parent.children[1], child1, "should contain first child")
  test.assert.equals(parent.children[2], child2, "should contain second child")
end)

test.it("should maintain proper node relationships", function()
  local root = Node:new(0, nil, 1234567890)
  local node1 = Node:new(1, root, 1234567891)
  local node2 = Node:new(2, node1, 1234567892)
  local node3 = Node:new(3, node1, 1234567893)
  
  root:add_child(node1)
  node1:add_child(node2)
  node1:add_child(node3)
  
  -- Test parent-child relationships
  test.assert.equals(node1.parent, root, "node1 should have root as parent")
  test.assert.equals(node2.parent, node1, "node2 should have node1 as parent")
  test.assert.equals(node3.parent, node1, "node3 should have node1 as parent")
  
  -- Test children arrays
  test.assert.equals(#root.children, 1, "root should have one child")
  test.assert.equals(#node1.children, 2, "node1 should have two children")
  test.assert.equals(#node2.children, 0, "node2 should have no children")
  test.assert.equals(#node3.children, 0, "node3 should have no children")
end)

test.it("should handle node with sequence number 0", function()
  local root = Node:new(0, nil, 0)
  
  test.assert.equals(root.n, 0, "should handle sequence number 0")
  test.assert.equals(root.time, 0, "should handle timestamp 0")
  test.assert.is_nil(root.parent, "root should have no parent")
end)

test.it("should preserve node properties after adding children", function()
  local parent = Node:new(5, nil, 1234567890, true)
  local child = Node:new(6, parent, 1234567891, false)
  
  parent:add_child(child)
  
  test.assert.equals(parent.n, 5, "parent sequence should be preserved")
  test.assert.is_true(parent.curhead, "parent curhead should be preserved")
  test.assert.equals(parent.time, 1234567890, "parent time should be preserved")
  
  test.assert.equals(child.n, 6, "child sequence should be preserved")
  test.assert.is_false(child.curhead, "child curhead should be preserved")
  test.assert.equals(child.time, 1234567891, "child time should be preserved")
end)

test.it("should allow multiple children with same parent", function()
  local parent = Node:new(1, nil, 1234567890)
  local children = {}
  
  -- Add multiple children
  for i = 2, 5 do
    local child = Node:new(i, parent, 1234567890 + i)
    parent:add_child(child)
    table.insert(children, child)
  end
  
  test.assert.equals(#parent.children, 4, "should have four children")
  
  -- Verify all children are present and in order
  for i, child in ipairs(children) do
    test.assert.equals(parent.children[i], child, "child " .. i .. " should be in correct position")
    test.assert.equals(child.parent, parent, "child " .. i .. " should reference parent")
  end
end)