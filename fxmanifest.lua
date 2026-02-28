fx_version 'cerulean'
game 'gta5'

author 'Moxy'
description 'fivem-greenscreener'
version '2.0.0'

ui_page 'html/index.html'


files {
    'config.json',
    'tattoos.json',
    'html/*'
}

client_script 'client.js'

server_script 'server.js'

dependencies {
	'screencapture',
    'yarn'
}
