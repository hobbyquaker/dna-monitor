const ipc =         require('electron').ipcRenderer;
const $ = jQuery =  require('jquery');
const remote =      require('electron').remote;

$('#close').click(function () {
    let window = remote.getCurrentWindow();
    window.close();
});