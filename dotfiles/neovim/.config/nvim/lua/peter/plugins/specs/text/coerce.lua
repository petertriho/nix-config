-- One map per case keeps the prefixes unmapped, so which-key shows their
-- cases. The list mirrors require("coerce").default_cases.
local cases = {
    { "c", "camelCase" },
    { "d", "dot.case" },
    { "k", "kebab-case" },
    { "n", "numeronym (n7m)" },
    { "p", "PascalCase" },
    { "s", "snake_case" },
    { "u", "UPPER_CASE" },
    { "/", "path/case" },
    { " ", "space case" },
}

local prefixes = {
    { "cr", "n", "<Plug>(coerce-normal)" },
    { "co", "n", "<Plug>(coerce-normal-no-lsp)" },
    { "\\c", "n", "<Plug>(coerce-motion)" },
    { "\\c", "x", "<Plug>(coerce-visual)" },
}

local keys = {}
for _, prefix in ipairs(prefixes) do
    local lhs, mode, plug = unpack(prefix)
    for _, case in ipairs(cases) do
        table.insert(keys, {
            lhs .. case[1],
            plug .. case[1],
            mode = mode,
            desc = case[2],
        })
    end
end

return {
    "gregorias/coerce.nvim",
    dependencies = "gregorias/coop.nvim",
    keys = keys,
    opts = {},
}
