-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
    local lazyrepo = "https://github.com/folke/lazy.nvim.git"
    vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
end
vim.opt.rtp:prepend(lazypath)

-- Setup lazy.nvim
require("lazy").setup({
    spec = {
        { import = "peter.plugins.config.ui" },
        { import = "peter.plugins.config.lsp" },
        { import = "peter.plugins.config.completion" },
        { import = "peter.plugins.config.syntax" },
        { import = "peter.plugins.config.treesitter" },
        { import = "peter.plugins.config.text" },
        { import = "peter.plugins.config.tools" },
        { import = "peter.plugins.config.misc" },
    },
    change_detection = {
        enabled = true,
        notify = false,
    },
    rocks = {
        enabled = false,
    },
})

-- TODO: investigate why this needs to need to be here to fix the issue with
-- empty buffer being modified on startup for slower machines
vim.cmd("colorscheme tokyonight")
