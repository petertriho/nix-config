local keymap = vim.keymap.set
local opts = { noremap = true, silent = true }

-- Buffers: Navigation
keymap("", "<S-l>", "<CMD>bnext<CR>", { desc = "Next Buffer" })
keymap("", "<S-h>", "<CMD>bprev<CR>", { desc = "Previous Buffer" })
keymap("", "<S-m>", "<C-^>", { desc = "Alternate Buffer" })

-- Windows: Navigation
keymap("", "<C-j>", "<C-w>j", {})
keymap("", "<C-k>", "<C-w>k", {})
keymap("", "<C-h>", "<C-w>h", {})
keymap("", "<C-l>", "<C-w>l", {})
keymap("", "<C-\\>", "<C-w>p", {})

-- Exchange lines
keymap("n", "]e", ":m .+1<CR>==", { unpack(opts), desc = "Exchange Below" })
keymap("n", "[e", ":m .-2<CR>==", { unpack(opts), desc = "Exchange Above" })
keymap("x", "]e", ":m '>+1<CR>gv=gv", { unpack(opts), desc = "Exchange Below" })
keymap("x", "[e", ":m '<-2<CR>gv=gv", { unpack(opts), desc = "Exchange Above" })

-- Diagnostics: next/prev
keymap("n", "]d", function()
    vim.diagnostic.jump({ count = 1, float = true })
end, { desc = "Next Diagnostic" })
keymap("n", "[d", function()
    vim.diagnostic.jump({ count = -1, float = true })
end, { desc = "Prev Diagnostic" })

-- Line Text Objects
keymap("v", "al", ":<C-u>norm!0v$h<CR>", { unpack(opts), desc = "Outer Line" })
keymap("v", "il", ":<C-u>norm!^vg_<CR>", { unpack(opts), desc = "Inner Line" })
keymap("o", "al", ":norm val<CR>", { unpack(opts), desc = "Outer Line" })
keymap("o", "il", ":norm vil<CR>", { unpack(opts), desc = "Inner Line" })

-- Search: In Visual Selection
keymap("x", "gv", [[<Esc>/\%V]], {})

-- ESC to turn off hlsearch
keymap("n", "<ESC>", function()
    vim.cmd.nohlsearch()
    pcall(require("snacks").notifier.hide)
end, {
    desc = "Hide",
})

-- Terminal
keymap("t", "<C-q>", "<C-\\><C-n>", { desc = "Exit terminal mode" })

-- Incremental Selection
vim.keymap.set({ "x", "o" }, "v", function()
    if vim.treesitter.get_parser(nil, nil, { error = false }) then
        require("vim.treesitter._select").select_parent(vim.v.count1)
    else
        vim.lsp.buf.selection_range(vim.v.count1)
    end
end, { desc = "Select parent (outer) node" })

vim.keymap.set({ "x", "o" }, "V", function()
    if vim.treesitter.get_parser(nil, nil, { error = false }) then
        require("vim.treesitter._select").select_child(vim.v.count1)
    else
        vim.lsp.buf.selection_range(-vim.v.count1)
    end
end, { desc = "Select child (inner) node" })

-- Leader
vim.g.mapleader = " "
vim.g.localleader = "\\"

-- keymap("", "<leader><leader>", "<CMD>update<CR>", { desc = "Update" })
keymap("", "<leader>-", "<C-w>s", { desc = "Split Below" })
keymap("", "<leader>\\", "<C-w>v", { desc = "Split Right" })

-- keymap("n", "<leader>/", "gcc", { desc = "Comment", remap = true })
-- keymap("v", "<leader>/", "gc", { desc = "Comment", remap = true })

-- Quickfix
local function qf_navigate(direction)
    local qf_list = vim.fn.getqflist()
    if #qf_list == 0 then
        return
    end
    local current = vim.fn.getqflist({ idx = 0 }).idx

    local commands = {
        next = current == #qf_list and "cfirst" or "cnext",
        prev = current == 1 and "clast" or "cprev",
    }
    vim.cmd(commands[direction])
end

keymap("", "<leader>qn", function()
    qf_navigate("next")
end, { unpack(opts), desc = "QF Next" })
keymap("", "<leader>qp", function()
    qf_navigate("prev")
end, { unpack(opts), desc = "QF Prev" })

keymap("", "<leader>qa", function()
    vim.fn.setqflist({}, "a", {
        items = {
            {
                bufnr = vim.api.nvim_get_current_buf(),
                lnum = vim.api.nvim_win_get_cursor(0)[1],
                text = vim.api.nvim_get_current_line(),
            },
        },
    })
end, { unpack(opts), desc = "QF Add" })


-- Register
keymap({ "n", "v" }, "<leader>ry", [["+y]], { desc = "Yank+" })
keymap("n", "<leader>rY", [["+Y]], { desc = "Yank+ EOL", remap = true })
keymap({ "n", "v" }, "<leader>rp", [["+p]], { desc = "Put+" })
keymap({ "n", "v" }, "<leader>rP", [["+P]], { desc = "Put+ Before" })
keymap({ "n", "v" }, "<leader>rd", [["_d]], { desc = "Delete_" })
keymap({ "n", "v" }, "<leader>rx", [["+d]], { desc = "Delete+" })

keymap("n", "<leader>rg", [["+gp]], { desc = "gput+" })
keymap("n", "<leader>rG", [["+gP]], { desc = "gPut+" })

keymap("n", "<leader>rf", "<CMD>%y+<CR>", { desc = "Yank File" })
keymap("n", "<leader>rF", 'ggVG"+p', { desc = "Put File" })

-- Copy @-prefixed paths (for AI / sharing)
keymap("n", "<leader>ap", function()
    local paths = {}
    for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
        if vim.bo[bufnr].buflisted and vim.api.nvim_buf_is_loaded(bufnr) then
            local name = vim.api.nvim_buf_get_name(bufnr)
            if name ~= "" then
                local rel = vim.fn.fnamemodify(name, ":.")
                table.insert(paths, "@" .. rel)
            end
        end
    end
    local result = table.concat(paths, "\n")
    vim.fn.setreg("+", result)
    vim.notify("Copied: " .. #paths .. " buffer path(s)")
end, { desc = "@all" })

keymap("n", "<leader>ab", function()
    local path = vim.fn.expand("%:.")
    vim.fn.setreg("+", "@" .. path)
    vim.notify("Copied: @" .. path)
end, { desc = "@buffer" })

keymap("x", "<leader>av", function()
    local path = vim.fn.expand("%:.")
    local start_line = vim.fn.line("'<")
    local end_line = vim.fn.line("'>")
    local result = "@" .. path .. "#L" .. start_line .. "-" .. end_line
    vim.fn.setreg("+", result)
    vim.notify("Copied: " .. result)
end, { desc = "@buffer#L1:2" })

-- Code ops
keymap("n", "<leader>cr", function()
    vim.lsp.buf.rename()
end, { desc = "Rename" })

-- Diagnostics
keymap("n", "<leader>xx", function()
    vim.diagnostic.setqflist()
end, { desc = "Diagnostics QF" })
keymap("n", "<leader>xX", function()
    vim.diagnostic.setqflist({ bufnr = 0 })
end, { desc = "Buffer Diagnostics QF" })
keymap("n", "<leader>xl", function()
    vim.diagnostic.setloclist()
end, { desc = "Diagnostics Loclist" })

-- Insert helpers
keymap("", "<leader>ic", ":!<Up><CR>", { desc = "Last Command" })
keymap("", "<leader>ie", ":!chmod +x %<CR>", { desc = "Executable" })

-- Tools
keymap("n", "<leader>tu", function()
    if not vim.g.loaded_undotree_plugin then
        vim.cmd.packadd("nvim.undotree")
    end
    require("undotree").open()
end, { desc = "Undotree" })
