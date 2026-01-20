local function python3_host_prog_job(cmd)
    vim.fn.jobstart(cmd, {
        on_stdout = function(_, data, _)
            g.python3_host_prog = string.gsub(data[1], "\n", "")
        end,
    })
end

local function set_python3_host_prog()
    if vim.fn.exists("$VIRTUAL_ENV") == 1 then
        python3_host_prog_job("which -a python3 | head -n2 | tail -n1")
    else
        python3_host_prog_job("which python3")
    end
end

local utils = require("peter.core.utils")
local filetypes = require("peter.core.filetypes")

local function exec_lazy_load_file(event)
    vim.api.nvim_exec_autocmds("User", { pattern = "LazyLoadFile" })

    -- https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/util/plugin.lua#L72
    if vim.v.vim_did_enter == 1 then
        return
    end

    if not utils.file_is_big(event.buf) then
        local ft = vim.filetype.match({ buf = event.buf })
        if ft then
            local lang = vim.treesitter.language.get_lang(ft)
            if not (lang and pcall(vim.treesitter.start, event.buf, lang)) then
                vim.bo[event.buf].syntax = ft
            end

            vim.cmd.redraw()
        end
    end
end

local function set_augroups(groups)
    for name, commands in pairs(groups) do
        vim.api.nvim_create_augroup(name, {})
        for _, command in pairs(commands) do
            command[2].group = name
            vim.api.nvim_create_autocmd(unpack(command))
        end
    end
end

set_augroups({
    _general = {
        -- {
        --     "TextYankPost",
        --     {
        --         pattern = "*",
        --         callback = function()
        --             vim.highlight.on_yank({ higroup = "IncSearch", timeout = 200 })
        --         end,
        --         desc = "Highlight on yank",
        --     },
        -- },
        {
            { "FocusLost", "InsertEnter", "WinLeave" },
            {
                callback = function()
                    if vim.o.number then
                        vim.opt.relativenumber = false
                    end
                end,
                desc = "Turn off relative number",
            },
        },
        {
            { "FocusGained", "InsertLeave", "WinEnter" },
            {
                callback = function()
                    if vim.o.number then
                        vim.opt.relativenumber = true
                    end
                end,
                desc = "Turn on relative number",
            },
        },
        -- {
        --     "BufWritePre",
        --     {
        --         pattern = "*",
        --         callback = function(event)
        --             if require("peter.core.utils").is_excludes_buf(event.buf) then
        --                 return
        --             end
        --
        --             local dir = vim.fn.expand("<afile>:p:h")
        --             if vim.fn.isdirectory(dir) == 0 then
        --                 vim.fn.mkdir(dir, "p")
        --             end
        --         end,
        --         desc = "Make directory for file if it does not exist",
        --     },
        -- },
        {
            "BufWritePre",
            {
                pattern = "*",
                callback = function()
                    local view = vim.fn.winsaveview()

                    local patterns = {
                        [[%s/\s\+$//e]],
                        [[%s/\($\n\s*\)\+\%$//]],
                    }
                    for _, pattern in ipairs(patterns) do
                        vim.cmd("keepjumps keeppatterns silent! " .. pattern)
                    end

                    vim.fn.winrestview(view)
                end,
                desc = "Trim whitespace",
            },
        },
        {
            { "BufReadPost", "BufNewFile", "BufWritePre" },
            {
                once = true,
                pattern = "*",
                callback = exec_lazy_load_file,
                desc = "Lazy load file",
            },
        },
        {
            { "BufRead" },
            {

                callback = function(event)
                    vim.api.nvim_create_autocmd("BufWinEnter", {
                        once = true,
                        buffer = event.buf,
                        callback = function()
                            if require("peter.core.utils").is_excludes_buf(event.buf) then
                                return
                            end

                            local last_known_line = vim.api.nvim_buf_get_mark(event.buf, '"')[1]
                            if last_known_line > 1 and last_known_line <= vim.api.nvim_buf_line_count(event.buf) then
                                vim.api.nvim_feedkeys([[g`"]], "nx", false)
                            end
                        end,
                    })
                end,
                desc = "Restore cursor",
            },
        },
        -- {
        --     "User",
        --     {
        --         pattern = "PythonHostProg",
        --         callback = set_python3_host_prog,
        --         desc = "Load python host prog when required",
        --     },
        -- },
    },
    _filetypes = {
        {
            "FileType",
            {
                pattern = filetypes.sidebars,
                callback = function()
                    vim.opt_local.winfixbuf = true
                end,
                desc = "Enable winfixbuf for sidebar filetypes",
            },
        },
        {
            "FileType",
            {
                pattern = "markdown",
                callback = function()
                    vim.opt_local.conceallevel = 2
                end,
                desc = "Set conceallevel for markdown",
            },
        },
        {
            "FileType",
            {
                pattern = { "html", "css", "javascript", "javascriptreact", "typescript", "typescriptreact" },
                callback = function(args)
                    if not vim.g.lsp_configured then
                        require("peter.lsp").setup()
                    end

                    local clients = vim.lsp.get_clients({ bufnr = args.buf, name = "tailwindcss" })
                    if #clients > 0 then
                        -- Already attached
                        return
                    end

                    -- Find tailwind config in parent directories
                    local bufname = vim.api.nvim_buf_get_name(args.buf)
                    local root_files = {
                        "tailwind.config.js",
                        "tailwind.config.cjs",
                        "tailwind.config.mjs",
                        "tailwind.config.ts",
                    }

                    local root_dir = vim.fs.root(bufname, root_files)
                    if not root_dir then
                        return
                    end

                    local config = vim.lsp.config["tailwindcss"]
                    if not config then
                        vim.log.warn("Tailwind CSS LSP config not found")
                        return
                    end

                    local start_config = vim.tbl_deep_extend("force", config, {
                        root_dir = root_dir,
                    })
                    vim.lsp.start(start_config, {
                        bufnr = args.buf,
                    })
                end,
                desc = "Start Tailwind CSS LSP",
            },
        },
    },
})
