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

keymap("n", "<leader><leader>", ":w<CR>", { desc = "write" })
keymap("n", "<leader>-", "<C-w>s", { desc = "split-below" })
keymap("n", "<leader>\\", "<C-w>v", { desc = "split-right" })
keymap("n", "<ESC>", "<CMD>nohlsearch<CR>", { desc = "no-hl" })

keymap("n", "<leader>ae", ":!chmod +x %<CR>", { desc = "executable" })
keymap("n", "<leader>ap", 'ggVG"+p', { desc = "paste-file" })
keymap("n", "<leader>ay", "<CMD>%y+<CR>", { desc = "yank-file" })

-- Better Delete/Paste/Yank
keymap({ "n", "v" }, "\\d", [["_d]], { desc = "delete" })
keymap("x", "\\p", [["_dP]], { desc = "paste" })
keymap({ "n", "v" }, "\\y", [["+y"]], { desc = "yank-system-clipboard" })
keymap("n", "\\Y", [["+y"]], { desc = "yank-eol-system-clipboard" })
