local M = {}

local function lsp_attach_callback(args)
    local bufnr = args.buf

    if require("peter.core.utils").file_is_big(bufnr) then
        vim.schedule(function()
            vim.lsp.buf_detach_client(bufnr, args.data.client_id)
        end)
        return
    end

    local function buf_keymap(mode, lhs, rhs, opts)
        opts = opts or {}
        opts.buffer = bufnr
        vim.keymap.set(mode, lhs, rhs, opts)
    end

    local client = vim.lsp.get_client_by_id(args.data.client_id)

    local function lsp_keymap(lsp_method, mode, lhs, rhs, desc)
        if client.supports_method(lsp_method) then
            buf_keymap(mode, lhs, rhs, { desc = desc })
        end
    end

    buf_keymap(
        "n",
        "gh",
        "<CMD>lua vim.diagnostic.open_float(0, { scope = 'line', source = 'always', border = 'rounded' })<CR>",
        { desc = "Diagnostic" }
    )
    buf_keymap("n", "grq", "<CMD>lua vim.diagnostic.setqflist()<CR>", { desc = "QDiagnostics" })
    buf_keymap("n", "grl", "<CMD>lua vim.diagnostic.setloclist()<CR>", { desc = "LDiagnostics" })

    lsp_keymap("textDocument/definition", "n", "gd", "<CMD>lua vim.lsp.buf.definition()<CR>", "Declaration")
    lsp_keymap("textDocument/declaration", "n", "gD", "<CMD>lua vim.lsp.buf.declaration()<CR>", "Declaration")
    lsp_keymap("textDocument/hover", "n", "K", "<CMD>lua vim.lsp.buf.hover()<CR>", "Hover")
    lsp_keymap("textDocument/implementation", "n", "gri", "<CMD>lua vim.lsp.buf.implementation()<CR>", "Implementation")
    lsp_keymap(
        "textDocument/typeDefinition",
        "n",
        "gy",
        "<CMD>lua vim.lsp.buf.type_definition()<CR>",
        "Type Definition"
    )

    if client.name == "basedpyright" then
        buf_keymap("n", "gro", "<CMD>PyrightOrganizeImports<CR>", { desc = "Organize Imports" })
    elseif client.name == "ruff" then
        buf_keymap("n", "gro", "<CMD>RuffOrganizeImports<CR>", { desc = "Organize Imports" })
    elseif client.name == "tsserver" then
        buf_keymap("n", "gro", "<CMD>TSServerOrganizeImports<CR>", { desc = "Organize Imports" })
    end

    if client.supports_method("textDocument/codeAction") then
        buf_keymap("n", "<leader>k", "<CMD>lua vim.lsp.buf.code_action()<CR>", { desc = "Code Actions" })
        buf_keymap("v", "<leader>k", "<CMD>lua vim.lsp.buf.range_code_action()<CR>", { desc = "Code Actions" })
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
end

return M
