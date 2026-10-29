return {
    "minhyeoky/tmux-oil.nvim",
    cmd = "TmuxOil",
    keys = {
        { "<leader>tt", "<CMD>TmuxOil<CR>", desc = "Tmux Oil" },
    },
    opts = {
        follow_cursor = true,
    },
    config = function(_, opts)
        local tmux_oil = require("tmux-oil")
        tmux_oil.setup(opts)

        -- The popup nvim shows only this buffer, so the tabline is a wasted
        -- row. tmux-oil-popup sizes the popup without it.
        local open = tmux_oil.open
        tmux_oil.open = function(open_opts)
            if open_opts and open_opts.popup then
                vim.o.showtabline = 0
            end
            return open(open_opts)
        end
    end,
}
