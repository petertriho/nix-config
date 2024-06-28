return {
    "sindrets/winshift.nvim",
    cmd = "WinShift",
    init = function()
        local keymap = vim.keymap.set
        local opts = { noremap = true, silent = true }

        keymap("n", "<C-w><CR>", "<CMD>WinShift swap<CR>", opts)
        keymap("n", "<C-w>m", "<CMD>WinShift swap<CR>", opts)
        keymap("n", "<C-w><C-e>", "<CMD>WinShift<CR>", opts)
        keymap("n", "<C-w>e", "<CMD>WinShift<CR>", opts)
        keymap("n", "<C-M-j>", "<CMD>WinShift down<CR>", opts)
        keymap("n", "<C-M-k>", "<CMD>WinShift up<CR>", opts)
        keymap("n", "<C-M-h>", "<CMD>WinShift left<CR>", opts)
        keymap("n", "<C-M-l>", "<CMD>WinShift right<CR>", opts)
    end,
    config = function()
        require("winshift").setup({
            window_picker = function()
                return require("winshift.lib").pick_window({
                    filter_rules = {
                        cur_win = true,
                        floats = true,
                        filetype = require("filetypes").excludes,
                    },
                })
            end,
        })
    end,
}
