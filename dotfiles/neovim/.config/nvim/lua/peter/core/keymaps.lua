local keymap = vim.keymap.set
local opts = { noremap = true, silent = true }

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
keymap("v", "al", ":<C-u>norm!0v$h<CR>", opts)
keymap("v", "il", ":<C-u>norm!^vg_<CR>", opts)
keymap("o", "al", ":norm val<CR>", opts)
keymap("o", "il", ":norm vil<CR>", opts)

-- Search: In Visual Selection
keymap("x", "gv", [[<Esc>/\%V]], {})

-- ESC to turn off hlsearch
keymap("n", "<ESC>", "<CMD>nohlsearch<CR>", { desc = "nohl" })

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
keymap({ "n", "v" }, "<leader>y", [["+y]], { desc = "Yank+" })
keymap("n", "<leader>Y", [["+Y]], { desc = "Yank+ EOL", remap = true })

keymap("", "<leader>ac", ":!<Up><CR>", { desc = "Last Command" })
keymap("", "<leader>ae", ":!chmod +x %<CR>", { desc = "Executable" })
keymap("n", "<leader>ap", 'ggVG"+p', { desc = "Put File" })
keymap("n", "<leader>ay", "<CMD>%y+<CR>", { desc = "Yank File" })
keymap("x", "<leader>ap", [["_dP]], { desc = "Put_" })
