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

        local open = tmux_oil.open
        tmux_oil.open = function(open_opts)
            -- The popup nvim shows only this buffer, so the tabline is a wasted
            -- row. tmux-oil-popup sizes the popup without it.
            if open_opts and open_opts.popup then
                vim.o.showtabline = 0
            end
            local ret = open(open_opts)
            -- open() turns line numbers off. Set them with local scope, as the
            -- plugin does, so they do not leak to the next buffer in the window.
            vim.wo[0][0].number = true
            vim.wo[0][0].relativenumber = true
            return ret
        end
    end,
}
