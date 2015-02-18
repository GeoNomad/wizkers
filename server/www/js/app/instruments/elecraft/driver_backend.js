/**
 * (c) 2015 Edouard Lafargue, ed@lafargue.name
 *
 * This file is part of Wizkers.
 *
 * Wizkers is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Wizkers is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Wizkers.  If not, see <http://www.gnu.org/licenses/>.
 */

/*
 * Browser-side Parser for Elecraft radios.
 *
 * This parser implements elecraft serial commands for:
 *    - KXPA100
 *    - KX3
 *
 * The Browser-side parser is used when running as a Chrome or Cordova app.
 *
 * Differences with server-side parser:
 *
 *   - 'socket' uses "trigger" to emit events, not "emit"
 *
 *  @author Edouard Lafargue, ed@lafargue.name
 */

define(function (require) {
    "use strict";

    var Serialport = require('serialport'),
        serialConnection = require('connections_serial'),
        Bitmap = require('app/lib/bitmap');


    var parser = function (socket) {

        var socket = socket,
            self = this;
        var serialport = null;
        var livePoller = null; // Reference to the live streaming poller
        var streaming = false,
            port = null,
            port_close_requested = false,
            isopen = false;

        // Because Elecraft radios are not 100% consistent with their protocols,
        // we need to use a pure raw parser for data input, and most of the time,
        // forward that data to a readline parser. But sometimes, we will need the
        // raw input, for instance for Bitmap requests
        var second_parser = Serialport.parsers.readline(';', 'binary');

        // Flag to indicate we are receiving a bitmap
        var waiting_for_bmp = false;
        var bitmap = new Uint8Array(131768);
        var bitmap_index = 0;
        var oldpercent = 0;

        /////////////
        // Private methods
        /////////////

        // Send the bitmap back to the front-end
        function sendBitmap() {
            var bm = new Bitmap(bitmap);
            bm.init();
            var data = bm.getData();
            socket.trigger('serialEvent', {
                screenshot: data,
                width: bm.getWidth(),
                height: bm.getHeight()
            });
        };

        var portSettings = function () {
            return {
                baudRate: 38400,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                dtr: false,
                flowControl: false,
                // We get non-printable characters on some outputs, so
                // we have to make sure we use "binary" encoding below,
                // otherwise the parser will assume Unicode and mess up the
                // values.
                parser: Serialport.parsers.raw,
            }
        };


        // Format can act on incoming data from the radio, and then
        // forwards the data to the app through a 'data' event.
        //
        // data is an ArrayBuffer;
        var format = function (data) {

            if (!waiting_for_bmp) {
                second_parser(self, data); // Careful not to use 'this' since 'this' in this context
                // is chromeSerial !!
                return;
            }

            // We are receiving a Bitmap: we know it is 131638 bytes plus a checksum
            // Copy the data we received into our bitmap array buffer:
            var tmpArray = new Uint8Array(data);
            bitmap.set(tmpArray, bitmap_index);
            bitmap_index += data.byteLength;
            var percent = Math.floor(bitmap_index / 1000 / 132 * 100);
            if (percent != oldpercent) {
                self.trigger('data', {
                    downloading: percent
                });
                oldpercent = percent;
            }
            if (bitmap_index > 131638) {
                waiting_for_bmp = false;
                console.log('[elecraft driver] Got the bitmap!');
                sendBitmap();
            }

        };

        var status = function (stat) {
            console.log('Port status change', stat);
            isopen = stat.portopen;

            if (isopen) {
                // Should run any "onOpen" initialization routine here if
                // necessary.
            } else {
                // We remove the listener so that the serial port can be GC'ed
                if (port_close_requested) {
                    port.off('status', stat);
                    port_close_requested = false;
                }
            }
        };


        function queryRadio() {
            // TODO: follow radio state over here, so that we only query power
            // when the radio transmits, makes much more sense

            // This is queried every second - we stage our queries in order
            // to avoid overloading the radio, not sure that is totally necessary, but
            // it won't hurt

            // Query displays and band (does not update by itself)
            port.write('DB;DS;BN;'); // Query VFO B and VFOA Display

            // Then ask the radio for current figures:
            port.write('PO;'); // Query actual power output

            // And if we have an amp, then we can get a lot more data:
            port.write('^PI;^PF;^PV;^TM;');
            port.write('^PC;^SV;'); // Query voltage & current
        };

        /////////////
        // Public methods
        /////////////

        this.openPort = function (insid) {
            var ins = instrumentManager.getInstrument();
            port = new serialConnection(ins.get('port'), portSettings());
            port.on('data', format);
            port.on('status', status);

        };

        this.closePort = function (data) {
            // We need to remove all listeners otherwise the serial port
            // will never be GC'ed
            port.off('data', format);
            port_close_requested = true;
            port.close();
        }

        this.isOpen = function () {
            return isopen;
        }

        this.getInstrumentId = function (arg) {};

        this.isStreaming = function () {
            return streaming;
        }

        // Called when the app needs a unique identifier.
        // this is a standardized call across all drivers.
        //
        // Returns the Radio serial number.
        this.sendUniqueID = function () {
            this.uidrequested = true;
            try {
                port.write("MN026;ds;MN255;");
            } catch (err) {
                console.log("Error on serial port while requesting Elecraft UID : " + err);
            }
        };

        // period in seconds
        this.startLiveStream = function (period) {
            var self = this;
            if (!streaming) {
                console.log("[Elecraft] Starting live data stream");
                // The radio can do live streaming to an extent, so we definitely will
                // take advantage:
                // K31 enables extended values such as proper BPF reporting
                // AI2 does not send an initial report, so we ask for the initial data
                // before...
                port.write('K31;IF;FA;FB;RG;FW;MG;IS;BN;MD;AI2;');
                livePoller = setInterval(queryRadio.bind(this), (period) ? period * 1000 : 1000);
                streaming = true;
            }
        };

        this.stopLiveStream = function (args) {
            if (streaming) {
                console.log("[Elecraft] Stopping live data stream");
                // Stop live streaming from the radio:
                port.write('AI0;');
                clearInterval(livePoller);
                streaming = false;
            }
        };

        // Called by the serial parser, cannot be private
        this.onDataReady = function (data) {
            if (this.uidrequested && data.substr(0, 5) == "DS@@@") {
                // We have a Unique ID
                console.log("Sending uniqueID message");
                self.trigger('data', {
                    uniqueID: '' + data.substr(5, 5)
                });
                this.uidrequested = false;
                return;
            }
            self.trigger('data', data);
        }

        // output should return a string, and is used to format
        // the data that is sent on the serial port, coming from the
        // HTML interface.
        this.output = function (data) {

            // We want to catch the '#BMP' command to the P3/PX3, because
            // the data returned if not semicolon-terminated at all..
            if (data.indexOf('#BMP') != -1) {
                waiting_for_bmp = true;
                bitmap_index = 0;
                console.log('Got a bitmap request, need to switch parsers for a while!');
            }

            port.write(data);
        };

    }

    // Add event management to our parser, from the Backbone.Events class:
    _.extend(parser.prototype, Backbone.Events);

    return parser;
});