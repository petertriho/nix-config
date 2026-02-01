local filename_utils = require("heirline-components.utils.filename")

return {
    flexible = true,
    init = function(self)
        self.filename = vim.api.nvim_buf_get_name(0)
    end,
    {
        provider = function(self)
            local filename = vim.fn.fnamemodify(self.filename, ":~:.")
            return filename == "" and "[No Name]" or filename
        end,
    },
    {
        provider = function(self)
            return filename_utils.get_smart_filename(self.filename)
        end,
    },
}
