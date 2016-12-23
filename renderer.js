const ipc = require('electron').ipcRenderer;
const $ = jQuery = require('jquery');
const Highcharts = require('highcharts');
require('highcharts/themes/gray.js')(Highcharts);


ipc.on('sport', function (event, data) {
    if (data) {
        $('#error').hide();
    } else {
        $('#error').show();
        $('#tsp').val('');
        $('#psp').val('');
        $('#infos').html('');
        chart.series[0].setData([]);
        chart.series[1].setData([]);
        chart.redraw();
    }
});

var running;
var degreeunit;
var start;
var maxPower;
var maxTemperature;
var riseTime;
var elapsed;

ipc.on('infos', (event, data) => {
    $('#infos').html((data.MFR !== '?' ? data.MFR + ' ' : '') + data.PRODUCT + ', ' + data.CELLS + ' battery cell' + (data.CELLS > 1 ? 's' : '') + ', ' + data.FEATURES.join(', '));
});

ipc.on('values', (event, data) => {
    if (data.P.match(/W/)) {
        if (!running) {
            chart.series[0].setData([]);
            chart.series[1].setData([]);
            chart.redraw();
            start = (new Date()).getTime();
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

        var t = parseFloat(data.T.replace('C', ''));
        var p = parseFloat(data.P.replace('W', ''));
        elapsed = ((new Date()).getTime() - start) / 1000;
        chart.series[0].addPoint([elapsed, t], true, false, false);
        chart.series[1].addPoint([elapsed, p], true, false, false);
        if (t > maxTemperature) maxTemperature = t;
        if (p > maxPower) maxPower = p;
        if (riseTime === 0 && $('#tsp').val() > 0 && t > $('#tsp').val()) {
            riseTime = elapsed;
        }
    } else {
        if (running) {
            $('#elapsed').html(elapsed + ' s');
            $('#maxPower').html(maxPower + ' W');
            $('#maxTemperature').html(maxTemperature + '°' + $('#degreeunit').val());
            $('#riseTime').html(riseTime + ' s');
        }
        running = false;
        degreeunit = false;
    }
});

var setpVal;
var setpChange;
var settVal;
var settChange;
var degreeVal;
var degreeChange;

ipc.on('setpoints', (event, data) => {
    var p = parseFloat(data.P.replace('W', ''));
    if (setpVal !== p) {
        setpVal = p;
        if (!setpChange) $('#psp').val(setpVal);
    }

    var t = '';
    var d = 'OFF';

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

});

$('#setp').click(() => {
    ipc.send('setp', $('#psp').val());
    setTimeout(() => {
        setpChange = false;
    }, 100);
});
$('#sett').click(() => {
    var unit = $('#degreeunit').val();
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

var series;
var chart;
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
            enabled: false
        },
        title: {text: ''},
        xAxis: {
            min: 0
        },
        yAxis: [{ // Primary yAxis
            minRange: 120,
            labels: {
                format: '{value}°C',
                style: {
                    color: Highcharts.getOptions().colors[2]
                }
            },
            title: {
                text: 'Temperature',
                style: {
                    color: Highcharts.getOptions().colors[2]
                }
            },
            opposite: false
        },
            { // Primary yAxis
                minRange: 20,
                labels: {
                    format: '{value} W',
                    style: {
                        color: Highcharts.getOptions().colors[3]
                    }
                },
                title: {
                    text: 'Power',
                    style: {
                        color: Highcharts.getOptions().colors[3]
                    }
                },
                opposite: true
            }],
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
                color: Highcharts.getOptions().colors[2]
            },
            {
                name: 'Power',
                data: [],
                yAxis: 1,
                color: Highcharts.getOptions().colors[3]
            }
        ]
    });
});


