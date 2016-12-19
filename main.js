const electron = require('electron')
// Module to control application life.
const app = electron.app
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow

const path = require('path')
const url = require('url')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 800, height: 480})

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Open the DevTools.
  mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
    port.close();
    process.exit(0);
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
    app.quit()

});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow()
  }
});

var fs = require('fs');

var devs = (fs.readdirSync('/dev'));
var sport;
for (var i = 0; i < devs.length; i++) {
  if (devs[i].match(/tty\.usbmodem[0-9A-Z]+/)) {
    sport = '/dev/' + devs[i];
    break;
  }
}

var SerialPort = require('serialport');
var port = new SerialPort(sport);

var connected = false;
var callbacks = {};

port.on('open', function () {
  connected = true;
  poll();

});

port.on('close', () => {
  connected = false;
});

// open errors will be emitted as an error event
port.on('error', function(err) {
  console.log('Error: ', err.message);
});

port.on('data', function (data) {
  var [datapoint, value] = data.toString().replace(/\n$/, '').split('=');
  if (callbacks[datapoint]) {
    let cb = callbacks[datapoint];
    delete callbacks[datapoint];
    cb(null, value);
  } else if (callbacks[datapoint + 'SP']) {
    let cb = callbacks[datapoint + 'SP'];
    delete callbacks[datapoint];
    cb(null, value);
  }
});

function getValue(val, cb) {
  port.write(val + '=GET\n', function (err) {
    if (err) {
      cb(err.message);
    } else {
      callbacks[val] = cb;
    }
  });
}

function getSP(val, cb) {
  port.write(val + '=GET SP\n', function (err) {
    if (err) {
      cb(err.message);
    } else {
      callbacks[val + 'SP'] = cb;
    }
  });
}

var ipc = require('electron').ipcMain;

var pc = 0;

function poll() {
  getValue('T', (err, t) => {
    getValue('P', (err, p) => {
        if (!mainWindow) process.exit(0);
        mainWindow.webContents.send('values', {t:t, p:p});
        pc++;
        if (pc > 50 && p.match(/W/)) {
          pc = 0;
            getSP('T', (err, tsp) => {
              getSP('P', (err, psp) => {
                if (!mainWindow) process.exit(0);
                mainWindow.webContents.send('setpoints', {t:tsp, p:psp});
                setTimeout(poll, 20);
              });
            });
        } else {
          setTimeout(poll, 20);
        }

    });
  });
}

ipc.on('setp', function (e, val) {
  port.write('P=' + val + 'W\n');
});

ipc.on('sett', function (e, val) {
  port.write('T=' + val + '\n');
});
