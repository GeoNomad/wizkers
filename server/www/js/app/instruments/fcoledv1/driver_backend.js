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

define(function(require) {
    "use strict";

    var Serialport = require('serialport');
    
    var parser = function(socket) {
        
        var socket = socket;
        
        this.portSettings = function() {
            return  {
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

        // Called when the app needs a unique identifier.
        // this is a standardized call across all drivers.
        //
        // Returns the Geiger counter GUID.
        this.sendUniqueID = function() {
            socket.trigger('uniqueID','00000000 (n.a.)');
        };
        
        // Format can act on incoming data from the counter, and then
        // forwards the data to the app through a 'serialEvent' event.
        this.format = function(data) {

            // Remove any carriage return
            data = data.replace('\n','');
            var fields = {};
            try {
                fields = JSON.parse(data);
            } catch (e) {
                console.log("Error: cannot parse logger data : " + e + " - " + data);
            }
            socket.sendDataToFrontend(fields);
        };
    
        // output should return a string, and is used to format
        // the data that is sent on the serial port, coming from the
        // HTML interface.
        this.output = function(data) {
            return data + '\n';
        };
        
        // Status returns an object that is concatenated with the
        // global server status
        this.status = function() {
            return { };
        };
        
        this.isStreaming = function() {
            return true;
        };
    
        // Not used
        this.onOpen =  function(success) {
            console.log("FriedCircuits OLED Driver: got a port open signal");
        };
    
        // Not used
        this.onClose = function(success) {
            console.log("FriedCircuits OLED driver: got a port close signal");
        };

    }
    
    return parser;
});