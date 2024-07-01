return {
    "00dani/vim-polyglot",
    branch = "feature/fix-build",
    event = "VeryLazy",
    init = function()
        local filetypes = require("peter.plugins.filetypes")
        vim.g.polyglot_disabled = {
            "autoindent",
            "ftdetect",
            "sensible",
            unpack(filetypes.treesitter),
            unpack(filetypes.extras),
        }
    end,
}
