local keymap = vim.keymap.set
local opts = { noremap = true, silent = true }

-- Buffers: Navigation
keymap("", "<C-n>", "<CMD>bnext<CR>", {})
keymap("", "<C-p>", "<CMD>bprev<CR>", {})

-- Windows: Navigation
keymap("", "<C-j>", "<C-w>j", {})
keymap("", "<C-k>", "<C-w>k", {})
keymap("", "<C-h>", "<C-w>h", {})
keymap("", "<C-l>", "<C-w>l", {})
keymap("", "<C-\\>", "<C-w>p", {})

-- Exchange lines
keymap("n", "]e", ":m .+1<CR>==", { unpack(opts), desc = "Exchange Below" })
keymap("n", "[e", ":m .-2<CR>==", { unpack(opts), desc = "Exchange Above" })
keymap("v", "]e", ":m '>+1<CR>gv=gv", { unpack(opts), desc = "Exchange Below" })
keymap("v", "[e", ":m '<-2<CR>gv=gv", { unpack(opts), desc = "Exchange Above" })

-- Line Text Objects
keymap("v", "al", ":<C-u>norm!0v$h<CR>", { unpack(opts), desc = "Outer Line" })
keymap("v", "il", ":<C-u>norm!^vg_<CR>", { unpack(opts), desc = "Inner Line" })
keymap("o", "al", ":norm val<CR>", { unpack(opts), desc = "Outer Line" })
keymap("o", "il", ":norm vil<CR>", { unpack(opts), desc = "Inner Line" })

-- Search: In Visual Selection
keymap("x", "gv", [[<Esc>/\%V]], {})

-- ESC to turn off hlsearch
-- keymap("n", "<ESC>", "<CMD>nohlsearch<CR>", { desc = "nohl" })
keymap("n", "<ESC>", function()
    vim.cmd.nohlsearch()
    pcall(require("sidekick").clear)
    pcall(require("snacks").notifier.hide)
end, {
    desc = "Hide",
})

-- Quickfix
keymap("", "qn", "<CMD>cnext<CR>", { unpack(opts), desc = "QF Next" })
keymap("", "qp", "<CMD>cprev<CR>", { unpack(opts), desc = "QF Prev" })
keymap("", "Q", function()
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

-- Terminal
keymap("t", "<Esc><Esc>", "<C-\\><C-n>", { desc = "Exit terminal mode" })

-- H, M, L remap
keymap("", "H", "^", { desc = "Beginning of Line", remap = true })
keymap({ "n", "x", "o" }, "M", "%", { desc = "Match Pair", remap = true })
keymap("", "L", "$", { desc = "End of Line", remap = true })

-- Leader
vim.g.mapleader = " "
vim.g.localleader = "\\"

keymap("", "<leader><leader>", "<CMD>update<CR>", { desc = "Update" })
keymap("", "<leader>-", "<C-w>s", { desc = "Split Below" })
keymap("", "<leader>\\", "<C-w>v", { desc = "Split Right" })

keymap("n", "<leader>/", "gcc", { desc = "Comment", remap = true })
keymap("v", "<leader>/", "gc", { desc = "Comment", remap = true })

keymap("n", "<leader>gp", [["+gp]], { desc = "gput+" })
keymap("n", "<leader>gP", [["+gP]], { desc = "gPut+" })
keymap({ "n", "v" }, "<leader>p", [["+p]], { desc = "put+" })
keymap({ "n", "v" }, "<leader>P", [["+P]], { desc = "Put+" })
keymap({ "n", "v" }, "<leader>x", [["_d]], { desc = "Delete_" })
keymap({ "n", "v" }, "<leader>X", [["+d]], { desc = "Delete+" })
keymap({ "n", "v" }, "<leader>y", [["+y]], { desc = "Yank+" })
keymap("n", "<leader>Y", [["+Y]], { desc = "Yank+ EOL", remap = true })

keymap("", "<leader>mc", ":!<Up><CR>", { desc = "Last Command" })
keymap("", "<leader>me", ":!chmod +x %<CR>", { desc = "Executable" })
keymap("n", "<leader>mp", 'ggVG"+p', { desc = "Put File" })
keymap("n", "<leader>my", "<CMD>%y+<CR>", { desc = "Yank File" })
keymap("x", "<leader>mp", [["_dP]], { desc = "Put_" })
