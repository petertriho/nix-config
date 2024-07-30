return {
    "JoosepAlviste/nvim-ts-context-commentstring",
    event = "User LoadedNvimTreesitter",
    config = function()
        vim.g.skip_ts_context_commentstring_module = true

        require("ts_context_commentstring").setup({
            enable_autocmd = false,
            languages = {
                json = { __default = "// %s", __multiline = "/* %s */" },
            },
        })

        local get_option = vim.filetype.get_option
        vim.filetype.get_option = function(filetype, option)
            return option == "commentstring" and require("ts_context_commentstring.internal").calculate_commentstring()
                or get_option(filetype, option)
        end
    end,
}
