return {
    "luochen1990/rainbow",
    event = "VeryLazy",
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

        local filetypes = require("peter.plugins.filetypes")

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
