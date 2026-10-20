local M = {}

function M.setup()
    require("heirline-components.colors").setup()
    require("heirline-components.statusline.runtime").setup()
    require("heirline-components.tabline.runtime").setup()
end

return M
