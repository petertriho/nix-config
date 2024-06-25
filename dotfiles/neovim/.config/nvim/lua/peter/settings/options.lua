local g = vim.g

-- filetypes.lua
g.did_load_filetypes = 0
g.do_filetype_lua = 1
vim.filetype.add({
    extension = {
        prisma = "prisma",
        sh = "sh",
    },
    filename = {
        [".prettierrc"] = "jsonc",
        ["todo.txt"] = "todotxt",
        ["yarn.lock"] = "txt",
    },
    pattern = {
        [".*%.env.*"] = "conf",
    },
})

-- Options
local o = vim.o
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
opt.ignorecase = true
opt.lazyredraw = true
opt.list = true
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
opt.ttimeout = false
opt.ttimeoutlen = 0
opt.updatetime = 100
opt.wrap = false
opt.wildignore = {
    "*.o",
    "*.pyc",
    "*/.git/*",
    "*/.venv/*",
    "*/__pycache__/*",
    "*/cache/*",
    "*/node_modules/*",
    "*/tmp/*",
}

-- Clipboard
opt.clipboard = "unnamedplus"
if vim.fn.executable("win32yank.exe") == 1 then
    vim.g.clipboard = {
        name = "win32yank",
        copy = {
            ["+"] = "win32yank.exe -i --crlf",
            ["*"] = "win32yank.exe -i --crlf",
        },
        paste = {
            ["+"] = "win32yank.exe -o --lf",
            ["*"] = "win32yank.exe -o --lf",
        },
        ["cache_enabled"] = 0,
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
