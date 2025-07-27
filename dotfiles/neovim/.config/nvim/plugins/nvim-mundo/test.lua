-- Simple test runner for nvim-mundo
-- Run with: nvim --headless -l test.lua

-- Setup paths
package.path = package.path .. ";./lua/?.lua;./tests/?.lua"

-- Load test framework
local test = require('test_framework')

-- Load all test files
require('test_config')
require('test_utils')
require('test_node')
require('test_tree')
require('test_graph')
require('test_integration')

-- Run all tests
test.run_tests()