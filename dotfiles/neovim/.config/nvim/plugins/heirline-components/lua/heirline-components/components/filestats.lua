local separator = require("heirline-components.components.rightangle").provider

local function join(stats, keys)
    local parts = {}
    for _, key in ipairs(keys) do
        table.insert(parts, stats[key])
    end
    return " " .. table.concat(parts, separator) .. " "
end

local function Level(keys)
    return {
        provider = function(self)
            return join(self.stats, keys)
        end,
    }
end

return {
    init = function(self)
        local bo = vim.bo
        local encoding = bo.fileencoding ~= "" and bo.fileencoding or vim.o.encoding
        local width = bo.shiftwidth ~= 0 and bo.shiftwidth or bo.tabstop

        self.stats = {
            encoding = encoding:upper(),
            format = bo.fileformat:upper(),
            indent = (bo.expandtab and "●" or "󰌒") .. " " .. width,
            lines = " %L",
        }
    end,
    hl = { bg = "bg_highlight" },
    flexible = 1,
    Level({ "encoding", "format", "indent", "lines" }),
    Level({ "format", "indent", "lines" }),
    Level({ "indent", "lines" }),
    Level({ "lines" }),
}
