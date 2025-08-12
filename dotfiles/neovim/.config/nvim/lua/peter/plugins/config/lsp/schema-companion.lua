return {
    "cenk1cenk2/schema-companion.nvim",
    lazy = true,
    config = function()
        require("schema-companion").setup({
            schemas = require("schemastore").yaml.schemas(),
        })
    end,
}
