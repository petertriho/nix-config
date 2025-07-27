-- Tests for mundo.utils module
local test = require('test_framework')

-- Setup test environment
package.path = package.path .. ";../lua/?.lua"

-- Mock vim functions for testing
_G.vim = _G.vim or {}
_G.vim.cmd = _G.vim.cmd or function() end
_G.vim.api = _G.vim.api or {}
_G.vim.fn = _G.vim.fn or {}
_G.vim.bo = _G.vim.bo or {}
_G.vim.wo = _G.vim.wo or {}

-- Mock some basic vim functions
_G.vim.api.nvim_get_current_buf = function() return 1 end
_G.vim.fn.bufnr = function(name) 
  if name == '__Mundo__' then return 2 end
  if name == '__Mundo_Preview__' then return 3 end
  return -1 
end
_G.vim.fn.bufwinnr = function(bufnr) 
  if bufnr == 2 or bufnr == 3 then return 1 end
  return -1 
end
_G.vim.fn.bufloaded = function() return true end

local utils = require('mundo.utils')

test.describe("Utils Module")

test.it("should reverse strings correctly", function()
  test.assert.equals(utils.reverse_string("hello"), "olleh", "should reverse simple string")
  test.assert.equals(utils.reverse_string(""), "", "should handle empty string")
  test.assert.equals(utils.reverse_string("a"), "a", "should handle single character")
  test.assert.equals(utils.reverse_string("12345"), "54321", "should reverse numbers")
end)

test.it("should handle goto_buffer with different input types", function()
  -- Mock vim.cmd to track calls
  local cmd_calls = {}
  _G.vim.cmd = function(cmd) table.insert(cmd_calls, cmd) end
  
  -- Mock fn.bufnr and fn.bufwinnr for valid buffer
  _G.vim.fn.bufnr = function(name_or_nr) 
    if name_or_nr == 1 then return 1 end
    return -1 
  end
  _G.vim.fn.bufwinnr = function(bufnr) 
    if bufnr == 1 then return 1 end
    return -1 
  end
  
  -- Test with valid buffer number
  local result = utils.goto_buffer(1)
  test.assert.is_true(result, "should succeed with valid buffer number")
  test.assert.equals(#cmd_calls, 1, "should call vim.cmd once")
  test.assert.contains(cmd_calls[1], "wincmd w", "should call window command")
  
  -- Test with nil input
  result = utils.goto_buffer(nil)
  test.assert.is_false(result, "should fail with nil input")
  
  -- Test with invalid type
  result = utils.goto_buffer({})
  test.assert.is_false(result, "should fail with table input")
  
  -- Test with non-existent buffer
  result = utils.goto_buffer(999)
  test.assert.is_false(result, "should fail with non-existent buffer")
end)

test.it("should check if Mundo is visible", function()
  -- Mock buffers exist and have windows
  _G.vim.fn.bufnr = function(name)
    if name == '__Mundo__' then return 2 end
    if name == '__Mundo_Preview__' then return 3 end
    return -1
  end
  _G.vim.fn.bufwinnr = function(bufnr)
    if bufnr == 2 then return 1 end -- Mundo window exists
    if bufnr == 3 then return -1 end -- Preview window doesn't exist
    return -1
  end
  
  local visible = utils.is_mundo_visible()
  test.assert.is_true(visible, "should be visible when Mundo window exists")
  
  -- Mock no windows exist
  _G.vim.fn.bufwinnr = function() return -1 end
  
  visible = utils.is_mundo_visible()
  test.assert.is_false(visible, "should not be visible when no windows exist")
end)

test.it("should validate target buffer correctly", function()
  -- Mock a valid modifiable buffer
  _G.vim.bo = setmetatable({}, {
    __index = function(_, bufnr)
      return {
        buftype = '',
        modifiable = true
      }
    end
  })
  _G.vim.wo = { previewwindow = false }
  
  local valid = utils.is_valid_target_buffer()
  test.assert.is_true(valid, "should be valid for normal modifiable buffer")
  
  -- Mock non-modifiable buffer
  _G.vim.bo = setmetatable({}, {
    __index = function(_, bufnr)
      return {
        buftype = '',
        modifiable = false
      }
    end
  })
  
  valid = utils.is_valid_target_buffer()
  test.assert.is_false(valid, "should be invalid for non-modifiable buffer")
  
  -- Mock help buffer
  _G.vim.bo = setmetatable({}, {
    __index = function(_, bufnr)
      return {
        buftype = 'help',
        modifiable = true
      }
    end
  })
  
  valid = utils.is_valid_target_buffer()
  test.assert.is_false(valid, "should be invalid for help buffer")
end)

test.it("should extract target state from line", function()
  -- Mock Mundo window and cursor position
  _G.vim.fn.bufnr = function(name) return name == '__Mundo__' and 2 or -1 end
  _G.vim.fn.bufwinnr = function(bufnr) return bufnr == 2 and 1 or -1 end
  _G.vim.fn.win_getid = function() return 100 end
  _G.vim.api.nvim_win_is_valid = function() return true end
  _G.vim.api.nvim_win_get_cursor = function() return {1, 0} end
  _G.vim.api.nvim_buf_get_lines = function() 
    return {"o [5] 10:30:15"} 
  end
  
  local state = utils.get_target_state()
  test.assert.equals(state, 5, "should extract state number from line")
  
  -- Test with no match
  _G.vim.api.nvim_buf_get_lines = function() 
    return {"no state here"} 
  end
  
  state = utils.get_target_state()
  test.assert.equals(state, 0, "should return 0 when no state found")
  
  -- Test with no Mundo buffer
  _G.vim.fn.bufnr = function() return -1 end
  
  state = utils.get_target_state()
  test.assert.is_nil(state, "should return nil when no Mundo buffer")
end)

test.it("should cleanup Mundo buffers", function()
  local wiped_buffers = {}
  _G.vim.cmd = function(cmd)
    local bufnr = cmd:match("bwipeout! (%d+)")
    if bufnr then
      table.insert(wiped_buffers, tonumber(bufnr))
    end
  end
  
  _G.vim.fn.bufnr = function(name)
    if name == '__Mundo__' then return 2 end
    if name == '__Mundo_Preview__' then return 3 end
    return -1
  end
  _G.vim.fn.bufloaded = function(bufnr) return bufnr == 2 or bufnr == 3 end
  
  utils.cleanup_mundo_buffers()
  
  test.assert.contains(wiped_buffers, 2, "should wipe Mundo buffer")
  test.assert.contains(wiped_buffers, 3, "should wipe Preview buffer")
end)