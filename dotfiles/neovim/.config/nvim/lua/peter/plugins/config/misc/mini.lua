return {
    "echasnovski/mini.nvim",
    event = { "User LazyLoadFile", "VeryLazy" },
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
    config = function()
        require("mini.ai").setup({
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
        })
        require("mini.files").setup()
        require("mini.icons").setup()
        require("mini.splitjoin").setup()
    end,
}
