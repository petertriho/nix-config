return {
    "petertriho/vim-polyglot",
    event = "User LazyLoadFile",
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
