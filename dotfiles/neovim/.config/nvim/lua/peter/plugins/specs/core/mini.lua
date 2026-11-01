return {
    {
        "nvim-mini/mini.ai",
        -- The `a` and `i` mappings run in operator-pending mode, where a key shim
        -- cannot replay the textobject.
        event = "VeryLazy",
        opts = {
            custom_textobjects = {
                -- Entire buffer
                E = function()
                    local n_lines = vim.fn.line("$")
                    return {
                        from = { line = 1, col = 1 },
                        to = { line = n_lines, col = math.max(vim.fn.getline(n_lines):len(), 1) },
                    }
                end,
                -- Git conflict markers
                g = function()
                    local patterns = { "^<<<<<<< ", "^=======$", "^>>>>>>> " }
                    local start_line, end_line = vim.fn.line("."), vim.fn.line(".")

                    -- Find conflict start
                    for line = vim.fn.line("."), 1, -1 do
                        if vim.fn.getline(line):match(patterns[1]) then
                            start_line = line
                            break
                        end
                    end

                    -- Find conflict end
                    for line = vim.fn.line("."), vim.fn.line("$") do
                        if vim.fn.getline(line):match(patterns[3]) then
                            end_line = line
                            break
                        end
                    end

                    return {
                        from = { line = start_line, col = 1 },
                        to = { line = end_line, col = vim.fn.getline(end_line):len() },
                    }
                end,
                -- HTML/XML/JSX attributes
                x = function(ai_type)
                    local line = vim.fn.getline(".")
                    local col = vim.fn.col(".")
                    local line_num = vim.fn.line(".")

                    -- Pattern to match attribute="value" or attribute={value}
                    local attr_pattern = "([%w%-_:]+)%s*=%s*(['\"`{])([^'\"}`]*)(['\"`}])"

                    local start_pos = 1
                    while true do
                        local attr_start, attr_end, attr_name, quote_start, attr_value =
                            line:find(attr_pattern, start_pos)
                        if not attr_start then
                            break
                        end

                        if col >= attr_start and col <= attr_end then
                            if ai_type == "i" then
                                -- Inside: just the attribute value (between quotes)
                                local value_start = attr_start
                                    + #attr_name
                                    + line:sub(attr_start + #attr_name):find("=")
                                    + #quote_start
                                local value_end = value_start + #attr_value - 1
                                return {
                                    from = { line = line_num, col = value_start },
                                    to = { line = line_num, col = value_end },
                                }
                            else
                                -- Around: entire attribute key="value"
                                return {
                                    from = { line = line_num, col = attr_start },
                                    to = { line = line_num, col = attr_end },
                                }
                            end
                        end

                        start_pos = attr_end + 1
                    end

                    return nil
                end,
            },
            n_lines = 100,
            mappings = {
                around_next = "aN",
                inside_next = "iN",
                around_last = "aL",
                inside_last = "iL",
            },
        },
    },
    {
        "nvim-mini/mini.diff",
        event = "User LazyLoadFileDeferred",
        opts = {
            view = {
                style = "sign",
                signs = {
                    add = "│",
                    change = "│",
                    delete = "│",
                },
            },
        },
    },
    {
        "nvim-mini/mini.files",
        dependencies = { "nvim-mini/mini.icons" },
        keys = {
            {
                "-",
                function()
                    local files = require("mini.files")
                    if not files.close() then
                        local current_file = vim.api.nvim_buf_get_name(0)
                        local parent_dir = vim.fn.fnamemodify(current_file, ":h")
                        files.open(parent_dir)
                    end
                end,
                desc = "Open parent directory",
            },
            {
                "<leader>E",
                function()
                    local files = require("mini.files")
                    if not files.close() then
                        files.open()
                    end
                end,
                desc = "Explorer",
            },
        },
        opts = {
            mappings = {
                go_in = "<CR>",
                go_out = "<BS>",
                reset = "<Space>",
            },
            options = {
                use_as_default_explorer = false,
            },
        },
    },
    {
        -- The module is `mini.git`, but the repository is `mini-git`.
        "nvim-mini/mini-git",
        main = "mini.git",
        event = "User LazyLoadFileDeferred",
        cmd = "Git",
        init = function()
            vim.cmd([[cabbrev <expr> G getcmdtype() == ':' && getcmdline() ==# 'G' ? 'Git' : 'G']])
        end,
        opts = {},
    },
    {
        "nvim-mini/mini.icons",
        -- Snacks reads the `MiniIcons` global without a require, so a module
        -- trigger does not load this plugin.
        event = "VeryLazy",
        opts = {},
    },
    {
        "nvim-mini/mini.splitjoin",
        keys = {
            { "<leader>ij", mode = { "n", "x" }, desc = "Toggle arguments" },
        },
        opts = {
            mappings = {
                toggle = "<leader>ij",
            },
        },
    },
    {
        "nvim-mini/mini.surround",
        keys = {
            { "ys", desc = "Add surrounding" },
            { "ds", desc = "Delete surrounding" },
            { "cs", desc = "Replace surrounding" },
            {
                "gs",
                ":<C-u>lua require('mini.surround').add('visual')<CR>",
                mode = "x",
                desc = "Add surrounding to selection",
                noremap = true,
            },
        },
        config = function()
            require("mini.surround").setup({
                mappings = {
                    add = "ys",
                    delete = "ds",
                    replace = "cs",
                    find = "",
                    find_left = "",
                    highlight = "",
                    update_n_lines = "",
                    -- Each mapping makes mini.surround read every global mapping
                    -- (about 0.4 ms each with the lazypack key shims).
                    suffix_last = "",
                    suffix_next = "",
                },
            })
            pcall(vim.keymap.del, "x", "ys")
        end,
    },
}
