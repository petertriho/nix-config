return {
    "arborist-ts/arborist.nvim",
    cmd = {
        "Arborist",
        "ArboristInstall",
        "ArboristUpdate",
        "ArboristClean",
    },
    event = { "User LazyLoadFile", "VeryLazy" },
    config = function()
        local ensure_installed = {
            "markdown_inline",
            "regex",
            "vimdoc",
            unpack(require("peter.core.filetypes").treesitter),
        }

        local ok, arborist = pcall(require, "arborist")
        if not ok then
            return
        end

        arborist.setup({
            install_popular = false,
            update_cadence = "manual",
            ensure_installed = ensure_installed,
            ignore = require("peter.core.filetypes").excludes,
        })

        vim.api.nvim_exec_autocmds("User", { pattern = "LoadedNvimTreesitter" })
    end,
}
