-- Undo tree node structure for nvim-mundo
local M = {}

---@class Node
---@field n number The sequence number of this undo state
---@field parent Node? The parent node in the undo tree
---@field children Node[] List of child nodes
---@field time number Timestamp when this undo state was created
---@field curhead boolean Whether this is the current head of a branch
local Node = {}
Node.__index = Node

-- Create a new undo tree node
---@param n number The sequence number
---@param parent Node? The parent node
---@param time number The timestamp
---@param curhead? boolean Whether this is the current head (default: false)
---@return Node node The new node
function Node:new(n, parent, time, curhead)
  local node = {
    n = n,
    parent = parent,
    children = {},
    time = time,
    curhead = curhead or false
  }
  setmetatable(node, self)
  return node
end

-- Add a child node to this node
---@param child Node The child node to add
function Node:add_child(child)
  table.insert(self.children, child)
end

-- Export the Node class
M.Node = Node

return M