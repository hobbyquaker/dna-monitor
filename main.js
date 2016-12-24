const electron =            require('electron');
const app =                 electron.app;
const Menu =                electron.Menu;
const ipc =                 electron.ipcMain;
const BrowserWindow =       electron.BrowserWindow;
const dialog =              electron.dialog;

const storage =             require('electron-json-storage');
const windowStateKeeper =   require('electron-window-state');
const isDev =               require('electron-is-dev');

const path =                require('path');
const url =                 require('url');
const fs =                  require('fs');
const async =               require('async');
const SerialPort =          require('serialport');

let mainWindow;
let serialConsoleWindow;
let statisticsWindow;
let debug;
let port = null;
let callbacks = {};
let running;
let pc = 50;
let features;

let pollPuffDatapoints =  ['T', 'P'];
let pollSettingsDatapoints = ['TSP', 'PSP', 'R', 'B'];
let pollInfosDatapoints = [
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

if (isDev) {
    debug = console.log;
} else {
    debug = function () {};
}

function createWindow () {

    let mainWindowState = windowStateKeeper({
        defaultWidth: 860,
        defaultHeight: 540
    });

    let devWindowState = {
        width: 1280,
        height: 540
    };

    let windowState = isDev ? devWindowState : mainWindowState;

    mainWindow = new BrowserWindow(windowState);

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
    }));



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

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

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

function findport(cb) {
    let devs = (fs.readdirSync('/dev'));
    let sport;
    for (let i = 0; i < devs.length; i++) {
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
        setTimeout(pollInfos, 50);

    });

    port.on('disconnect', () => {
        debug('disconnect', sport);
        port = null;
        callbacks = {};
        mainWindow.webContents.send('sport', false);
        setTimeout(() => {
            findport(start);
        }, 500);
    });

    port.on('data', data => {
        let [datapoint, value] = data.toString().replace(/\r\n$/, '').split('=');
        if (callbacks[datapoint]) {
            let cb = callbacks[datapoint];
            delete callbacks[datapoint];
            setTimeout(() => {
                cb(null, value);
            }, 4);
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
    let s = dp + '=GET';
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
                    }, 12);
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
        app.quit();
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






ipc.on('datapoints', (e, val) => {
    storage.set('datapoints', val);
    pollPuffDatapoints = val;
});

function pollPuff() {
    let dps = [];
    let cmdQueue = [];
    pollPuffDatapoints.forEach(dp => {
        let d = dp;
        if (d.length > 1) d = d.substr(0, 1);
        dps.push(d);
        cmdQueue.push(cb => {
            cmdGet(dp, cb);
        });
    });
    async.series(cmdQueue, (err, res) => {
        let obj;
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
            setTimeout(pollSettings, 15);
        } else {
            setTimeout(pollPuff, 15);
        }

    });
}




function pollSettings() {
    let dps = [];
    let cmdQueue = [];
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
        setTimeout(pollPuff, 5);
    });
}

function pollInfos() {
    let dps = [];
    let cmdQueue = [];
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
            if (obj.FEATURES.indexOf('FG') !== -1) {
                //pollSettingsDatapoints.push('CGET%');
            }
        }
        setTimeout(pollSettings, 100);
    });
}


var menuTemplate = [
    {

        label: 'Tools',
        submenu: [
            {
                role: 'statistics',
                label: 'Statistics',
                click() { statistics(); }
            },
            {
                role: 'serial console',
                label: 'Serial Console',
                click() { serialConsole(); }
            },
            {
                role: 'export',
                label: 'Export csv',
                click() { exportCsv(); }
            }
        ]
    },
    {
        label: 'Settings',
        submenu: [
            {
                label: 'Clear chart on every puff',
                type: 'checkbox',
                checked: true
            }
        ]
    }

];
if (process.platform === 'darwin') {
    menuTemplate.unshift({
        label: 'DNA Monitor',
        submenu: [
            {
                role: 'about',
                label: 'About DNA Monitor'
            },
            {
                type: 'separator'
            },
            {
                role: 'services',
                submenu: []
            },
            {
                type: 'separator'
            },
            {
                role: 'hide'
            },
            {
                role: 'hideothers'
            },
            {
                role: 'unhide'
            },
            {
                type: 'separator'
            },
            {
                role: 'quit'
            }
        ]
    });

}

function exportCsv() {
    dialog.showSaveDialog(mainWindow, {
        title: 'Export csv',
        filters: [
            {name: 'Comma seperated values', extensions: ['csv']}
        ]
    }, function (filename) {
        debug('export', filename);
    });
}

function serialConsole() {
    serialConsoleWindow = new BrowserWindow({
        width: 600,
        height: 500,
        show: false,
        modal: true,
        parent: mainWindow
    });
    serialConsoleWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'console.html'),
        protocol: 'file:',
        slashes: true
    }));

    serialConsoleWindow.show();
}

function statistics() {
    statisticsWindow = new BrowserWindow({
        width: 600,
        height: 500,
        show: false,
        modal: true,
        parent: mainWindow
    });
    statisticsWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'statistics.html'),
        protocol: 'file:',
        slashes: true
    }));
    statisticsWindow.show();

}