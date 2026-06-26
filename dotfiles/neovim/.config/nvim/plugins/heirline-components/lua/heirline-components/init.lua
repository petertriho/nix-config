local M = {}

function M.setup()
    require("heirline-components.utils.filename").setup()
    require("heirline-components.tabline.runtime").setup()
end

return M
