return {
    "petertriho/nvim-scrollbar",
    -- dir = "~/Projects/nvim-scrollbar",
    event = "User LazyLoadFileDeferred",
    init = function()
        vim.o.signcolumn = "no"
    end,
    config = function()
        -- Same visibility rule as the search provider, plus an open `/` or `?`
        -- command line so that incremental previews also count.
        local function searching()
            local cmdtype = vim.fn.getcmdtype()
            if cmdtype == "/" or cmdtype == "?" then
                return true
            end
            return vim.o.hlsearch and vim.v.hlsearch == 1 and vim.fn.getreg("/") ~= ""
        end

        require("scrollbar").setup({
            exclude = {
                filetypes = require("peter.core.filetypes").excludes,
            },
            providers = {
                mini_diff = true,
                -- cursor = { minimap = false },
            },
            scrollbar = {
                placement = { anchor = "NW", gutter = "outer" },
                layout = {
                    direction = "auto",
                    columns = {
                        { "track", "thumb", "marks" },
                    },
                },
                marks = {
                    GitAdd = { text = "│" },
                    GitChange = { text = "│" },
                    GitDelete = { text = "│" },
                    MiniDiffAdd = { text = "│" },
                    MiniDiffChange = { text = "│" },
                    MiniDiffDelete = { text = "│" },
                },
                floats = {
                    snacks = { preview = true },
                },
                profiles = {
                    {
                        match = { when = searching },
                        layout = {
                            columns = {
                                { "track", "thumb", { types = { "Search" } } },
                            },
                        },
                    },
                    {
                        match = { floats = true },
                        placement = { anchor = "NE" },
                    },
                },
            },
            minimap = {
                enabled = false,
                width = 5,
                blend = 50,
            },
        })
    end,
}
