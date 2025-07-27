-- Tests for mundo.config module
local test = require('test_framework')

-- Setup test environment
package.path = package.path .. ";../lua/?.lua"

local config = require('mundo.config')

test.describe("Config Module", function()
  -- Reset config before each test
  config.current = {}
end)

test.it("should have default configuration", function()
  test.assert.is_type(config.defaults, "table", "defaults should be a table")
  test.assert.equals(config.defaults.auto_preview, true, "auto_preview should default to true")
  test.assert.equals(config.defaults.width, 45, "width should default to 45")
  test.assert.equals(config.defaults.preview_height, 15, "preview_height should default to 15")
  test.assert.is_type(config.defaults.mappings, "table", "mappings should be a table")
end)

test.it("should setup configuration with defaults", function()
  local result = config.setup()
  
  test.assert.is_type(result, "table", "setup should return a table")
  test.assert.equals(result.auto_preview, true, "should use default auto_preview")
  test.assert.equals(result.width, 45, "should use default width")
  test.assert.is_not_nil(result.mappings['q'], "should have quit mapping")
end)

test.it("should merge user options with defaults", function()
  local user_opts = {
    width = 60,
    auto_preview = false,
    custom_option = "test"
  }
  
  local result = config.setup(user_opts)
  
  test.assert.equals(result.width, 60, "should use user width")
  test.assert.equals(result.auto_preview, false, "should use user auto_preview")
  test.assert.equals(result.preview_height, 15, "should keep default preview_height")
  test.assert.equals(result.custom_option, "test", "should include custom options")
end)

test.it("should add move mappings to config", function()
  local user_opts = {
    map_move_older = 'j',
    map_move_newer = 'k'
  }
  
  local result = config.setup(user_opts)
  
  test.assert.equals(result.mappings['j'], 'move_older', "should add older move mapping")
  test.assert.equals(result.mappings['k'], 'move_newer', "should add newer move mapping")
end)

test.it("should get current configuration", function()
  config.setup({ width = 50 })
  
  local current = config.get()
  test.assert.equals(current.width, 50, "should return current config")
end)

test.it("should get specific config value", function()
  config.setup({ width = 50, auto_preview = false })
  
  test.assert.equals(config.get_value('width'), 50, "should return specific value")
  test.assert.equals(config.get_value('auto_preview'), false, "should return boolean value")
  test.assert.is_nil(config.get_value('nonexistent'), "should return nil for missing key")
end)

test.it("should handle empty user options", function()
  local result = config.setup({})
  
  test.assert.is_type(result, "table", "should handle empty options")
  test.assert.equals(result.width, 45, "should use defaults with empty options")
end)

test.it("should handle nil user options", function()
  local result = config.setup(nil)
  
  test.assert.is_type(result, "table", "should handle nil options")
  test.assert.equals(result.width, 45, "should use defaults with nil options")
end)

test.it("should preserve existing mappings when adding move mappings", function()
  local user_opts = {
    mappings = {
      ['<CR>'] = 'preview',
      ['custom'] = 'custom_action'
    },
    map_move_older = 'j',
    map_move_newer = 'k'
  }
  
  local result = config.setup(user_opts)
  
  test.assert.equals(result.mappings['<CR>'], 'preview', "should preserve existing mappings")
  test.assert.equals(result.mappings['custom'], 'custom_action', "should preserve custom mappings")
  test.assert.equals(result.mappings['j'], 'move_older', "should add move mappings")
  test.assert.equals(result.mappings['k'], 'move_newer', "should add move mappings")
end)