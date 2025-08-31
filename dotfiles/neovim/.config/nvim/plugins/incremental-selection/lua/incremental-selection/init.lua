-- Incremental selection using modern vim.treesitter API

local api = vim.api

local M = {}

local selections = {}

local function get_node_at_position(row, col)
    local buf = api.nvim_get_current_buf()

    local ok, parser = pcall(vim.treesitter.get_parser, buf)
    if not ok or not parser then
        return nil
    end

    local trees = parser:parse()
    if not trees or #trees == 0 then
        return nil
    end

    local root = trees[1]:root()
    return root:descendant_for_range(row, col, row, col)
end

local function select_range(start_row, start_col, end_row, end_col)
    -- Convert to 1-based for vim
    start_row = start_row + 1
    start_col = start_col + 1
    end_row = end_row + 1
    end_col = end_col + 1

    -- Validate positions
    local buf = api.nvim_get_current_buf()
    local line_count = api.nvim_buf_line_count(buf)

    start_row = math.min(start_row, line_count)
    end_row = math.min(end_row, line_count)

    -- Set visual selection marks
    vim.fn.setpos("'<", { buf, start_row, start_col, 0 })
    vim.fn.setpos("'>", { buf, end_row, end_col, 0 })

    -- Move cursor to start position and reselect
    api.nvim_win_set_cursor(0, { start_row, start_col - 1 })
    vim.cmd("normal! gv")
end

function M.init_selection()
    local buf = api.nvim_get_current_buf()
    local cursor = api.nvim_win_get_cursor(0)
    local row, col = cursor[1] - 1, cursor[2]

    local node = get_node_at_position(row, col)
    if node then
        selections[buf] = { node }
        local start_row, start_col, end_row, end_col = node:range()
        select_range(start_row, start_col, end_row, end_col)
    end
end

function M.node_incremental()
    local buf = api.nvim_get_current_buf()

    -- If no selections, start fresh
    if not selections[buf] or #selections[buf] == 0 then
        M.init_selection()
        return
    end

    local current_node = selections[buf][#selections[buf]]
    local parent = current_node:parent()

    if parent and parent ~= current_node then
        table.insert(selections[buf], parent)
        local start_row, start_col, end_row, end_col = parent:range()
        select_range(start_row, start_col, end_row, end_col)
    end
end

function M.node_decremental()
    local buf = api.nvim_get_current_buf()

    if not selections[buf] or #selections[buf] <= 1 then
        return
    end

    table.remove(selections[buf])
    local node = selections[buf][#selections[buf]]

    local start_row, start_col, end_row, end_col = node:range()
    select_range(start_row, start_col, end_row, end_col)
end

-- Clear selections when starting fresh
function M.clear_selections()
    local buf = api.nvim_get_current_buf()
    selections[buf] = nil
end

function M.scope_incremental()
    M.node_incremental()
end

function M.setup(opts)
    opts = opts or {}

    local augroup = api.nvim_create_augroup("incremental_selection", { clear = true })

    api.nvim_create_autocmd("ModeChanged", {
        group = augroup,
        pattern = "v*:*",
        callback = function()
            local buf = api.nvim_get_current_buf()
            selections[buf] = nil
        end,
    })

    local keymaps = opts.keymaps
        or {
            init_selection = "gnn",
            node_incremental = "grn",
            scope_incremental = "grc",
            node_decremental = "grm",
        }

    if keymaps.init_selection then
        vim.keymap.set("n", keymaps.init_selection, M.init_selection, { desc = "Init selection" })
    end

    -- Set up keymaps for incremental/decremental in visual mode
    if keymaps.node_incremental then
        vim.keymap.set("v", keymaps.node_incremental, M.node_incremental, { desc = "Node incremental" })
    end

    if keymaps.scope_incremental then
        vim.keymap.set("v", keymaps.scope_incremental, M.scope_incremental, { desc = "Scope incremental" })
    end

    if keymaps.node_decremental then
        vim.keymap.set("v", keymaps.node_decremental, M.node_decremental, { desc = "Node decremental" })
    end
end

return M
