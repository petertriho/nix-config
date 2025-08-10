return {
    "cenk1cenk2/schema-companion.nvim",
    lazy = true,
    opts = {
        schemas = require("schemastore").yaml.schemas(),
    },
}
