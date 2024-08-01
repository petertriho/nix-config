local keymap = vim.keymap.set
local opts = { noremap = true, silent = true }

-- Tabs: Navigation
keymap("", "<C-M-n>", ":tabnext<CR>", {})
keymap("", "<C-M-p>", ":tabprevious<CR>", {})

-- Windows: Navigation
keymap("", "<C-j>", "<C-w>j", {})
keymap("", "<C-k>", "<C-w>k", {})
keymap("", "<C-h>", "<C-w>h", {})
keymap("", "<C-l>", "<C-w>l", {})
keymap("", "<C-\\>", "<C-w>p", {})

-- Windows: Resize
keymap("n", "<M-j>", ":resize +2<CR>", opts)
keymap("n", "<M-k>", ":resize -2<CR>", opts)
keymap("n", "<M-h>", ":vertical resize -2<CR>", opts)
keymap("n", "<M-l>", ":vertical resize +2<CR>", opts)
keymap("", "<M-=>", "<C-w>=", {})

-- Move lines
keymap("n", "<M-d>", ":m .+1<CR>==", opts)
keymap("n", "<M-u>", ":m .-2<CR>==", opts)
keymap("v", "<M-d>", ":m '>+1<CR>gv=gv", opts)
keymap("v", "<M-u>", ":m '<-2<CR>gv=gv", opts)

-- Line Text Objects
keymap("v", "al", ":<C-u>norm!0v$h<CR>", opts)
keymap("v", "il", ":<C-u>norm!^vg_<CR>", opts)
keymap("o", "al", ":norm val<CR>", opts)
keymap("o", "il", ":norm vil<CR>", opts)

-- Search: In Visual Selection
keymap("x", "gv", [[<Esc>/\%V]], {})

-- Leader
vim.g.mapleader = " "
vim.g.localleader = " "

keymap("n", "<leader><leader>", ":w<CR>", { desc = "Write" })
keymap("n", "<leader>-", "<C-w>s", { desc = "Split Below" })
keymap("n", "<leader>\\", "<C-w>v", { desc = "Split Right" })
keymap("n", "<ESC>", "<CMD>nohlsearch<CR>", { desc = "nohl" })

keymap("n", "<leader>/", "gcc", { desc = "Comment", remap = true })
keymap("v", "<leader>/", "gc", { desc = "Comment", remap = true })

keymap("n", "<leader>ae", ":!chmod +x %<CR>", { desc = "Executable" })
keymap("n", "<Leader>ap", 'ggVG"+p', { desc = "Paste File" })
keymap("n", "<Leader>ay", "<CMD>%y+<CR>", { desc = "Yank File" })

-- Better Delete/Paste/Yank
keymap({ "n", "v" }, "\\d", [["_d]], { desc = "Delete" })
keymap("x", "\\p", [["_dP]], { desc = "Paste" })
keymap({ "n", "v" }, "\\y", [["+y"]], { desc = "Yank System Clipboard" })
keymap("n", "\\Y", [["+y"]], { desc = "Yank Eol System Clipboard" })
