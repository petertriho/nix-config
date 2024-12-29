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

            vim.cmd([[redraw]])
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
        {
            "BufWritePre",
            {
                pattern = "*",
                callback = function(event)
                    local dir = vim.fn.expand("<afile>:p:h")

                    local ok, filetype_excludes = pcall(function()
                        return vim.api.nvim_get_var("filetype_excludes")
                    end)

                    if not ok then
                        filetype_excludes = {}
                        for _, filetype in ipairs(require("peter.core.filetypes").excludes) do
                            filetype_excludes[filetype] = true
                        end
                        vim.api.nvim_set_var("filetype_excludes", filetype_excludes)
                    end

                    if filetype_excludes[vim.bo[event.buf].filetype] then
                        return
                    end

                    if vim.fn.isdirectory(dir) == 0 then
                        vim.fn.mkdir(dir, "p")
                    end
                end,
                desc = "Make directory for file if it does not exist",
            },
        },
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
        -- {
        --     "User",
        --     {
        --         pattern = "PythonHostProg",
        --         callback = set_python3_host_prog,
        --         desc = "Load python host prog when required",
        --     },
        -- },
    },
    _targets = {
        {
            "User",
            {
                pattern = "targets#mappings#user",
                command = "call targets#mappings#extend({'a': {'argument': [{'o': '[{([]', 'c': '[])}]', 's': ','}]}})",
                desc = "Additional ia/aa text objects",
            },
        },
    },
})
