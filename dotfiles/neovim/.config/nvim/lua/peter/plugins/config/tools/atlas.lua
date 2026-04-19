return {
    "emrearmagan/atlas.nvim",
    enabled = vim.env.ATLASSIAN_COMPANY_NAME ~= nil,
    cmd = {
        "AtlasJira",
        "AtlasJqlSearch",
        "AtlasBitbucket",
        "AtlasClearCache",
        "AtlasLogs",
    },
    config = function()
        local project_keys = vim.split(vim.env.ATLASSIAN_PROJECT_KEY, ",", { trimempty = true })
        local project_key = project_keys[1] or "PROJECT_KEY"

        require("atlas").setup({
            jira = {
                base_url = string.format("https://%s.atlassian.net", vim.env.ATLASSIAN_COMPANY_NAME),
                email = vim.env.ATLASSIAN_EMAIL,
                token = vim.env.JIRA_API_TOKEN,
                project_config = {
                    [vim.env.ATLASSIAN_PROJECT_KEY] = {},
                },
                views = {
                    {
                        name = "Board",
                        key = "B",
                        jql = string.format(
                            "project = %s AND assignee = currentUser() ORDER BY updated DESC",
                            project_key
                        ),
                    },
                    {
                        name = "Current Sprint (Me)",
                        key = "M",
                        jql = string.format(
                            "project = %s AND sprint in openSprints() AND assignee = currentUser() ORDER BY updated DESC",
                            project_key
                        ),
                    },
                    {
                        name = "Current Sprint",
                        key = "S",
                        jql = string.format(
                            "project = %s AND sprint in openSprints() ORDER BY updated DESC",
                            project_key
                        ),
                    },
                    {
                        name = "Team Board",
                        key = "T",
                        jql = string.format("project = %s ORDER BY updated DESC", project_key),
                    },
                },
            },
        })
    end,
}
