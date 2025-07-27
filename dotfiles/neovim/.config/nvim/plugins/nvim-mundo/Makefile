# Makefile for nvim-mundo

.PHONY: test test-unit test-integration test-config test-utils test-node test-tree test-graph clean help

# Default target
help:
	@echo "Available targets:"
	@echo "  test           - Run all tests"
	@echo "  test-unit      - Run unit tests only"
	@echo "  test-integration - Run integration tests only"
	@echo "  test-config    - Run config module tests"
	@echo "  test-utils     - Run utils module tests"
	@echo "  test-node      - Run node module tests"
	@echo "  test-tree      - Run tree module tests"
	@echo "  test-graph     - Run graph module tests"
	@echo "  clean          - Clean test artifacts"

# Run all tests
test:
	@echo "Running all nvim-mundo tests..."
	@lua tests/run_tests.lua

# Run unit tests (all except integration)
test-unit:
	@echo "Running unit tests..."
	@lua tests/run_tests.lua tests.test_config
	@lua tests/run_tests.lua tests.test_utils
	@lua tests/run_tests.lua tests.test_node
	@lua tests/run_tests.lua tests.test_tree
	@lua tests/run_tests.lua tests.test_graph

# Run integration tests only
test-integration:
	@echo "Running integration tests..."
	@lua tests/run_tests.lua tests.test_integration

# Run specific module tests
test-config:
	@echo "Running config module tests..."
	@lua tests/run_tests.lua tests.test_config

test-utils:
	@echo "Running utils module tests..."
	@lua tests/run_tests.lua tests.test_utils

test-node:
	@echo "Running node module tests..."
	@lua tests/run_tests.lua tests.test_node

test-tree:
	@echo "Running tree module tests..."
	@lua tests/run_tests.lua tests.test_tree

test-graph:
	@echo "Running graph module tests..."
	@lua tests/run_tests.lua tests.test_graph

# Clean test artifacts
clean:
	@echo "Cleaning test artifacts..."
	@find . -name "*.tmp" -delete 2>/dev/null || true
	@find . -name "*.log" -delete 2>/dev/null || true

# Test with verbose output
test-verbose:
	@echo "Running tests with verbose output..."
	@LUA_PATH="./lua/?.lua;./tests/?.lua;;" lua tests/run_tests.lua