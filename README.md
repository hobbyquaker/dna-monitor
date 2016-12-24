# dna-monitor

> A simple macOS device monitoring tool for e-cigarettes with Evolv DNA chipset 

![Screenshot](screenshot.png "Screenshot")


This tool can't - and will never - replace the Escribe software, it's just the device-monitoring part and still work in 
progress.


### Download

[dna-monitor.zip](https://github.com/hobbyquaker/dna-monitor/releases/latest)


### Usage

Connect your DNA Device to your Mac, start the Application, vape on.


### Todo

* [x] Support Degree Farenheit
* [x] Catch errors if no serialport available
* [x] Vertical resize of chart on window resizing
* [ ] Persist settings
* [ ] Menu
* [ ] CSV export
* [ ] Option to keep data of preceding puffs
* [x] Show last puffs duration and max temperature
* [ ] Build job with automatic tagging, electron-packager and github release
* [x] Show more values: Battery Voltage
* [x] Show more values: Current
* [x] Show more values: Resistance
* [x] Show more values: Voltage
* [ ] Show more values: Device temperature
* [ ] Show more values: Room temperature
* [ ] Show more stats: Max battery voltage drop
* [x] Show more Infos: Device manufactor, type, ...
* [x] Show more Infos: Cold resistance
* [x] Show more Infos: Battery voltage
* [ ] Show current profile
* [ ] Change current profile
* [x] Hit fire button
* [ ] App icon
* [ ] Linux support


### Serial commands

If you want to build your own software that communicates with DNA chipsets via the serial interface this could be 
helpful: https://github.com/hobbyquaker/dna-commands


### Credits

This software uses [Highcharts](http://www.highcharts.com/) which is free for non-commercial use.


### License

Copyright (c) Sebastian Raff <hq@ccu.io> (https://github.com/hobbyquaker)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish and/or distribute copies of the Software, 
and to permit persons to whom the Software is furnished to do so, subject to the 
following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. 
