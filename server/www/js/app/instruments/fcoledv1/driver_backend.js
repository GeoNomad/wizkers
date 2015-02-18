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
 * Browser-side Parser for FriedCircuits OLED Backpack.
 *
 * This Browser-side parser is used when running as a Chrome or Cordova app.
 *
 * Differences with server-side parser:
 *   - None
 * 
 * @author Edouard Lafargue, ed@lafargue.name
 */

define(function (require) {
    "use strict";

    var Backbone = require('backbone'),
        Serialport = require('serialport'),
        serialConnection = require('connections_serial'),
        abutils = require('app/lib/abutils');

    var parser = function (socket) {


        /////////////
        // Private methods
        /////////////

        var socket = socket;

        var self = this,
            port = null,
            port_close_requested = false,
            isopen = false;

        var portSettings = function () {
            return {
                baudRate: 115200,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                dtr: true,
                flowControl: false,
                // We get non-printable characters on some outputs, so
                // we have to make sure we use "binary" encoding below,
                // otherwise the parser will assume Unicode and mess up the
                // values.
                parser: Serialport.parsers.readline('\n'),
            }
        };

        // Format can act on incoming data from the counter, and then
        // forwards the data to the chromeSocket/cordovaSocket through
        // a 'data' event.
        var format = function (data) {
            
            // Remove any carriage return
            data = data.replace('\n','');
            var fields = {};
            try {
                fields = JSON.parse(data);
            } catch (e) {
                console.log("Error: cannot parse logger data : " + e + " - " + data);
            }
            self.trigger('data', fields);
        };

        // Status returns an object that is concatenated with the
        // global server status
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

        // Called when the app needs a unique identifier.
        // this is a standardized call across all drivers.
        //
        // Returns the Geiger counter GUID.
        this.sendUniqueID = function () {
            self.trigger('data', {
                uniqueID: '00000000 (n.a.)'
            });
        };

        this.isStreaming = function () {
            return true;
        };
        
        this.startLiveStream = function() {
        };
        
        this.stopLiveStream = function() {
        };

        // output should return a string, and is used to format
        // the data that is sent on the serial port, coming from the
        // HTML interface.
        this.output = function (data) {
            port.write(data + '\n');
        };

    }

    _.extend(parser.prototype, Backbone.Events);
    return parser;
});
