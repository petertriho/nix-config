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

local function exec_lazy_load_file(event)
    -- https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/util/plugin.lua#L72
    vim.api.nvim_exec_autocmds("User", { pattern = "LazyLoadFile" })

    -- Skip if we already entered vim
    if vim.v.vim_did_enter == 1 then
        return
    end

    local ft = vim.filetype.match({ buf = event.buf })
    if ft then
        local lang = vim.treesitter.language.get_lang(ft)
        if not (lang and pcall(vim.treesitter.start, event.buf, lang)) then
            vim.bo[event.buf].syntax = ft
        end

        vim.cmd([[redraw]])
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
        --             vim.highlight.on_yank({ higroup = "Search", timeout = 200 })
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
                callback = function()
                    local dir = vim.fn.expand("<afile>:p:h")

                    if vim.fn.isdirectory(dir) == 1 then
                        vim.fn.mkdir(dir, "p")
                    end
                end,
                desc = "Make directory for file if it does not exist",
            },
        },
        {
            { "BufReadPost", "BufNewFile", "BufWritePre" },
            {
                pattern = "*",
                callback = exec_lazy_load_file,
                desc = "Lazy load file",
            },
        },
        {
            "User",
            {
                pattern = "PythonHostProg",
                callback = set_python3_host_prog,
                desc = "Load python host prog when required",
            },
        },
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
