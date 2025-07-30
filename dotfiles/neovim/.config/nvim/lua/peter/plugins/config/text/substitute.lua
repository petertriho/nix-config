return {
    "gbprod/substitute.nvim",
    keys = {
        { "\\s", "<CMD>lua require('substitute').operator()<CR>", desc = "substitute" },
        { "\\ss", "<CMD>lua require('substitute').line()<CR>", desc = "Line" },
        { "\\S", "<CMD>lua require('substitute').eol()<CR>", desc = "Substitute Eol" },
        { "\\s", "<CMD>lua require('substitute').visual()<CR>", mode = "x", desc = "Substitute" },
        { "\\r", "<CMD>lua require('substitute.range').operator()<CR>", desc = "Substitute [R]" },
        { "\\r", "<CMD>lua require('substitute.range').visual()<CR>", mode = "x", desc = "Substitute [R]" },
        { "\\rs", "<CMD>lua require('substitute.range').word()<CR>", desc = "Word [R]" },
        { "\\R", "<CMD>lua require('substitute.range').operator({ prefix = 'S' })<CR>", desc = "Subvert [R]" },
        {
            "\\R",
            "<CMD>lua require('substitute.range').visual({ prefix = 'S' })<CR>",
            mode = "x",
            desc = "Subvert [R]",
        },
        { "\\RS", "<CMD>lua require('substitute.range').word({ prefix = 'S' })<CR>", desc = "Word" },
        { "cx", "<CMD>lua require('substitute.exchange').operator()<CR>", desc = "Exchange" },
        { "cxx", "<CMD>lua require('substitute.exchange').line()<CR>", desc = "Line" },
        { "X", "<CMD>lua require('substitute.exchange').visual()<CR>", mode = "x", desc = "Exchange" },
        { "cxc", "<CMD>lua require('substitute.exchange').cancel()<CR>", desc = "Cancel" },
    },
    config = function()
        require("substitute").setup({
            on_substitute = require("yanky.integration").substitute(),
        })
    end,
}
