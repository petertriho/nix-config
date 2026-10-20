local mode = require("heirline-components.statusline.mode")

-- Reads `self.mode` and `self.mode_color` from the root `init` in `statusline.lua`.
return {
    flexible = 3,
    hl = function(self)
        return { fg = "bg", bg = self.mode_color, bold = true }
    end,
    {
        provider = function(self)
            return " " .. mode.name(self.mode) .. " "
        end,
    },
    {
        provider = function(self)
            return " " .. mode.short_name(self.mode) .. " "
        end,
    },
}
