local filename = require("heirline-components.utils.filename")

return {
    flexible = 2,
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
