return {
    "sindrets/winshift.nvim",
    cmd = "WinShift",
    keys = {
        { "<C-w><CR>", "<CMD>WinShift swap<CR>", desc = "Swap" },
        { "<C-w>m", "<CMD>WinShift swap<CR>", desc = "Swap" },
        { "<C-w><C-e>", "<CMD>WinShift<CR>", desc = "WinShift" },
        { "<C-w>e", "<CMD>WinShift<CR>", desc = "WinShift" },
        { "<C-M-j>", "<CMD>WinShift down<CR>", desc = "Down" },
        { "<C-M-k>", "<CMD>WinShift up<CR>", desc = "Up" },
        { "<C-M-h>", "<CMD>WinShift left<CR>", desc = "Left" },
        { "<C-M-l>", "<CMD>WinShift right<CR>", desc = "Right" },
    },
    config = function()
        require("winshift").setup({
            window_picker = function()
                return require("winshift.lib").pick_window({
                    filter_rules = {
                        cur_win = true,
                        floats = true,
                        filetype = require("peter.plugins.filetypes").excludes,
                    },
                })
            end,
        })
    end,
}
