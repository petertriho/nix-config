local utils = require("heirline.utils")

local hl_names = {
    "Constant",
    "CursorLine",
    "DiagnosticError",
    "DiagnosticHint",
    "DiagnosticInfo",
    "DiagnosticWarn",
    "DiffDelete",
    "Directory",
    "Folded",
    "Function",
    "NonText",
    "Special",
    "Statement",
    "String",
    "TabLine",
    "TabLineSel",
    "Todo",
    "diffAdded",
    "diffChanged",
    "diffRemoved",
}

local hl = {}
for _, name in ipairs(hl_names) do
    hl[name] = utils.get_highlight(name)
end

return {
    bg_bright = hl.Folded.bg,
    fg_bright = hl.Folded.fg,
    bg_highlight = hl.CursorLine.bg,
    red = hl.DiagnosticError.fg,
    dark_red = hl.DiffDelete.bg,
    green = hl.String.fg,
    blue = hl.Function.fg,
    gray = hl.NonText.fg,
    orange = hl.Constant.fg,
    purple = hl.Statement.fg,
    cyan = hl.Special.fg,
    yellow = hl.Todo.bg,
    diag_warn = hl.DiagnosticWarn.fg,
    diag_error = hl.DiagnosticError.fg,
    diag_hint = hl.DiagnosticHint.fg,
    diag_info = hl.DiagnosticInfo.fg,
    git_add = hl.diffAdded.fg,
    git_del = hl.diffRemoved.fg,
    git_change = hl.diffChanged.fg,
    directory = hl.Directory.fg,
    tabline_fg = hl.TabLine.fg,
    tabline_bg = hl.TabLine.bg,
    tabline_sel_fg = hl.TabLineSel.fg,
    tabline_sel_bg = hl.TabLineSel.bg,
}
