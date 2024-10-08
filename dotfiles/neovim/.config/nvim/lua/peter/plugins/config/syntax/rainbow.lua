return {
    "luochen1990/rainbow",
    event = "User LazyLoadFile",
    init = function()
        local colors = require("peter.plugins.colors")

        vim.g.rainbow_active = 1

        local rainbow_conf = {
            guifgs = {
                colors.red,
                colors.green,
                colors.blue,
                colors.yellow,
                colors.cyan,
                colors.magenta,
                colors.orange,
            },
            separately = {},
        }

        local filetypes = require("peter.core.filetypes")

        for _, filetype_type in pairs(filetypes) do
            if filetype_type ~= "sidebars" then
                for _, filetype in ipairs(filetype_type) do
                    rainbow_conf.separately[filetype] = 0
                end
            end
        end

        vim.g.rainbow_conf = rainbow_conf
    end,
}
