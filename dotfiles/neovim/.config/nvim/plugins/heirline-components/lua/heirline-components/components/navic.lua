local config = {
    separator = " ❭ ",
    separator_hl = { fg = "fg_bright" },
    default_hl = { fg = "fg" },
    click_name = "heirline_navic",
    update_event = "CursorHold",
    ellipsis = "…",
    ellipsis_hl = { fg = "fg_bright" },
    max_depth = 10,
    flexible_levels = {
        { first = nil, last = nil }, -- Level 1: Full display
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

local function build_navic_children(navic_data, winnr)
    local children = {}
    local data_count = #navic_data

    if data_count <= config.max_depth then
        for i, data_item in ipairs(navic_data) do
            local is_last = (data_count == 1 or i == data_count)
            local item = create_navic_item(data_item, winnr, is_last)
            table.insert(children, item)
        end
    else
        local first_item = create_navic_item(navic_data[1], winnr, false)
        table.insert(children, first_item)

        table.insert(children, create_ellipsis_component())
        table.insert(children, create_separator_component())

        local last_item = create_navic_item(navic_data[data_count], winnr, true)
        table.insert(children, last_item)
    end

    if #children > 0 then
        table.insert(children, 1, create_separator_component())
    end

    return children
end

local function build_flexible_children(navic_data, winnr, level_config)
    local children = {}
    local data_count = #navic_data

    if data_count == 0 then
        return children
    end

    local first_count = level_config.first or 0
    local last_count = level_config.last or 0
    local min_items = level_config.min_items or 1

    -- If we have fewer items than minimum or can show all without ellipsis
    if
        data_count < min_items or (first_count + last_count >= data_count and first_count ~= nil and last_count ~= nil)
    then
        for i, data_item in ipairs(navic_data) do
            local is_last = (i == data_count)
            local item = create_navic_item(data_item, winnr, is_last)
            table.insert(children, item)
        end
    else
        -- Show first items
        for i = 1, first_count do
            if i <= data_count then
                local item = create_navic_item(navic_data[i], winnr, false)
                table.insert(children, item)
            end
        end

        -- Add ellipsis if we're skipping items
        if first_count + last_count < data_count and (first_count > 0 or last_count > 0) then
            table.insert(children, create_ellipsis_component())
            if last_count > 0 then
                table.insert(children, create_separator_component())
            end
        elseif first_count == 0 and last_count == 0 then
            table.insert(children, create_ellipsis_component())
        end

        -- Show last items
        for i = math.max(first_count + 1, data_count - last_count + 1), data_count do
            if i > first_count then
                local is_last = (i == data_count)
                local item = create_navic_item(navic_data[i], winnr, is_last)
                table.insert(children, item)
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
        return require("nvim-navic").is_available()
    end,
    static = {
        type_hl = TYPE_HIGHLIGHTS,
        enc = encode_position,
        dec = decode_position,
    },
    init = function(self)
        self.navic_data = require("nvim-navic").get_data() or {}
        self.data_count = #self.navic_data
    end,
    (function()
        local flexible_components = { flexible = true }

        for i, level_config in ipairs(config.flexible_levels) do
            table.insert(flexible_components, {
                init = function(self)
                    local children
                    if level_config.first == nil and level_config.last == nil then
                        -- Full display level
                        children = build_navic_children(self.navic_data, self.winnr)
                    else
                        -- Flexible level
                        children = build_flexible_children(self.navic_data, self.winnr, level_config)
                    end
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
