local M = {}

-- Text that goes into 'statusline', 'tabline', or 'winbar' must double each `%`, else
-- Neovim reads it as an item (`50%done` gives E539).
function M.escape(text)
    return (text:gsub("%%", "%%%%"))
end

return M
