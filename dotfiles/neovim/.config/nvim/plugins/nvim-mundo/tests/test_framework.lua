-- Simple test framework for nvim-mundo
local M = {}

---@class TestResult
---@field name string Test name
---@field passed boolean Whether the test passed
---@field error string? Error message if test failed
---@field duration number Test execution time in milliseconds

---@class TestSuite
---@field name string Suite name
---@field tests TestResult[] List of test results
---@field setup_fn? function Setup function to run before each test
---@field teardown_fn? function Teardown function to run after each test

-- Global test state
local current_suite = nil
local all_suites = {}

-- Create a new test suite
---@param name string The name of the test suite
---@param setup_fn? function Optional setup function
---@param teardown_fn? function Optional teardown function
---@return TestSuite suite The test suite
function M.describe(name, setup_fn, teardown_fn)
  local suite = {
    name = name,
    tests = {},
    setup_fn = setup_fn,
    teardown_fn = teardown_fn
  }
  table.insert(all_suites, suite)
  current_suite = suite
  return suite
end

-- Add a test to the current suite
---@param name string The test name
---@param test_fn function The test function
function M.it(name, test_fn)
  if not current_suite then
    error("No test suite defined. Use describe() first.")
  end

  local start_time = vim.loop.hrtime()
  local success, err

  -- Run setup and test inside a pcall
  local test_body = function()
    if current_suite.setup_fn then
      current_suite.setup_fn()
    end
    test_fn()
  end
  success, err = pcall(test_body)

  -- Always run teardown, regardless of test success
  if current_suite.teardown_fn then
    local teardown_success, teardown_err = pcall(current_suite.teardown_fn)
    if not teardown_success then
      if success then
        -- Test passed but teardown failed
        success = false
        err = "Teardown failed: " .. tostring(teardown_err)
      else
        -- Test failed and teardown also failed
        err = tostring(err) .. "\n[Teardown also failed: " .. tostring(teardown_err) .. "]"
      end
    end
  end

  local end_time = vim.loop.hrtime()
  local duration = (end_time - start_time) / 1000000 -- Convert to milliseconds

  local result = {
    name = name,
    passed = success,
    error = success and nil or tostring(err),
    duration = duration
  }

  table.insert(current_suite.tests, result)
end


-- Assertion functions
local assert = {}

function assert.equals(actual, expected, message)
  if actual ~= expected then
    error(string.format("%s\nExpected: %s\nActual: %s", 
          message or "Assertion failed", 
          vim.inspect(expected), 
          vim.inspect(actual)))
  end
end

function assert.not_equals(actual, expected, message)
  if actual == expected then
    error(string.format("%s\nExpected not to equal: %s", 
          message or "Assertion failed", 
          vim.inspect(expected)))
  end
end

function assert.is_true(value, message)
  if value ~= true then
    error(string.format("%s\nExpected: true\nActual: %s", 
          message or "Assertion failed", 
          vim.inspect(value)))
  end
end

function assert.is_false(value, message)
  if value ~= false then
    error(string.format("%s\nExpected: false\nActual: %s", 
          message or "Assertion failed", 
          vim.inspect(value)))
  end
end

function assert.is_nil(value, message)
  if value ~= nil then
    error(string.format("%s\nExpected: nil\nActual: %s", 
          message or "Assertion failed", 
          vim.inspect(value)))
  end
end

function assert.is_not_nil(value, message)
  if value == nil then
    error(string.format("%s\nExpected: not nil\nActual: nil", 
          message or "Assertion failed"))
  end
end

function assert.is_type(value, expected_type, message)
  local actual_type = type(value)
  if actual_type ~= expected_type then
    error(string.format("%s\nExpected type: %s\nActual type: %s", 
          message or "Type assertion failed", 
          expected_type, 
          actual_type))
  end
end

function assert.contains(table_or_string, item, message)
  local found = false
  if type(table_or_string) == "table" then
    for _, v in ipairs(table_or_string) do
      if v == item then
        found = true
        break
      end
    end
  elseif type(table_or_string) == "string" then
    found = string.find(table_or_string, item, 1, true) ~= nil
  end
  
  if not found then
    error(string.format("%s\nExpected to contain: %s\nIn: %s", 
          message or "Contains assertion failed", 
          vim.inspect(item), 
          vim.inspect(table_or_string)))
  end
end

function assert.throws(fn, expected_error, message)
  local success, err = pcall(fn)
  if success then
    error(string.format("%s\nExpected function to throw an error", 
          message or "Throws assertion failed"))
  end
  
  if expected_error and not string.find(tostring(err), expected_error, 1, true) then
    error(string.format("%s\nExpected error containing: %s\nActual error: %s", 
          message or "Throws assertion failed", 
          expected_error, 
          tostring(err)))
  end
end

M.assert = assert

-- Run all tests and return results
---@return table results Summary of all test results
function M.run_tests()
  local total_tests = 0
  local passed_tests = 0
  local failed_tests = 0
  local total_duration = 0
  
  print("Running nvim-mundo tests...\n")
  
  for _, suite in ipairs(all_suites) do
    print(string.format("📦 %s", suite.name))
    
    local suite_passed = 0
    local suite_failed = 0
    
    for _, test in ipairs(suite.tests) do
      total_tests = total_tests + 1
      total_duration = total_duration + test.duration
      
      if test.passed then
        passed_tests = passed_tests + 1
        suite_passed = suite_passed + 1
        print(string.format("  ✅ %s (%.2fms)", test.name, test.duration))
      else
        failed_tests = failed_tests + 1
        suite_failed = suite_failed + 1
        print(string.format("  ❌ %s (%.2fms)", test.name, test.duration))
        print(string.format("     %s", test.error))
      end
    end
    
    print(string.format("  📊 %d passed, %d failed\n", suite_passed, suite_failed))
  end
  
  print(string.format("🏁 Test Summary:"))
  print(string.format("   Total: %d tests", total_tests))
  print(string.format("   Passed: %d", passed_tests))
  print(string.format("   Failed: %d", failed_tests))
  print(string.format("   Duration: %.2fms", total_duration))
  
  if failed_tests > 0 then
    print(string.format("   Status: ❌ FAILED"))
    os.exit(1)
  else
    print(string.format("   Status: ✅ PASSED"))
  end
  
  return {
    total = total_tests,
    passed = passed_tests,
    failed = failed_tests,
    duration = total_duration,
    suites = all_suites
  }
end

-- Clear all test suites (useful for testing)
function M.clear_suites()
  all_suites = {}
  current_suite = nil
end

return M