local M = {}

local function lsp_attach_callback(args)
    local client = vim.lsp.get_client_by_id(args.data.client_id)
    local bufnr = args.buf

    if require("peter.core.utils").file_is_big(bufnr) then
        vim.schedule(function()
            vim.lsp.buf_detach_client(bufnr, args.data.client_id)
        end)
        return
    end

    require("peter.lsp.format").on_attach(client, bufnr)

    local function buf_set_keymap(mode, lhs, rhs, opts)
        opts = opts or {}
        opts.buffer = bufnr
        noremap = true
        silent = true
        vim.keymap.set(mode, lhs, rhs, opts)
    end

    buf_set_keymap(
        "n",
        "gh",
        "<CMD>lua vim.diagnostic.open_float(0, { scope = 'line', source = 'always', border = 'rounded' })<CR>",
        { desc = "Diagnostic" }
    )
    buf_set_keymap("n", "<leader>lq", "<CMD>lua vim.diagnostic.setqflist()<CR>", { desc = "Qflist Diagnostics" })

    if client.supports_method("textDocument/declaration") then
        buf_set_keymap("n", "grd", "<CMD>lua vim.lsp.buf.declaration()<CR>", { desc = "Declaration" })
    end

    if client.supports_method("textDocument/hover") then
        buf_set_keymap("n", "K", "<CMD>lua vim.lsp.buf.hover()<CR>", { desc = "Hover" })
    end

    if client.supports_method("textDocument/implementation") then
        buf_set_keymap("n", "gri", "<CMD>lua vim.lsp.buf.implementation()<CR>", { desc = "Implementation" })
    end

    if client.supports_method("textDocument/signatureHelp") then
        buf_set_keymap("n", "grs", "<CMD>lua vim.lsp.buf.signature_help()<CR>", { desc = "Signature help" })
    end

    if client.supports_method("textDocument/typeDefinition") then
        buf_set_keymap("n", "gry", "<CMD>lua vim.lsp.buf.type_definition()<CR>", { desc = "Type Definition" })
    end

    if client.name == "basedpyright" then
        buf_set_keymap("n", "gro", "<CMD>PyrightOrganizeImports<CR>", { desc = "Organize Imports" })
    elseif client.name == "ruff" then
        buf_set_keymap("n", "gro", "<CMD>RuffOrganizeImports<CR>", { desc = "Organize Imports" })
    elseif client.name == "tsserver" then
        buf_set_keymap("n", "gro", "<CMD>TSServerOrganizeImports<CR>", { desc = "Organize Imports" })
    end

    if client.supports_method("textDocument/codeAction") then
        buf_set_keymap("n", "<leader>k", "<CMD>lua vim.lsp.buf.code_action()<CR>", { desc = "Code Actions" })
        buf_set_keymap("v", "<leader>k", "<CMD>lua vim.lsp.buf.range_code_action()<CR>", { desc = "Code Actions" })

        vim.api.nvim_create_augroup("lsp_code_action", {})
    end

    if client.supports_method("textDocument/documentSymbol") then
        require("nvim-navic").attach(client, bufnr)
    end
end

local function make_base_config()
    local capabilities = vim.lsp.protocol.make_client_capabilities()

    local completion = capabilities.textDocument.completion

    local completionItem = completion.completionItem
    completionItem.snippetSupport = true
    completionItem.commitCharactersSupport = true
    completionItem.deprecatedSupport = true
    completionItem.preselectSupport = true
    completionItem.tagSupport = {
        valueSet = {
            1, -- Deprecated
        },
    }
    completionItem.insertReplaceSupport = true
    completionItem.resolveSupport = {
        properties = {
            "documentation",
            "detail",
            "additionalTextEdits",
            "sortText",
            "filterText",
            "insertText",
            "textEdit",
            "insertTextFormat",
            "insertTextMode",
        },
    }
    completionItem.insertTextModeSupport = {
        valueSet = {
            1, -- asIs
            2, -- adjustIndentation
        },
    }
    completionItem.labelDetailsSupport = true

    completion.dynamicRegistration = false
    completion.contextSupport = true
    completion.insertTextMode = 1
    completion.completionList = {
        itemDefaults = {
            "commitCharacters",
            "editRange",
            "insertTextFormat",
            "insertTextMode",
            "data",
        },
    }

    capabilities.textDocument.colorProvider = { dynamicRegistration = false }
    return {
        capabilities = capabilities,
        flags = { allow_incremental_sync = true, debounce_text_changes = 300 },
    }
end

M.setup = function()
    vim.diagnostic.config({
        severity_sort = true,
        signs = {
            text = {
                [vim.diagnostic.severity.ERROR] = "󰅚 ",
                [vim.diagnostic.severity.WARN] = "󰀪 ",
                [vim.diagnostic.severity.HINT] = "󰌶 ",
                [vim.diagnostic.severity.INFO] = " ",
            },
        },
    })

    vim.lsp.handlers["textDocument/hover"] = vim.lsp.with(vim.lsp.handlers.hover, { border = "rounded" })
    vim.lsp.handlers["textDocument/signatureHelp"] =
        vim.lsp.with(vim.lsp.handlers.signature_help, { border = "rounded" })

    vim.api.nvim_create_autocmd("LspAttach", {
        callback = lsp_attach_callback,
    })

    local lspconfig = require("lspconfig")
    local overrides = require("peter.lsp.overrides")

    local base_config = make_base_config()

    for server, override in pairs(overrides) do
        local config = vim.tbl_extend("force", base_config, override or {})

        if server == "yamlls" then
            config = require("yaml-companion").setup({ lspconfig = config })
        end

        lspconfig[server].setup(config)
    end

    require("peter.lsp.none-ls").setup(base_config)
end

return M
