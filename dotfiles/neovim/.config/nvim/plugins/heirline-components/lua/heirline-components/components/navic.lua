local escape = require("heirline-components.utils.statusline").escape

local config = {
    separator = " ❭ ",
    separator_hl = { fg = "fg_bright" },
    click_name = "heirline_navic",
    -- A cached component hides its flexible levels from heirline's resize pass. WinResized clears
    -- the cache, so the levels fit the new width.
    update_events = { "CursorHold", "BufEnter", "WinResized" },
    ellipsis = "…",
    ellipsis_hl = { fg = "fg_bright" },
    -- max_depth folded into level 1's min_items (inclusive cap 10 -> exclusive 11)
    flexible_levels = {
        { first = 1, last = 1, min_items = 11 }, -- Level 1: full up to 10; then 1 + ... + last 1
        { first = 2, last = 2, min_items = 5 }, -- Level 2: first 2 + ... + last 2
        { first = 1, last = 2, min_items = 4 }, -- Level 3: first 1 + ... + last 2
        { first = 1, last = 1, min_items = 3 }, -- Level 4: first 1 + ... + last 1
        { first = 0, last = 1, min_items = 1 }, -- Level 5: last 1 only
        { first = 0, last = 0, min_items = 1 }, -- Level 6: ellipsis only
    },
}

-- Used when the colorscheme does not define `NavicIcons<Kind>` (mini.base16 does not).
local FALLBACK_HIGHLIGHTS = {
    File = "Directory",
    Module = "@module",
    Namespace = "@module",
    Package = "@module",
    Class = "@type",
    Method = "@function.method",
    Property = "@property",
    Field = "@property",
    Constructor = "@constructor",
    Enum = "@type",
    Interface = "@type",
    Function = "@function",
    Variable = "@variable",
    Constant = "@constant",
    String = "@string",
    Number = "@number",
    Boolean = "@boolean",
    Array = "@property",
    Object = "@type",
    Key = "@keyword",
    Null = "@comment",
    EnumMember = "@constant",
    Struct = "@type",
    Event = "@keyword",
    Operator = "@operator",
    TypeParameter = "@type",
}

-- Navic data of the last render, per window. A click reads the symbol position from here, so
-- `minwid` only holds the item index and cannot overflow.
local window_data = {}

local function get_fg(name)
    return vim.api.nvim_get_hl(0, { name = name, link = false, create = false }).fg
end

local function resolve_icon_hl(symbol_type, cache)
    if cache[symbol_type] == nil then
        local fallback = FALLBACK_HIGHLIGHTS[symbol_type]
        local fg = fallback and (get_fg("NavicIcons" .. symbol_type) or get_fg(fallback))
        cache[symbol_type] = fg and { fg = fg } or false
    end
    return cache[symbol_type] or nil
end

local function on_click(_, index)
    local winid = vim.fn.getmousepos().winid
    local item = window_data[winid] and window_data[winid][index]
    if not item then
        return
    end

    local line = item.scope.start.line
    if line <= vim.api.nvim_buf_line_count(vim.api.nvim_win_get_buf(winid)) then
        vim.api.nvim_win_set_cursor(winid, { line, item.scope.start.character })
    end
end

local function create_separator_component()
    return {
        provider = config.separator,
        hl = config.separator_hl,
    }
end

local function create_ellipsis_component()
    return {
        provider = config.ellipsis,
        hl = config.ellipsis_hl,
    }
end

local function create_navic_item(data_item, index, is_last, hl_cache)
    local item = {
        {
            provider = data_item.icon,
            hl = resolve_icon_hl(data_item.type, hl_cache),
        },
        {
            provider = escape((data_item.name:gsub("%s*->%s*", ""))),
            on_click = {
                minwid = index,
                callback = on_click,
                name = config.click_name,
            },
        },
    }

    if not is_last then
        table.insert(item, create_separator_component())
    end

    return item
end

local function build_children(navic_data, level, hl_cache)
    local children = {}
    local count = #navic_data

    if count == 0 then
        return children
    end

    local first_n = level.first or 0
    local last_n = level.last or 0
    local min_items = level.min_items or 1

    -- Full display when below the floor, or when the request already covers
    -- the whole list (no items would be hidden).
    if count < min_items or count <= first_n + last_n then
        for i = 1, count do
            table.insert(children, create_navic_item(navic_data[i], i, i == count, hl_cache))
        end
    else
        for i = 1, first_n do
            table.insert(children, create_navic_item(navic_data[i], i, false, hl_cache))
        end

        table.insert(children, create_ellipsis_component())
        if last_n > 0 then
            table.insert(children, create_separator_component())
        end

        for i = count - last_n + 1, count do
            table.insert(children, create_navic_item(navic_data[i], i, i == count, hl_cache))
        end
    end

    table.insert(children, 1, create_separator_component())

    return children
end

local flexible_levels = { flexible = 1 }
for _, level in ipairs(config.flexible_levels) do
    table.insert(flexible_levels, {
        init = function(self)
            self.child = self:new(build_children(self.navic_data, level, self.icon_hl_cache), 1)
        end,
        provider = function(self)
            return self.child:eval()
        end,
    })
end

return {
    -- nvim-navic loads when an LSP client attaches it (`peter.lsp`). Until then no
    -- buffer has navic data, so the winbar does not load it.
    condition = function()
        local navic = package.loaded["nvim-navic"]
        return navic ~= nil and navic.is_available()
    end,
    init = function(self)
        self.navic_data = package.loaded["nvim-navic"].get_data() or {}
        self.icon_hl_cache = {}

        for winid in pairs(window_data) do
            if not vim.api.nvim_win_is_valid(winid) then
                window_data[winid] = nil
            end
        end
        window_data[vim.api.nvim_get_current_win()] = self.navic_data
    end,
    flexible_levels,
    update = config.update_events,
}
