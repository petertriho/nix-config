return {
    "sindrets/winshift.nvim",
    cmd = "WinShift",
    keys = {
        { "<C-w><CR>", "<CMD>WinShift swap<CR>" },
        { "<C-w>m", "<CMD>WinShift swap<CR>" },
        { "<C-w><C-e>", "<CMD>WinShift<CR>" },
        { "<C-w>e", "<CMD>WinShift<CR>" },
        { "<C-M-j>", "<CMD>WinShift down<CR>" },
        { "<C-M-k>", "<CMD>WinShift up<CR>" },
        { "<C-M-h>", "<CMD>WinShift left<CR>" },
        { "<C-M-l>", "<CMD>WinShift right<CR>" },
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
