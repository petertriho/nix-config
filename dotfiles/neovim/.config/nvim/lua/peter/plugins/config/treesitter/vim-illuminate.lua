return {
    "RRethy/vim-illuminate",
    event = "User LazyLoadFile",
    config = function()
        require("illuminate").configure({
            providers = {
                "lsp",
                "treesitter",
                "regex",
            },
            delay = 100,
            filetypes_denylist = require("peter.core.filetypes").excludes,
            filetypes_allowlist = {},
            modes_denylist = {},
            modes_allowlist = {},
            providers_regex_syntax_denylist = {},
            providers_regex_syntax_allowlist = {},
            under_cursor = true,
        })
    end,
}
