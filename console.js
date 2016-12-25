const ipc =         require('electron').ipcRenderer;
const $ = jQuery =  require('jquery');
const remote =      require('electron').remote;

let cmdHistory = [];
let arrowIndex = -1;

let $input = $('#input');
let $output = $('#output');

$('#close').click(function () {
    let window = remote.getCurrentWindow();
    window.close();
});



$input.on('keydown', function (e) {
    let keyCode = e.keyCode || e.which;
    var arrow = {left: 37, up: 38, right: 39, down: 40 };
    switch (keyCode) {
        case 13: // Enter
            arrowIndex = -1;
            let cmd = $input.val();
            if (cmdHistory[0] !== cmd) cmdHistory.unshift(cmd);
            $input.val('');
            ipc.send('cmd', cmd);
            $output.append('> ' + cmd + '\n');
            break;

        case arrow.up:
            arrowIndex += 1;
            if ((arrowIndex + 1) > cmdHistory.length) {
                arrowIndex = 0;
            }
            $input.val(cmdHistory[arrowIndex]);
            break;

        case arrow.down:
            arrowIndex -= 1;
            if (arrowIndex < -1) arrowIndex = -1;
            $input.val(cmdHistory[arrowIndex]);
            break;
    }

});

ipc.on('response', function (event, data) {
    $output.append('< ' + data).animate({ scrollTop: $output.height()}, 400);
});

$input.focus();
