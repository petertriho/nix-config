return {
    "tpope/vim-unimpaired",
    event = "VeryLazy",
    init = function()
        vim.g.nremap = {
            ["=p"] = "",
            ["=P"] = "",
            ["=s"] = "",
            ["[p"] = "",
            ["[P"] = "",
            ["[x"] = "",
            ["[y"] = "",
            ["]p"] = "",
            ["]P"] = "",
            ["]x"] = "",
            ["]y"] = "",
        }
    end,
    config = function()
        vim.cmd([[
            exe UnimpairedMapTransform('xml_encode','[X')
            exe UnimpairedMapTransform('xml_decode',']X')
            exe UnimpairedMapTransform('string_encode','[Y')
            exe UnimpairedMapTransform('string_decode',']Y')
        ]])
    end,
}
