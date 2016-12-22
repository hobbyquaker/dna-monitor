const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const path = require('path');
const url = require('url');
const fs = require('fs');
const async = require('async');
const SerialPort = require('serialport');
const ipc = require('electron').ipcMain;

let mainWindow;

function createWindow () {
    mainWindow = new BrowserWindow({width: 1280, height: 520});

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
    }));

    // Open the DevTools.
    mainWindow.webContents.openDevTools();

    // let's go!
    setTimeout(() => {
        findport(start);
    }, 1000);

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (port) port.close();
        process.exit(0);
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

var port = null;
var callbacks = {};

function findport(cb) {
    var devs = (fs.readdirSync('/dev'));
    var sport;
    for (var i = 0; i < devs.length; i++) {
        if (devs[i].match(/tty\.usbmodem[0-9A-Z]+/)) {
            sport = '/dev/' + devs[i];
            break;
        }
    }
    if (sport) {
        cb(sport)
    } else {
        setTimeout(() => {
            findport(cb);
        }, 1000);
    }
}


function start(sport) {
    port = new SerialPort(sport);

    port.on('open', () => {
        mainWindow.webContents.send('sport', true);
        setTimeout(pollPuff, 1000);

    });

    port.on('disconnect', () => {
        mainWindow.webContents.send('sport', false);
        port = null;
        findport(start);
    });

    port.on('data', data => {
        var [datapoint, value] = data.toString().replace(/\r\n$/, '').split('=');
        if (callbacks[datapoint]) {
            let cb = callbacks[datapoint];
            delete callbacks[datapoint];
            cb(null, value);
        }
    });
}

function cmdGet(dp, mod, cb) {
    if (typeof mod === 'function') {
        cb = mod;
        mod = null;
    }
    var s = dp + '=GET';
    if (mod) s = s + ' ' + mod;

    if (!port) {
        if (typeof cb === 'function') cb(new Error('serialport missing'));
    } else {
        port.write(s + '\r\n', err => {
            if (err) {
                if (typeof cb === 'function') cb(err.message);
            } else {
                if (typeof cb === 'function') {
                    callbacks[dp] = cb;
                    setTimeout(() => {
                        if (callbacks[dp]) {
                            delete callbacks[dp];
                            cb(new Error('timeout'));
                        }
                    }, 15);
                }
            }
        });
    }

}

function cmdSet(dp, val, cb) {
    if (!port) {
        if (typeof cb === 'function') cb(new Error('serialport missing'));
    } else {
        port.write(dp + '=' + val + '\r\n', cb);
    }
}

function ipcSend(key, data) {
    if (mainWindow) {
        mainWindow.webContents.send(key, data);
    } else {
        port.close();
        process.exit(0);
    }
}

ipc.on('setp', (e, val) => {
    cmdSet('P', val + 'W');
});

ipc.on('sett', (e, val) => {
    cmdSet('T', val);
});

ipc.on('fire', (e, val) => {
    cmdSet('F', val + 'S');
});



var pc = 50;

var pollPuffDatapoints = ['T', 'P'];

function pollPuff() {
    var dps = [];
    var cmdQueue = [];
    pollPuffDatapoints.forEach(dp => {
        dps.push(dp);
        cmdQueue.push(cb => {
            cmdGet(dp, cb);
        });
    });
    async.series(cmdQueue, (err, res) => {
        var obj;
        if (!err) {
            obj = {};
            dps.forEach((dp, index) => {
                obj[dp] = res[index];
            });
            ipcSend('values', obj);
        }

        if (++pc > 50) {
            pc = 0;
            setTimeout(pollSettings, 20);
        } else {
            setTimeout(pollPuff, 20);
        }

    });
}

var pollSettingsDatapoints = ['T', 'P'];

function pollSettings() {
    var dps = [];
    var cmdQueue = [];
    pollSettingsDatapoints.forEach(dp => {
        dps.push(dp);
        cmdQueue.push(cb => {
            cmdGet(dp, 'SP', cb);
        });
    });
    async.series(cmdQueue, (err, res) => {
        if (!err) {
            let obj = {};
            dps.forEach((dp, index) => {
                obj[dp] = res[index];
            });
            ipcSend('setpoints', obj);

        }
        setTimeout(pollPuff, 20);
    });
}
