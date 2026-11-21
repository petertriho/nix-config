return {
    "petertriho/nvim-scrollbar",
    -- dir = "~/Projects/nvim-scrollbar",
    event = "User LazyLoadFileDeferred",
    keys = {
        {
            "<leader>m",
            function()
                require("scrollbar").jump()
            end,
            desc = "Scrollbar Jump",
        },
        {
            "<leader>M",
            function()
                require("scrollbar").glance()
            end,
            desc = "Scrollbar Glance",
        },
    },
    init = function()
        vim.o.signcolumn = "no"
    end,
    config = function()
        local recipes = require("scrollbar.recipes")
        local when = recipes.when

        require("scrollbar").setup({
            exclude = {
                filetypes = require("peter.core.filetypes").excludes,
            },
            providers = {
                mini_diff = true,
                -- cursor = { minimap = false },
            },
            scrollbar = {
                -- The labels go beside the west scrollbar, so they do not cover the marks.
                jump = { offset = 1 },
                hover = { delay_ms = 100 },
                placement = { anchor = "NW", gutter = "outer" },
                layout = {
                    direction = "auto",
                    columns = {
                        { "track", "thumb", "marks" },
                    },
                },
                marks = {
                    Cursor = { highlight_from = "covered" },
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
                        match = { when = when.searching() },
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
            peek = {
                window = { border = "rounded" },
            },
            glance = {
                -- The glance window for up to 50 entries, the snacks picker for more.
                picker = recipes.glance.threshold({ max = 50, picker = "snacks" }),
                entries = "type",
                builtin = {
                    frame = recipes.frame.center({ height = 36 }),
                    keys = {
                        list = {
                            jump = { "<CR>", "o" },
                            jump_split = "<leader>-",
                            jump_vsplit = "<leader>\\",
                            next = { "<C-j>", "<Tab>" },
                            previous = { "<C-k>", "<S-Tab>" },
                            -- <C-l> is also here: the global <C-w>l map would move focus
                            -- to the source window and close the glance window.
                            focus_preview = { "<C-h>", "<C-l>" },
                            quickfix = "Q",
                            close = { "q", "<Esc>", "<C-q>" },
                        },
                        preview = {
                            jump_split = "<leader>-",
                            jump_vsplit = "<leader>\\",
                            next = { "<C-j>", "<Tab>" },
                            previous = { "<C-k>", "<S-Tab>" },
                            -- <C-h> is also here: the global <C-w>h map would move focus
                            -- to the source window and close the glance window.
                            focus_list = { "<C-l>", "<C-h>" },
                            close = { "Q", "<C-q>" },
                        },
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
