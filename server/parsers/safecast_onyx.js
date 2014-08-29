/*
 * A parser for the SafeCast Onyx.
 *
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 *
 * Only works on the current devel branch with json-compliant
 * serial output.
 */

var serialport = require('serialport'),
    SerialPort  = serialport.SerialPort,
    recorder = require('../recorder.js'),
    outputmanager = require('../outputs/outputmanager.js');

module.exports = {
    
    name: "onyx",
    
    // Set a reference to the socket.io socket and port
    socket: null,
    port: null,
    uidrequested: false,
    streaming: false,
    livePoller: null,
    
    setPortRef: function(s) {
        this.port = s;
    },
    setSocketRef: function(s) {
        this.socket = s;
    },
    setRecorderRef: function(s) {
        console.log("DELETE THIS Setting recorder reference.");
    },
    setInstrumentRef: function(i) {
    },

    // How the device is connected on the serial port            
    portSettings: function() {
        return  {
            baudRate: 115200,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            flowControl: false,
            // simply pass each line to our JSON streaming parser
            // Note: the Onyx outputs json with \n at the end, so
            // the default readline parser works fine (it separates on \r)
            parser: serialport.parsers.readline(),
        }
    },
    
    // Called when the HTML app needs a unique identifier.
    // this is a standardized call across all drivers.
    // This particular device does not support this concept, so we
    // always return the same
    sendUniqueID: function() {
        this.uidrequested = true;
        this.port.write(this.output('{ "get": "guid" }'));
    },
    
    isStreaming: function() {
        return this.streaming;
    },
    
    startLiveStream: function(period) {
        var self = this;
        if (!this.streaming) {
            console.log("[Onyx] Starting live data stream");
            this.livePoller = setInterval(function() {
                        self.port.write(self.output('GETCPM'));
                    }, (period) ? period*1000: 1000);
            this.streaming = true;
        }
    },
    
    stopLiveStream: function(period) {
        if (this.streaming) {
            console.log("[Onyx] Stopping live data stream");
            clearInterval(this.livePoller);
            this.streaming = false;
        }
    },
    
    format: function(data, recording) {
        // All commands now return JSON
        try {
            //console.log(Hexdump.dump(data.substr(0,5)));
            if (data.substr(0,2) == "\n>")
                return;
            if (data.length < 2)
                return;
            var response = JSON.parse(data);
            if (this.uidrequested && response.guid != undefined) {
                this.socket.emit('uniqueID',response.guid);
                this.uidrequested = false;
            } else {
                // Send the response to the front-end
                this.socket.emit('serialEvent', response);
                // Send our response to the recorder and the output manager
                // as well
                recorder.record(response);
                outputmanager.output(response);
            }
        } catch (err) {
            console.log('Not able to parse JSON response from device:\n' + data);
            console.log('Error code: ' + err);
        }
    },
    
    output: function(data) {
        return data + '\n\n';
    }

};
