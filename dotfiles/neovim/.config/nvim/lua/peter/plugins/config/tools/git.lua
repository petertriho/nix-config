return {
    "wsdjeg/git.nvim",
    dependencies = {
        { "wsdjeg/job.nvim" },
        { "wsdjeg/notify.nvim" },
    },
    cmd = {
        "Git",
    },
    init = function()
        vim.cmd([[cabbrev <expr> G getcmdtype() == ':' && getcmdline() ==# 'G' ? 'Git' : 'G']])
    end,
}
