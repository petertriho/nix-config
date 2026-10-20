local M = {}

-- Keys are the values of `mode(1)`. `"\22"` is CTRL-V and `"\19"` is CTRL-S.
local names = {
    n = "NORMAL",
    no = "OP PENDING",
    nov = "NO VISUAL",
    noV = "NO VISUAL LINE",
    ["no\22"] = "NO VISUAL BLOCK",
    niI = "NORMAL INSERT",
    niR = "NORMAL REPLACE",
    niV = "NORMAL VISUAL",
    nt = "NORMAL TERMINAL",
    ntT = "NORMAL TERMINAL",
    v = "VISUAL",
    vs = "VISUAL SELECT",
    V = "VISUAL LINE",
    Vs = "VISUAL LINE SELECT",
    ["\22"] = "VISUAL BLOCK",
    ["\22s"] = "VISUAL BLOCK SELECT",
    s = "SELECT",
    S = "SELECT LINE",
    ["\19"] = "SELECT BLOCK",
    i = "INSERT",
    ic = "INSERT COMPLETION",
    ix = "INSERT COMPLETION",
    R = "REPLACE",
    Rc = "REPLACE COMPLETION",
    Rx = "REPLACE COMPLETION",
    Rv = "REPLACE VISUAL",
    Rvc = "REPLACE VISUAL COMPLETION",
    Rvx = "REPLACE VISUAL COMPLETION",
    c = "COMMAND",
    cr = "COMMAND OVERSTRIKE",
    cv = "EX COMMAND",
    cvr = "EX COMMAND OVERSTRIKE",
    r = "PROMPT",
    rm = "MORE",
    ["r?"] = "CONFIRM",
    ["!"] = "SHELL",
    t = "TERMINAL",
}

local short_names = {
    n = "N",
    no = "N?",
    nov = "N?",
    noV = "N?",
    ["no\22"] = "N?",
    niI = "Ni",
    niR = "Nr",
    niV = "Nv",
    nt = "Nt",
    ntT = "Nt",
    v = "V",
    vs = "Vs",
    V = "V_",
    Vs = "Vs",
    ["\22"] = "^V",
    ["\22s"] = "^V",
    s = "S",
    S = "S_",
    ["\19"] = "^S",
    i = "I",
    ic = "Ic",
    ix = "Ix",
    R = "R",
    Rc = "Rc",
    Rx = "Rx",
    Rv = "Rv",
    Rvc = "Rv",
    Rvx = "Rv",
    c = "C",
    cr = "Cr",
    cv = "Ex",
    cvr = "Ex",
    r = "...",
    rm = "M",
    ["r?"] = "?",
    ["!"] = "!",
    t = "T",
}

-- Keyed by the first character of the mode. Values are names in the heirline color table.
local colors = {
    n = "blue",
    i = "green",
    v = "purple",
    V = "purple",
    ["\22"] = "purple",
    c = "yellow",
    s = "purple",
    S = "purple",
    ["\19"] = "purple",
    R = "red",
    r = "red",
    ["!"] = "blue",
    t = "blue",
}

-- Unknown modes fall back to the raw mode string, so a new Neovim mode cannot break the statusline.
function M.name(mode)
    return names[mode] or mode
end

function M.short_name(mode)
    return short_names[mode] or mode
end

function M.color(mode)
    return colors[mode:sub(1, 1)] or "blue"
end

return M
