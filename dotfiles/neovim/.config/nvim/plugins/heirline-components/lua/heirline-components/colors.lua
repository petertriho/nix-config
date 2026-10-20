local utils = require("heirline.utils")

local M = {}

-- Last resort when no group in a chain has the attribute (no colorscheme, or a
-- transparent theme without a Normal background).
local fallback = {
    dark = {
        fg = "#d0d0d0",
        bg = "#1c1c1c",
        gray = "#6c6c6c",
        red = "#ffc0b9",
        green = "#b3f6c0",
        blue = "#a6dbff",
        orange = "#ffcc99",
        purple = "#ffcaff",
        yellow = "#fce094",
        cyan = "#8cf8f7",
    },
    light = {
        fg = "#303030",
        bg = "#ffffff",
        gray = "#9e9e9e",
        red = "#590008",
        green = "#005523",
        blue = "#004c73",
        orange = "#8a4b00",
        purple = "#470045",
        yellow = "#6b5300",
        cyan = "#007373",
    },
}

-- First `attr` value found in `names`, in order.
local function pick(attr, names, default)
    for _, name in ipairs(names) do
        local value = utils.get_highlight(name)[attr]
        if value then
            return value
        end
    end
    return default
end

local function to_rgb(hex)
    return type(hex) == "string" and tonumber(hex:sub(2), 16) or nil
end

-- `MiniBase16.config` keeps the last palette after another colorscheme loads, so
-- the palette counts only while `Normal` still has its colors. mini.base16 clears
-- `g:colors_name`, and the user config sets it to "mini.base16" afterwards.
local function base16_palette()
    local mini = rawget(_G, "MiniBase16")
    local palette = mini and mini.config and mini.config.palette
    if type(palette) ~= "table" then
        return nil
    end

    local name = vim.g.colors_name
    if name ~= nil and not name:find("base16", 1, true) then
        return nil
    end

    local normal = utils.get_highlight("Normal")
    if normal.fg ~= to_rgb(palette.base05) or normal.bg ~= to_rgb(palette.base00) then
        return nil
    end
    return palette
end

function M.get()
    local default = fallback[vim.o.background] or fallback.dark
    local c = {}

    c.fg = pick("fg", { "Normal" }, default.fg)
    c.bg = pick("bg", { "Normal" }, default.bg)
    c.gray = pick("fg", { "NonText", "Comment" }, default.gray)
    c.fg_bright = pick("fg", { "Folded", "Comment" }, c.gray)
    c.bg_highlight = pick("bg", { "CursorLine", "Visual", "StatusLine" }, c.bg)

    -- mini.base16 gives `DiagnosticWarn` the purple slot and `Statement` the red
    -- slot, so the accents come from the palette slots there.
    local palette = base16_palette()
    if palette then
        c.red = palette.base08
        c.orange = palette.base09
        c.yellow = palette.base0A
        c.green = palette.base0B
        c.blue = palette.base0D
        c.purple = palette.base0E
    else
        c.red = pick("fg", { "DiagnosticError", "ErrorMsg" }, default.red)
        c.orange = pick("fg", { "Constant" }, default.orange)
        c.yellow = pick("fg", { "DiagnosticWarn" }, pick("bg", { "Todo" }, default.yellow))
        c.green = pick("fg", { "String", "DiagnosticOk" }, default.green)
        c.blue = pick("fg", { "Function", "DiagnosticInfo" }, default.blue)
        c.purple = pick("fg", { "Statement", "Keyword" }, default.purple)
    end

    c.diag_error = pick("fg", { "DiagnosticError" }, c.red)
    c.diag_warn = pick("fg", { "DiagnosticWarn" }, c.yellow)
    c.diag_info = pick("fg", { "DiagnosticInfo" }, c.blue)
    c.diag_hint = pick("fg", { "DiagnosticHint" }, default.cyan)

    -- `:colorscheme` restores Neovim's default `Added`/`Changed`/`Removed`, so a
    -- theme that defines only the `diff*` groups must win over them.
    c.git_add = pick("fg", { "diffAdded", "MiniDiffSignAdd", "Added" }, c.green)
    c.git_change = pick("fg", { "diffChanged", "MiniDiffSignChange", "Changed" }, c.blue)
    c.git_del = pick("fg", { "diffRemoved", "MiniDiffSignDelete", "Removed" }, c.red)

    c.tabline_fg = pick("fg", { "TabLine" }, c.gray)
    c.tabline_bg = pick("bg", { "TabLine", "TabLineFill", "StatusLine" }, c.bg)
    c.tabline_sel_fg = pick("fg", { "TabLineSel" }, c.fg)
    c.tabline_sel_bg = pick("bg", { "TabLineSel" }, c.bg)

    return c
end

function M.setup()
    vim.api.nvim_create_autocmd("ColorScheme", {
        group = vim.api.nvim_create_augroup("heirline_components_colors", { clear = true }),
        callback = function()
            require("heirline.utils").on_colorscheme(M.get)
        end,
    })
end

return M
