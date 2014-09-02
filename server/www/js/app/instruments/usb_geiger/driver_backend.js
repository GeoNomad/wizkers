/*
 * Browser-side Parser for IMI Onyx devices.
 *
 * This Browser-side parser is used when running as a Chrome or Cordova app.
 *
 * Differences with server-side parser:
 *   - No recording support yet
 * 
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 */

define(function(require) {
    "use strict";

    var Serialport = require('serialport');
    
    var parser = function(socket) {
        
        var socket = socket;
        var livePoller = null; // Reference to the live streaming poller
        var streaming = true;
        
        this.portSettings = function() {
            return  {
                baudRate: 115200,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                dtr: false,
                flowControl: false,
                // We get non-printable characters on some outputs, so
                // we have to make sure we use "binary" encoding below,
                // otherwise the parser will assume Unicode and mess up the
                // values.
                parser: Serialport.parsers.readline(),
            }
        };

        // Called when the app needs a unique identifier.
        // this is a standardized call across all drivers.
        //
        // Returns the Geiger counter GUID.
        this.sendUniqueID = function() {
            this.uidrequested = true;
            socket.emit('controllerCommand','{ "get": "guid" }');
        };
        
        // period in seconds
        this.startLiveStream = function(period) {
            streaming = true;
        };
        
        this.stopLiveStream = function(args) {
            streaming = true;

        };
        
        // Format can act on incoming data from the counter, and then
        // forwards the data to the app through a 'serialEvent' event.
        this.format = function(data, recording) {

            // All commands now return JSON
            try {
                if (data.length < 2)
                    return;
                
                var resp = data.split(':');
                var jsresp = {};
                if (resp[0] == "CPM") {
                    jsresp.cpm = { value: resp[1] };
                } else {
                    jsresp.raw = data;
                }
                socket.trigger('serialEvent', jsresp);
                if (recording)
                    socket.record(response); // 'socket' also records for in-browser impl.
            } catch (err) {
                console.log('Not able to parse data from device:\n' + data + '\n' + err);
            }
            
        };
    
        // output should return a string, and is used to format
        // the data that is sent on the serial port, coming from the
        // HTML interface.
        this.output = function(data) {
            return data + '\n\n';
        };
        
        // Status returns an object that is concatenated with the
        // global server status
        this.status = function() {
            return { tcpserverconnect: false };
        };
    
        // Not used
        this.onOpen =  function(success) {
            console.log("Onyx in-browser Driver: got a port open signal");
        };
    
        // Not used
        this.onClose = function(success) {
            console.log("Onyx in-browser Driver: got a port close signal");
        };

    }
    
    return parser;
});