local navic = require("nvim-navic")

local config = {
    separator = " ❭ ",
    separator_hl = { fg = "fg_bright" },
    default_hl = { fg = "fg" },
    click_name = "heirline_navic",
    update_event = "CursorHold",
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

local TYPE_HIGHLIGHTS = {
    File = "Directory",
    Module = "@include",
    Namespace = "@namespace",
    Package = "@include",
    Class = "@structure",
    Method = "@method",
    Property = "@property",
    Field = "@field",
    Constructor = "@constructor",
    Enum = "@field",
    Interface = "@type",
    Function = "@function",
    Variable = "@variable",
    Constant = "@constant",
    String = "@string",
    Number = "@number",
    Boolean = "@boolean",
    Array = "@field",
    Object = "@type",
    Key = "@keyword",
    Null = "@comment",
    EnumMember = "@field",
    Struct = "@structure",
    Event = "@keyword",
    Operator = "@operator",
    TypeParameter = "@type",
}

local function encode_position(line, col, winnr)
    return bit.bor(bit.lshift(line, 16), bit.lshift(col, 6), winnr)
end

local function decode_position(encoded)
    local line = bit.rshift(encoded, 16)
    local col = bit.band(bit.rshift(encoded, 6), 1023)
    local winnr = bit.band(encoded, 63)
    return line, col, winnr
end

local function sanitize_name(name)
    return name:gsub("%%", "%%%%"):gsub("%s*->%s*", "")
end

local function create_click_handler(encoded_pos)
    return function(_, minwid)
        local line, col, winnr = decode_position(minwid)
        vim.api.nvim_win_set_cursor(vim.fn.win_getid(winnr), { line, col })
    end
end

local function create_icon_component(icon, symbol_type)
    return {
        provider = icon,
        hl = TYPE_HIGHLIGHTS[symbol_type],
    }
end

local function create_name_component(name, encoded_pos)
    return {
        provider = sanitize_name(name),
        on_click = {
            minwid = encoded_pos,
            callback = create_click_handler(encoded_pos),
            name = config.click_name,
        },
    }
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

local function create_navic_item(data_item, winnr, is_last)
    local encoded_pos = encode_position(data_item.scope.start.line, data_item.scope.start.character, winnr)

    local item = {
        create_icon_component(data_item.icon, data_item.type),
        create_name_component(data_item.name, encoded_pos),
    }

    if not is_last then
        table.insert(item, create_separator_component())
    end

    return item
end

local function build_children(navic_data, winnr, level)
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
    local full = count < min_items or count <= first_n + last_n

    if full then
        for i = 1, count do
            table.insert(children, create_navic_item(navic_data[i], winnr, i == count))
        end
    else
        for i = 1, first_n do
            table.insert(children, create_navic_item(navic_data[i], winnr, false))
        end

        if first_n == 0 and last_n == 0 then
            table.insert(children, create_ellipsis_component())
        else
            table.insert(children, create_ellipsis_component())
            if last_n > 0 then
                table.insert(children, create_separator_component())
            end
        end

        for i = math.max(first_n + 1, count - last_n + 1), count do
            if i > first_n then
                table.insert(children, create_navic_item(navic_data[i], winnr, i == count))
            end
        end
    end

    if #children > 0 then
        table.insert(children, 1, create_separator_component())
    end

    return children
end

return {
    condition = function()
        return navic.is_available()
    end,
    static = {
        type_hl = TYPE_HIGHLIGHTS,
        enc = encode_position,
        dec = decode_position,
    },
    init = function(self)
        self.navic_data = navic.get_data() or {}
        self.data_count = #self.navic_data
    end,
    (function()
        local flexible_components = { flexible = true }

        for i, level_config in ipairs(config.flexible_levels) do
            table.insert(flexible_components, {
                init = function(self)
                    local children = build_children(self.navic_data, self.winnr, level_config)
                    self.child = self:new(children, 1)
                end,
                provider = function(self)
                    return self.child:eval()
                end,
            })
        end

        return flexible_components
    end)(),
    hl = config.default_hl,
    update = config.update_event,
}
