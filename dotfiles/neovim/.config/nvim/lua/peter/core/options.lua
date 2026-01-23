-- filetypes.lua
vim.filetype.add({
    extension = {
        j2 = "jinja",
        sh = "sh",
    },
    filename = {
        [".prettierrc"] = "jsonc",
        ["atlas.hcl"] = "atlas-config",
        ["todo.txt"] = "todotxt",
        ["yarn.lock"] = "txt",
    },
    pattern = {
        [".*%.env.*"] = "conf",
        [".*/*.ch.hcl"] = "atlas-schema-clickhouse",
        [".*/*.lt.hcl"] = "atlas-schema-sqlite",
        [".*/*.ms.hcl"] = "atlas-schema-mssql",
        [".*/*.my.hcl"] = "atlas-schema-mysql",
        [".*/*.pg.hcl"] = "atlas-schema-postgresql",
        [".*/*.plan.hcl"] = "atlas-plan",
        [".*/*.rs.hcl"] = "atlas-schema-redshift",
        [".*/*.rule.hcl"] = "atlas-rule",
        [".*/*.test.hcl"] = "atlas-test",
    },
})
vim.treesitter.language.register("hcl", "atlas-config")
vim.treesitter.language.register("hcl", "atlas-schema-mysql")
vim.treesitter.language.register("hcl", "atlas-schema-postgresql")
vim.treesitter.language.register("hcl", "atlas-schema-sqlite")
vim.treesitter.language.register("hcl", "atlas-schema-clickhouse")
vim.treesitter.language.register("hcl", "atlas-schema-mssql")
vim.treesitter.language.register("hcl", "atlas-schema-redshift")
vim.treesitter.language.register("hcl", "atlas-test")
vim.treesitter.language.register("hcl", "atlas-plan")
vim.treesitter.language.register("hcl", "atlas-rule")

-- Globals
vim.g.copilot_model = vim.env.COPILOT_MODEL
vim.g.has_deno = vim.fn.executable("deno") == 1

-- Options
local opt = vim.opt
-- opt.cmdheight = 0
opt.colorcolumn = "80"
opt.cursorline = true
-- opt.diffopt:append("algorithm:histogram,hiddenoff,linematch:60")
opt.diffopt:append("algorithm:histogram,hiddenoff")
opt.expandtab = true
opt.fillchars = {
    diff = "╱",
    eob = " ",
    fold = " ",
    msgsep = "‾",
    vert = "│",
}
-- opt.foldenable = false
opt.ignorecase = true
-- opt.lazyredraw = true
opt.list = false
opt.listchars = {
    eol = "¬",
    extends = "›",
    nbsp = "¤",
    precedes = "‹",
    space = "·",
    tab = "» ",
    trail = "·",
}
opt.mouse = "a"
opt.number = true
opt.path:append("**")
opt.pumheight = 10
-- opt.relativenumber = true
opt.scrolloff = 5
-- opt.shada = "!,'0,f0,<50,s10,h"
opt.shell = "bash"
opt.shiftwidth = 4
opt.shortmess:append("c")
opt.showmode = false
opt.signcolumn = "yes"
opt.smartcase = true
opt.smartindent = true
opt.softtabstop = 4
opt.splitbelow = true
opt.splitright = true
opt.swapfile = false
opt.tabstop = 4
opt.termguicolors = true
opt.timeoutlen = 300
opt.title = true
opt.titlestring = "nvim %t %M"
-- opt.ttimeout = false
-- opt.ttimeoutlen = 0
opt.updatetime = 100
opt.wrap = false
local function build_wildignore()
    local patterns = {
        "*.o",
        "*.pyc",
        ".conform.*",
        ".dmypy.json",
        ".watchman-cookie-*",
    }

    local folders = {
        ".devenv", -- Devenv
        ".git", -- Version control
        ".mypy_cache", -- MyPy cache
        ".pytest_cache", -- Pytest cache
        ".venv", -- Python virtual environments
        ".yarn", -- Yarn cache
        "__pycache__", -- Python cache
        "cache", -- General cache
        "node_modules", -- Node.js dependencies
        "tmp", -- Temporary files
    }

    -- Generate folder patterns
    for _, folder in ipairs(folders) do
        table.insert(patterns, "**/" .. folder)
        table.insert(patterns, "**/" .. folder .. "/**")
    end

    local regex_patterns = {}
    for _, folder in ipairs(folders) do
        table.insert(regex_patterns, "^" .. folder .. "$")
    end
    vim.g.wildignore_regex = regex_patterns

    return patterns
end

opt.wildignore = build_wildignore()

-- Clipboard
if vim.fn.has("wsl") == 1 then
    local copy = "clip.exe"
    local paste = 'powershell.exe -NoLogo -c [Console]::Out.Write($(Get-Clipboard -Raw).tostring().replace("`r", ""))'

    if vim.fn.executable("win32yank.exe") == 1 then
        copy = "win32yank.exe -i --crlf"
        paste = "win32yank.exe -o --lf"
    end

    vim.g.clipboard = {
        name = "wsl-clipboard",
        copy = {
            ["+"] = copy,
            ["*"] = copy,
        },
        paste = {
            ["+"] = paste,
            ["*"] = paste,
        },
        cache_enabled = 0,
    }
end

-- Vimgrep
if vim.fn.executable("rg") == 1 then
    opt.grepprg = "rg --vimgrep --color=never --no-heading --smart-case --hidden"
    opt.grepformat = "%f:%l:%c:%m,%f:%l:%m"
end

-- Undo
local undodir = vim.fn.expand("~/.undodir")

if vim.fn.isdirectory(undodir) ~= 1 then
    vim.fn.mkdir(undodir, "p", "0700")
end

opt.undodir = undodir
opt.undofile = true
