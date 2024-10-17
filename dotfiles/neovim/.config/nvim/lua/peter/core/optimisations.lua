vim.loader.enable()

local g = vim.g

-- Disable built in plugins
local disabled_built_ins = {
    "2html_plugin",
    "bugreport",
    "compiler",
    "getscript",
    "getscriptPlugin",
    "gzip",
    "logipat",
    "matchit",
    "netrw",
    "netrwFileHandlers",
    "netrwPlugin",
    "netrwSettings",
    "optwin",
    "rplugin",
    "rrhelper",
    "spellfile_plugin",
    "synmenu",
    "tar",
    "tarPlugin",
    "tutor",
    "vimball",
    "vimballPlugin",
    "zip",
    "zipPlugin",
}
for _, plugin in pairs(disabled_built_ins) do
    g["loaded_" .. plugin] = 1
end

-- Disable providers
local disabled_providers = {
    "node",
    "perl",
    "python3",
    "ruby",
}
for _, provider in pairs(disabled_providers) do
    g["loaded_" .. provider .. "_provider"] = 0
end
