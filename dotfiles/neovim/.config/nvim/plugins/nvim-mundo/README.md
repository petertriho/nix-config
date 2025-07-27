# nvim-mundo

A Lua rewrite of the [vim-mundo](https://github.com/simnalamburt/vim-mundo) plugin for Neovim. Visualizes the Vim undo tree in a graphical format with proper tree visualization and unified diff support.

## Features

- **Undo tree visualization**: See your undo history as a branching tree with vertical lines
- **Interactive navigation**: Move through undo states with keyboard shortcuts
- **Live preview**: See unified diffs of changes as you navigate
- **Proper diff format**: LCS-based unified diff with context lines and @@ headers
- **Search functionality**: Find specific changes in your undo history
- **Playback mode**: Replay changes step by step
- **Pure Lua**: No Python dependencies required
- **Fixed focus issues**: Cursor stays in target buffer, no auto-jumping to Mundo window

## Installation

### Using Lazy.nvim

```lua
{
  dir = "~/.config/nvim/plugins/nvim-mundo", -- Local plugin
  cmd = { "MundoToggle", "MundoShow", "MundoHide" },
  keys = {
    { "<leader>u", "<CMD>MundoToggle<CR>", desc = "Toggle Mundo Undo Tree" },
  },
  config = function()
    require('mundo').setup({
      -- Your configuration here
    })
  end,
}
```

### Using other plugin managers

Add the plugin directory to your plugin manager configuration.

## Usage

### Commands

- `:MundoToggle` - Toggle the Mundo window
- `:MundoShow` - Show the Mundo window
- `:MundoHide` - Hide the Mundo window

### Default Key Mappings (in Mundo window)

- `j/k` - Move to next/previous undo state
- `J/K` - Move to next/previous write state
- `<CR>/o` - Preview/revert to selected state
- `P` - Play changes to selected state
- `d` - Show diff in vertical split
- `p` - Show diff in preview window
- `i` - Toggle inline diff mode
- `/` - Search for changes
- `n/N` - Next/previous search match
- `?` - Toggle help
- `q/<Esc>/<C-c>` - Quit Mundo
- `<Tab>/<C-w>p` - Return to target buffer

## Configuration

```lua
require("mundo").setup({
    -- Window positioning
    right = false, -- Open on right side
    preview_bottom = false, -- Preview window at bottom

    -- Window sizing
    width = 45, -- Graph window width
    preview_height = 15, -- Preview window height

    -- Behavior
    auto_preview = true, -- Auto-update preview
    auto_preview_delay = 250, -- Delay for auto-preview (ms)
    close_on_revert = false, -- Close after reverting
    return_on_revert = true, -- Return to original buffer after revert

    -- Display
    verbose_graph = true, -- Show detailed graph
    mirror_graph = false, -- Mirror the graph horizontally
    inline_undo = false, -- Show inline diffs
    help = false, -- Show help by default
    header = true, -- Show header

    -- Navigation
    map_move_newer = "k", -- Key to move to newer undo
    map_move_older = "j", -- Key to move to older undo
    map_up_down = true, -- Use arrow keys for navigation

    -- Playback
    playback_delay = 60, -- Delay between playback steps (ms)

    -- Custom mappings (optional)
    mappings = {
        ["<CR>"] = "preview",
        ["o"] = "preview",
        ["J"] = "move_older_write",
        ["K"] = "move_newer_write",
        ["P"] = "play_to",
        ["d"] = "diff",
        ["i"] = "toggle_inline",
        ["/"] = "search",
        ["n"] = "next_match",
        ["N"] = "previous_match",
        ["p"] = "diff_current_buffer",
        ["?"] = "toggle_help",
        ["q"] = "quit",
    },
})
```

## Differences from vim-mundo

This Lua implementation provides the core functionality of vim-mundo with some differences:

### Advantages

- **No Python dependency**: Pure Lua implementation
- **Better Neovim integration**: Uses modern Neovim APIs
- **Proper unified diff**: LCS-based diff algorithm with context lines
- **Fixed focus issues**: No unwanted cursor jumping between windows
- **Tree visualization**: Vertical lines connecting undo states like original Mundo
- **Modular architecture**: Clean separation of concerns for maintainability
- **Type annotations**: Full lua-language-server support with @class, @param, @return annotations
- **Simpler codebase**: Easier to understand and modify
- **Local configuration**: Easy to customize in your dotfiles

### Limitations

- **Simplified branching**: Complex branching scenarios may not be fully visualized
- **Missing advanced features**: Some edge cases and advanced features from the original may not be implemented

## API

```lua
local mundo = require("mundo")

-- Setup with custom configuration
mundo.setup({
    width = 50,
    auto_preview = false,
})

-- Programmatic control
mundo.show() -- Show Mundo
mundo.hide() -- Hide Mundo
mundo.toggle() -- Toggle Mundo
mundo.move(1) -- Move down in tree
mundo.move(-1) -- Move up in tree
mundo.preview() -- Preview/revert to current state
mundo.diff() -- Show diff in split
```

## Recent Improvements

- **Fixed cursor focus issues**: Cursor no longer auto-jumps back to Mundo window
- **Proper tree visualization**: Added vertical lines (`|`) between undo states like original Mundo
- **Enhanced navigation**: j/k keys now skip vertical lines and jump directly between nodes
- **Unified diff format**: Implemented LCS-based diff algorithm with proper @@ headers and context lines
- **Better syntax highlighting**: Uses 'diff' filetype for proper syntax highlighting in preview
- **Modular refactor**: Broke down 1184-line monolith into 8 focused modules for better maintainability
- **Type annotations**: Added comprehensive lua-language-server type annotations for better IDE support
- **Unit tests**: Comprehensive test suite with 49+ tests covering all modules

## Architecture

The plugin is organized into focused modules:

- **`config.lua`** (67 lines): Configuration management and defaults
- **`utils.lua`** (118 lines): Utility functions and buffer operations
- **`node.lua`** (26 lines): Undo tree node structure
- **`tree.lua`** (333 lines): Tree data management and LCS-based diff algorithms
- **`graph.lua`** (131 lines): Graph rendering and formatting logic
- **`window.lua`** (204 lines): Window management and UI setup
- **`core.lua`** (353 lines): Core functionality (navigation, preview, etc.)
- **`init.lua`** (133 lines): Main API and public interface

This modular structure makes the codebase easier to:
- **Understand**: Each module has a single responsibility
- **Maintain**: Changes are isolated to specific concerns
- **Test**: Individual components can be tested separately
- **Extend**: New features can be added without affecting other modules
- **Develop**: Full type annotations provide IntelliSense and error checking in supported editors
- **Test**: Comprehensive unit tests ensure reliability and catch regressions

## Type Safety

The plugin includes comprehensive type annotations compatible with lua-language-server:

- **@class definitions**: `MundoConfig`, `Node`, `NodesData`, `GraphLine`, etc.
- **@param annotations**: Parameter types and descriptions for all functions
- **@return annotations**: Return type information
- **@field annotations**: Class property definitions
- **Optional types**: Proper handling of nullable values with `?` syntax

This provides excellent IDE support with:
- Auto-completion for configuration options
- Parameter hints and validation
- Return type inference
- Error detection for type mismatches

## Testing

The plugin includes a comprehensive test suite with 49+ tests covering all modules:

### Running Tests

```bash
# Run all tests
nvim --headless -l test.lua

# Or use the Makefile
make test

# Run specific test modules
make test-config    # Config module tests
make test-utils     # Utils module tests  
make test-node      # Node module tests
make test-tree      # Tree module tests
make test-graph     # Graph module tests
make test-integration # Integration tests
```

### Test Structure

- **`tests/test_framework.lua`**: Custom test framework with assertions
- **`tests/test_config.lua`**: Configuration module tests
- **`tests/test_utils.lua`**: Utility functions tests
- **`tests/test_node.lua`**: Node structure tests
- **`tests/test_tree.lua`**: Tree data and diff algorithm tests
- **`tests/test_graph.lua`**: Graph rendering tests
- **`tests/test_integration.lua`**: Integration and API tests

### Test Features

- **Assertion library**: `equals`, `not_equals`, `is_true`, `is_false`, `is_nil`, `contains`, `throws`
- **Test organization**: Grouped tests with setup/teardown support
- **Mocking**: Vim API mocking for headless testing
- **Performance tracking**: Test execution time measurement
- **Detailed reporting**: Clear pass/fail status with error messages

## Requirements

- Neovim 0.7+
- `undofile` enabled for persistent undo history (recommended)

## Recommended Vim Settings

```vim
" Enable persistent undo
set undofile
set undodir=~/.vim/undo
```

Or in Lua:

```lua
vim.opt.undofile = true
vim.opt.undodir = vim.fn.expand("~/.vim/undo")
```
