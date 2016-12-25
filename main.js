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
let menu;
let debug;
let port = null;
let callbacks = {};
let running;
let pc = 50;
let features;
let pollPause;
let serialConsoleActive;
let retainPuffs;
let csvFile;

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

let pollStatisticsDatapoints = [
    'LASTENERGY',
    'LASTPOWER',
    'LASTTEMP',
    'LASTPOWER',
    'LASTPEAKTEMP',
    'PUFFS',
    'DEVICE PUFFS',
    'TEMP PUFFS',
    'DEVICE TEMP PUFFS',
    'RESETS',
    'ENERGY',
    'MEAN ENERGY',
    'SD ENERGY',
    'DEVICE ENERGY',
    'DEVICE MEAN ENERGY',
    'DEVICE SD ENERGY',
    'POWER',
    'MEAN POWER',
    'SD POWER',
    'DEVICE POWER',
    'DEVICE MEAN POWER',
    'DEVICE SD POWER',
    'TEMP',
    'MEAN TEMP',
    'SD TEMP',
    'DEVICE TEMP',
    'DEVICE MEAN TEMP',
    'DEVICE SD TEMP',
    'PEAK TEMP',
    'MEAN PEAK TEMP',
    'SD PEAK TEMP',
    'DEVICE PEAK TEMP',
    'DEVICE MEAN PEAK TEMP',
    'DEVICE SD PEAK TEMP',
    'TIME',
    'MEAN TIME',
    'SD TIME',
    'DEVICE TIME',
    'DEVICE MEAN TIME',
    'DEVICE SD TIME',
    'LAST TIME'
];

let menuItemRetain;
let menuItemStatistics;
let menuItemConsole;
let menuItemCsv;
let menuTemplate = [
    {

        label: 'Tools',
        submenu: [
            {
                role: 'statistics',
                label: 'Statistics',
                enabled: false,
                click() { statistics(); }
            },
            {
                role: 'export',
                label: 'Export csv',
                enabled: false,
                click() { exportCsv(); }
            },
            {
                role: 'serial console',
                label: 'Serial Console',
                enabled: false,
                click() { serialConsole(); }
            }
        ]
    },
    {
        label: 'Settings',
        submenu: [
            {
                label: 'Clear chart on every puff',
                type: 'checkbox',
                checked: true,
                click(menuItem) {
                    retainPuffs = !menuItem.checked;
                    storage.set('retain', retainPuffs);
                    ipcSend('retain', retainPuffs);
                }
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

    menu = Menu.buildFromTemplate(menuTemplate);

    if (process.platform === 'darwin') {
        menuItemStatistics =    menu.items[1].submenu.items[0];
        menuItemCsv =           menu.items[1].submenu.items[1];
        menuItemConsole =       menu.items[1].submenu.items[2];
        menuItemRetain =        menu.items[2].submenu.items[0];
    } else {
        menuItemStatistics =    menu.items[0].submenu.items[0];
        menuItemCsv =           menu.items[0].submenu.items[1];
        menuItemConsole =       menu.items[0].submenu.items[2];
        menuItemRetain =        menu.items[1].submenu.items[0];
    }

    Menu.setApplicationMenu(menu);

    // let's go!
    setTimeout(() => {
        findport(start);


        storage.get('retain', (err, data) => {
            if (!err) {
                retainPuffs = data;
            }
            ipcSend('retain', retainPuffs);

            menuItemRetain.checked = !retainPuffs;
        });

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
        app.quit();
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

    port.on('error', (err) => {
        debug(err.message);
        //port = null;
        callbacks = {};
        dialog.showMessageBox({
            type: 'error',
            message: err.message
        }, () => {
            app.quit();
        });
    });

    port.on('open', () => {
        debug('opened', sport);
        mainWindow.webContents.send('sport', true);
        setTimeout(pollInfos, 50);
        menuItemStatistics.enabled =    true;
        menuItemConsole.enabled =       true;
    });

    port.on('disconnect', () => {
        debug('disconnect', sport);
        menuItemStatistics.enabled =    false;
        menuItemRetain.enabled =        false;
        menuItemConsole.enabled =       false;
        menuItemCsv.enabled =           false;
        port = null;
        callbacks = {};
        mainWindow.webContents.send('sport', false);
        setTimeout(() => {
            findport(start);
        }, 500);
    });

    port.on('data', data => {

        if (!serialConsoleActive) {
            let [datapoint, value] = data.toString().replace(/\r\n$/, '').split('=');
            if (callbacks[datapoint]) {
                let cb = callbacks[datapoint];
                delete callbacks[datapoint];
                setTimeout(() => {
                    cb(null, value);
                }, 4);
            }
        } else {
            serialConsoleWindow.webContents.send('response', data);
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
        //if (port) port.close();
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

ipc.on('cmd', (event, data) => {
    if (port) {
        port.write(data + '\r\n');
    }
});

ipc.on('datapoints', (e, val) => {
    storage.set('datapoints', val);
    pollPuffDatapoints = val;
});

ipc.on('csvdata', function (event, data) {
    debug('received export data', data.length);
    let lines = [['time']];
    let columns = {};
    let i = 1;
    Object.keys(data[Object.keys(data)[0]]).forEach(dp => {
        lines[0].push(dp);
        columns[dp] = i++;
    });
    Object.keys(data).sort().forEach(ts => {
        let line = [ts];
        Object.keys(data[ts]).forEach(dp => {
            if (!columns[dp]) {
                columns[dp] = i++;
                lines[0].push(dp);
            }
            line[columns[dp]] = data[ts][dp];
        });
        lines.push(line);
    });
    lines.forEach((line, index) => {
        lines[index] = line.join(';');
    });
    let csv = lines.join('\r\n');
    debug('write', csvFile);
    fs.writeFile(csvFile, csv);
});


function pollPuff() {
    if (pollPause) return;
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
                    if (!menuItemCsv.enabled) menuItemCsv.enabled = true;

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

function exportCsv() {
    dialog.showSaveDialog(mainWindow, {
        title: 'Export csv',
        filters: [
            {name: 'Comma seperated values', extensions: ['csv']}
        ]
    }, function (filename) {
        debug('export', filename);
        csvFile = filename;
        ipcSend('csv');
    });
}

function serialConsole() {
    pollPause = true;
    serialConsoleActive = true;
    serialConsoleWindow = new BrowserWindow({
        width: 800,
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
    //if (isDev) serialConsoleWindow.webContents.openDevTools();

    serialConsoleWindow.on('closed', () => {
        statisticsWindow = null;
        serialConsoleActive = false;
        pollPause = false;
        pollPuff();
    });
}

function statistics() {
    pollPause = true;
    statisticsWindow = new BrowserWindow({
        width: 700,
        height: 524,
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

    setTimeout(() => {
        pollStatistics(data => {
            statisticsWindow.webContents.send('statistics', data);
        });

    }, 200);

    statisticsWindow.on('closed', () => {
        statisticsWindow = null;
        pollPause = false;
        pollPuff();
    });
}

function pollStatistics(callback) {
    let dps = [];
    let cmdQueue = [];
    pollStatisticsDatapoints.forEach(dp => {
        dps.push('S');
        cmdQueue.push(cb => {

            cmdGet('S', dp, (err, res) => {
                setTimeout(() => {
                    cb(null, res);
                }, 20);

            });
        });
    });
    async.series(cmdQueue, (err, res) => {
        let obj = {};
        if (!err) {
            dps.forEach((dp, index) => {
                obj[pollStatisticsDatapoints[index]] = res[index];
            });
        }
        callback(obj);
    });
}
