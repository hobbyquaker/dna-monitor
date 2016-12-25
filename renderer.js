const ipc =         require('electron').ipcRenderer;
const $ = jQuery =  require('jquery');
const Highcharts =  require('highcharts');
require('highcharts/themes/gray.js')(Highcharts);

let running;
let degreeunit;
let start;
let startDistinct;
let maxPower;
let maxTemperature;
let riseTime;
let riseTimeDistinct;
let elapsed;
let elapsedDistinct;

let visibleAxis = ['P', 'T'];

let setpVal;
let setpChange;
let settVal;
let settChange;
let degreeVal;
let degreeChange;
let series;
let chart;
let retainPuffs;

let axisNames = {
    'Current': 'I',
    'Resistance': 'RLIVE',
    'Voltage': 'V',
    'Battery': 'B'
};

ipc.on('retain', (event, data) => {
    retainPuffs = data;
    console.log('retain', data);
});

ipc.on('sport', (event, data) => {
    if (data) {
        $('#error').hide();
    } else {
        $('#error').show();
        $('#tsp').val('');
        $('#psp').val('');
        $('#infos').html('');
        chart.series.forEach(series => {
            series.setData([]);
        });
        chart.redraw();
    }
});

ipc.on('infos', (event, data) => {
    $('#infos').html((data.MFR !== '?' ? data.MFR + ' ' : '') + data.PRODUCT + ', ' + data.CELLS + ' battery cell' + (data.CELLS > 1 ? 's' : '') + ', ' + data.FEATURES.join(', '));
});

function clearChart() {
    chart.series.forEach(series => {
        series.setData([]);
    });
    chart.redraw();
    start = (new Date()).getTime();
    startDistinct = start;
}

ipc.on('values', (event, data) => {
    if (data.P.match(/W/)) {
        if (!running) {
            if (!retainPuffs) {
                clearChart();
            } else {
                if (!start) {
                    start = (new Date()).getTime();
                    startDistinct = start;
                } else {
                    start = (new Date()).getTime() - (elapsed * 1000);
                    startDistinct = (new Date()).getTime();
                }

            }
            running = true;
            setpChange = false;
            settChange = false;
            degreeChange = false;
            setpVal = null;
            settVal = null;
            degreeVal = null;
            maxPower = 0;
            maxTemperature = 0;
            riseTime = 0;
            $('#elapsed').html('');
            $('#maxPower').html('');
            $('#maxTemperature').html('');
            $('#riseTime').html('');
            $('#elapsed').html('');
            $('#maxPower').html('');
            $('#maxTemperature').html('');
            $('#riseTime').html('');
        }

        if (running && !degreeunit && data.T.match(/C/)) {
            chart.yAxis[0].update({
                labels: {
                    format: '{value}°C'
                }
            });
            degreeunit = true;

        } else if (running && !degreeunit && data.T.match(/F/)) {
            chart.yAxis[0].update({
                labels: {
                    format: '{value}°F'
                }
            });
            degreeunit = true;
        }

        let t = parseFloat(data.T);
        let p = parseFloat(data.P);
        elapsed = ((new Date()).getTime() - start) / 1000;
        elapsedDistinct = ((new Date()).getTime() - startDistinct) / 1000;
        let fifo = retainPuffs && (chart.series[0].data.length > 500);
        chart.series[0].addPoint([elapsed, t], true, fifo, false);
        chart.series[1].addPoint([elapsed, p], true, fifo, false);
        if (visibleAxis.indexOf('V') !== -1) {
            let v = parseFloat(data.V);
            chart.series[2].addPoint([elapsed, v], true, fifo, false);
        }
        if (visibleAxis.indexOf('B') !== -1) {
            let b = parseFloat(data.B);
            chart.series[3].addPoint([elapsed, b], true, fifo, false);
        }
        if (visibleAxis.indexOf('I') !== -1) {
            let i = parseFloat(data.I);
            chart.series[4].addPoint([elapsed, i], true, fifo, false);
        }
        if (visibleAxis.indexOf('RLIVE') !== -1) {
            let r = parseFloat(data.R);
            chart.series[5].addPoint([elapsed, r], true, fifo, false);
        }
        if (t > maxTemperature) maxTemperature = t;
        if (p > maxPower) maxPower = p;
        if (riseTime === 0 && $('#tsp').val() > 0 && t > $('#tsp').val()) {
            riseTime = elapsedDistinct;
        }
    } else {
        if (running) {
            $('#elapsed').html(elapsedDistinct + ' s');
            $('#maxPower').html(maxPower + ' W');
            $('#maxTemperature').html(maxTemperature + '°' + $('#degreeunit').val());
            $('#riseTime').html(riseTime + ' s');
        }
        running = false;
        degreeunit = false;
    }
});

ipc.on('setpoints', (event, data) => {
    let p = parseFloat(data.P.replace('W', ''));
    if (setpVal !== p) {
        setpVal = p;
        if (!setpChange) $('#psp').val(setpVal);
    }

    let t = '';
    let d = 'OFF';

    if (data.T.match(/C/)) {
        t = parseFloat(data.T.replace('C', ''));
        d = 'C';
    } else if (data.T.match(/F/)) {
        t = parseFloat(data.T.replace('F', ''));
        d = 'F';
    }

    if (settVal !== t) {
        settVal = t;
        if (!settChange) $('#tsp').val(settVal);
    }
    if (degreeVal !== d) {
        degreeVal = d;
        if (!degreeChange) $('#degreeunit').val(d);
    }

    if (data.B) {
        let b = parseFloat(data.B);
        $('#battery').html(b + ' V');
    }

    if (data.R) {
        let r = parseFloat(data.R);
        $('#resistance').html(r + ' Ohm');
    }

});

ipc.on('csv', (event) => {
    let obj = {};
    chart.series.forEach((serie, sidx) => {
        serie.data.forEach(point => {
            if (!obj[point.x]) obj[point.x] = {};
            obj[point.x][serie.name] = point.y;
        });
    });

    ipc.send('csvdata', obj);
});

$('#setp').click(() => {
    ipc.send('setp', $('#psp').val());
    setTimeout(() => {
        setpChange = false;
    }, 100);
});
$('#sett').click(() => {
    let unit = $('#degreeunit').val();
    if (unit === 'OFF') {
        ipc.send('sett', 'MONITOR');
    } else {
        ipc.send('sett', $('#tsp').val() + unit);
    }
    setTimeout(() => {
        settChange = false;
    }, 100);
});

$('#psp').change(() => {
    setpChange = $('#psp').val() !== setpVal;
});

$('#psp').focus(() => {
    setpChange = $('#psp').val() !== setpVal;
});

$('#tsp').change(() => {
    settChange = $('#tsp').val() !== settVal;
});

$('#tsp').focus(() => {
    settChange = $('#tsp').val() !== settVal;
});

$('#degreeunit').change(() => {
    degreeChange = $('#degreeunit').val() !== degreeVal;
});

$('#degreeunit').focus(() => {
    degreeChange = $('#degreeunit').val() !== degreeVal;
});

$('#fire').click(() => {
    ipc.send('fire', $('#duration').val());
});


$(document).ready(() => {
    chart = new Highcharts.Chart({
        chart: {
            renderTo: 'chart',
            type: 'line'
        },
        credits: {
            enabled: false
        },
        legend: {
            enabled: true,
            align: 'left'
        },
        title: {text: ''},
        xAxis: {
        },
        yAxis: [
            { // 0 Temperature
                minRange: 120,
                labels: {
                    format: '{value}°C',
                    style: {
                        color: Highcharts.getOptions().colors[2]
                    }
                },
                title: {
                    text: '',
                    style: {
                        color: Highcharts.getOptions().colors[2]
                    }
                },
                opposite: false
            },
            { // 1 Power
                minRange: 20,
                labels: {
                    format: '{value} W',
                    style: {
                        color: Highcharts.getOptions().colors[3]
                    }
                },
                title: {
                    text: '',
                    style: {
                        color: Highcharts.getOptions().colors[3]
                    }
                },
                opposite: true
            },
            { // 2 Voltage
                labels: {
                    format: '{value} V',
                    style: {
                        color: Highcharts.getOptions().colors[1]
                    }
                },
                title: {
                    text: '',
                    style: {
                        color: Highcharts.getOptions().colors[1]
                    }
                },
                opposite: true
            },
            { // 3 Battery voltage
                labels: {
                    format: '{value} V',
                    style: {
                        color: Highcharts.getOptions().colors[0]
                    }
                },
                title: {
                    text: '',
                    style: {
                        color: Highcharts.getOptions().colors[0]
                    }
                },
                opposite: true
            },
            { // 4 Current
                labels: {
                    format: '{value} A',
                    style: {
                        color: Highcharts.getOptions().colors[6]
                    }
                },
                title: {
                    text: '',
                    style: {
                        color: Highcharts.getOptions().colors[6]
                    }
                },
                opposite: true
            },
            { // 5 R LIVE
                labels: {
                    format: '{value} Ohm',
                    style: {
                        color: Highcharts.getOptions().colors[4]
                    }
                },
                title: {
                    text: '',
                    style: {
                        color: Highcharts.getOptions().colors[4]
                    }
                },
                opposite: true
            }
        ],
        plotOptions: {
            line: {
                marker: {
                    enabled: false
                }
            }
        },
        series: [
            {
                name: 'Temperature',
                data: [],
                yAxis: 0,
                color: Highcharts.getOptions().colors[2],
                events: {
                    legendItemClick: function () {
                        return false;
                    }
                }
            },
            {
                name: 'Power',
                data: [],
                yAxis: 1,
                color: Highcharts.getOptions().colors[3],
                events: {
                    legendItemClick: function () {
                        return false;
                    }
                }
            },
            {
                name: 'Voltage',
                visible: false,
                data: [],
                yAxis: 2,
                color: Highcharts.getOptions().colors[1],
                events: {
                    legendItemClick: function () {
                        toggleAxis(this.name, !this.visible);
                    }
                }
            },
            {
                name: 'Battery',
                visible: false,
                data: [],
                yAxis: 3,
                color: Highcharts.getOptions().colors[0],
                events: {
                    legendItemClick: function () {
                        toggleAxis(this.name, !this.visible);
                    }
                }
            },
            {
                name: 'Current',
                visible: false,
                data: [],
                yAxis: 4,
                color: Highcharts.getOptions().colors[6],
                events: {
                    legendItemClick: function () {
                        toggleAxis(this.name, !this.visible);
                    }
                }
            },
            {
                name: 'Resistance',
                visible: false,
                data: [],
                yAxis: 5,
                color: Highcharts.getOptions().colors[4],
                events: {
                    legendItemClick: function () {
                        toggleAxis(this.name, !this.visible);
                    }
                }
            }

        ]
    });

    function toggleAxis(name, visible) {
        name = axisNames[name];
        if (visible && visibleAxis.indexOf(name) === -1) {
            visibleAxis.push(name);
        } else if (!visible && visibleAxis.indexOf(name) !== -1) {
            visibleAxis.splice(visibleAxis.indexOf(name), 1);
        }
        ipc.send('datapoints', visibleAxis);
    }

    ipc.on('series', (event, data) => {
        chart.series.forEach(serie => {
            if (data.indexOf(axisNames[serie.name]) !== -1) {
                serie.show();
            }
        });
    });


});
