const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const path = require('path');
const url = require('url');
const fs = require('fs');
const async = require('async');
const SerialPort = require('serialport');
const ipc = require('electron').ipcMain;
const storage = require('electron-json-storage');
const windowStateKeeper = require('electron-window-state');
const isDev = require('electron-is-dev');

let mainWindow;
let debug;

if (isDev) {
    debug = console.log;
} else {
    debug = function () {};
}

var pollPuffDatapoints =  ['T', 'P'];

function createWindow () {

    let mainWindowState = windowStateKeeper({
        defaultWidth: 860,
        defaultHeight: 540
    });

    let devWindowState = {
        width: 1280,
        height: 540
    };

    mainWindow = new BrowserWindow(isDev ? devWindowState : mainWindowState);

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
    }));

    // Open the DevTools.
    if (isDev) mainWindow.webContents.openDevTools();

    // let's go!
    setTimeout(() => {
        findport(start);

        storage.get('datapoints', (err, data) => {
            if (!err) {
                pollPuffDatapoints = data;
                ipcSend('series', data);
            }
        });

    }, 1000);

    if (!isDev) mainWindowState.manage(mainWindow);

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
        debug('found port', sport);
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
        debug('opened', sport);
        mainWindow.webContents.send('sport', true);
        setTimeout(pollInfos, 100);

    });

    port.on('disconnect', () => {
        port = null;
        callbacks = {};
        mainWindow.webContents.send('sport', false);
        setTimeout(() => {
            findport(start);
        }, 500);
    });

    port.on('data', data => {
        var [datapoint, value] = data.toString().replace(/\r\n$/, '').split('=');
        if (callbacks[datapoint]) {
            let cb = callbacks[datapoint];
            delete callbacks[datapoint];
            setTimeout(() => {
                cb(null, value);
            }, 5);

        }
    });
}

function cmdGet(dp, mod, cb) {
    if (typeof mod === 'function') {
        cb = mod;
        mod = null;
    }
    if (dp.length > 1) {
        mod = dp.substr(1, dp.length);
        dp = dp.substr(0, 1);
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
                        if (port && callbacks[dp]) {
                            debug('timeout', dp);
                            cb(new Error('timeout'));
                            delete callbacks[dp];
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
    if (mainWindow) {
        mainWindow.webContents.send(key, data);
    } else {
        if (port) port.close();
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


var running;
var pc = 50;



ipc.on('datapoints', (e, val) => {
    storage.set('datapoints', val);
    pollPuffDatapoints = val;
});

function pollPuff() {
    var dps = [];
    var cmdQueue = [];
    pollPuffDatapoints.forEach(dp => {
        let d = dp;
        if (d.length > 1) d = d.substr(0, 1);
        dps.push(d);
        cmdQueue.push(cb => {
            cmdGet(dp, cb);
        });
    });
    async.series(cmdQueue, (err, res) => {
        var obj;
        if (!err) {
            obj = {};
            dps.forEach((dp, index) => {
                if (dp === 'P' && res[index] !== '?' && !running) {
                    running = true;
                } else if (dp === 'P' && res[index] === '?' && running) {
                    running = false;
                }
                obj[dp] = res[index];
            });
            ipcSend('values', obj);
        }

        if (++pc > 50) {
            pc = 0;
            setTimeout(pollSettings, 25);
        } else {
            setTimeout(pollPuff, 25);
        }

    });
}

var pollSettingsDatapoints = ['TSP', 'PSP', 'R', 'B'];


function pollSettings() {
    var dps = [];
    var cmdQueue = [];
    pollSettingsDatapoints.forEach(dp => {
        if (running && dp === 'B') return;
        dps.push(dp.substr(0, 1));
        cmdQueue.push(cb => {
            let d = dp;
            let m;
            if (dp.length > 1) {
                d = dp.substr(0, 1);
                m = dp.substr(1, dp.length);
            }
            cmdGet(d, m, (err, res) => {
                cb(err, res);
            });
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
        setTimeout(pollPuff, 100);
    });
}

function pollInfos() {
    var pollInfosDatapoints = [
        ['E', 'MFR'],
        ['E', 'PRODUCT'],
        ['B', 'CELLS'],
        ['E', 'FEATURE 1'],
        ['E', 'FEATURE 2'],
        ['E', 'FEATURE 3'],
        ['E', 'FEATURE 4'],
        ['E', 'FEATURE 5'],
        ['E', 'FEATURE 6'],
        ['E', 'FEATURE 7'],
        ['E', 'FEATURE 8'],
        ['E', 'FEATURE 9']
    ];
    var dps = [];
    var cmdQueue = [];
    pollInfosDatapoints.forEach(dp => {
        dps.push(dp);
        cmdQueue.push(cb => {
            cmdGet(dp[0], dp[1], (err, res) => {
                setTimeout(() => {
                    cb(err, res);
                }, 75)
            });
        });
    });
    async.series(cmdQueue, (err, res) => {
        if (!err) {
            let obj = {'FEATURES':[]};
            dps.forEach((dp, index) => {
                if (dp[1].match(/FEATURE/)) {
                    if (res[index] !== '?') obj.FEATURES.push(res[index]);
                } else {
                    obj[dp[1]] = res[index];
                }
            });
            ipcSend('infos', obj);
        }
        setTimeout(pollSettings, 100);
    });
}
