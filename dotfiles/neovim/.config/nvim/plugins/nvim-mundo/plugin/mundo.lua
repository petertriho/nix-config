-- nvim-mundo plugin commands
if vim.g.loaded_mundo then
  return
end
vim.g.loaded_mundo = 1

-- Create user commands
vim.api.nvim_create_user_command('MundoToggle', function()
  require('mundo').toggle()
end, {})

vim.api.nvim_create_user_command('MundoShow', function()
  require('mundo').show()
end, {})

vim.api.nvim_create_user_command('MundoHide', function()
  require('mundo').hide()
end, {})

-- Backward compatibility with vim-mundo/gundo
vim.api.nvim_create_user_command('GundoToggle', function()
  require('mundo').toggle()
end, {})

vim.api.nvim_create_user_command('GundoShow', function()
  require('mundo').show()
end, {})

vim.api.nvim_create_user_command('GundoHide', function()
  require('mundo').hide()
end, {})