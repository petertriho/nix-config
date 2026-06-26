local filename = require("heirline-components.utils.filename")

return {
    flexible = true,
    {
        provider = function()
            return filename.full(0)
        end,
    },
    {
        provider = function()
            return filename.smart(0)
        end,
    },
}
