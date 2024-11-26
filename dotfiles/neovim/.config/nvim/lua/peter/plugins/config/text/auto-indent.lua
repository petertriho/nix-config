return {
    "vidocqh/auto-indent.nvim",
    opts = {
        indentexpr = function(lnum)
            return require("nvim-yati.indent").indentexpr(lnum)
        end,
    },
}
