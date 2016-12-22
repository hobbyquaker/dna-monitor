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
    mainWindow = new BrowserWindow({width: 800, height: 480});

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
    }));

    // Open the DevTools.
    //mainWindow.webContents.openDevTools();

    // let's go!
    setTimeout(function () {
        findport(start);
    }, 1000);

    mainWindow.on('closed', function () {
        mainWindow = null;
        port.close();
        process.exit(0);
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
    app.quit();
});

app.on('activate', function () {
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
        setTimeout(function () {
            findport(cb);
        }, 1000);
    }
}


function start(sport) {
    port = new SerialPort(sport);

    port.on('open', function () {
        mainWindow.webContents.send('sport', true);
        setTimeout(pollPuff, 1000);

    });

    port.on('disconnect', () => {
        mainWindow.webContents.send('sport', false);
        port = null;
        findport(start);
    });

    port.on('data', function (data) {
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
        port.write(s + '\r\n', function (err) {
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
                    }, 20);
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
    if (!mainWindow) process.exit(0);
    console.log(key, data);
    mainWindow.webContents.send(key, data);
}

ipc.on('setp', function (e, val) {
    cmdSet('P', val + 'W');
});

ipc.on('sett', function (e, val) {
    cmdSet('T', val);
});

ipc.on('fire', function (e, val) {
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
        var obj = {};
        dps.forEach((dp, index) => {
            obj[dp] = res[index];
        });
        ipcSend('values', obj);
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
        var obj = {};
        dps.forEach((dp, index) => {
            obj[dp] = res[index];
        });
        ipcSend('setpoints', obj);
        setTimeout(pollPuff, 20);
    });
}

