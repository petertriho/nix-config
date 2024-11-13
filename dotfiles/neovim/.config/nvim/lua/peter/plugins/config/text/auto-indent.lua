return {
    "vidocqh/auto-indent.nvim",
    enabled = false,
    opts = {
        indentexpr = function(lnum)
            return require("nvim-yati.indent").indentexpr(lnum)
        end,
    },
}
